import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";

export type RatingSummary = {
	average: number | null;
	count: number;
	myRating: number | null;
};

const ratingScale = [1, 2, 3, 4, 5];

export default function AppRating({
	appSlug,
	summary,
}: {
	appSlug: string;
	summary: RatingSummary | undefined;
}) {
	const { isSignedIn } = useAuth();
	const upsertRating = useMutation((api as any).appRatings.upsert);
	const [pendingRating, setPendingRating] = useState<number | null>(null);
	const [localRating, setLocalRating] = useState<number | null>(
		summary?.myRating ?? null,
	);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setLocalRating(summary?.myRating ?? null);
	}, [summary?.myRating]);

	const average = summary?.average ?? null;
	const voteCount = summary?.count ?? 0;
	const filledStars = useMemo(() => {
		if (average === null) {
			return 0;
		}
		return Math.round(average);
	}, [average]);

	const formattedAverage =
		average === null
			? "—"
			: Number.isInteger(average)
				? average.toString()
				: average.toFixed(1);
	const voteLabel = `${voteCount} vote${voteCount === 1 ? "" : "s"}`;
	const votesText = voteCount > 0 ? `(${voteLabel})` : "No votes";

	async function handleRate(rating: number) {
		setError(null);
		setPendingRating(rating);
		const previous = localRating;
		setLocalRating(rating);

		try {
			await upsertRating({
				appSlug,
				rating,
			});
		} catch (err) {
			setLocalRating(previous);
			const message = err instanceof Error ? err.message : "Unable to save rating.";
			setError(message);
		} finally {
			setPendingRating(null);
		}
	}

	return (
		<div className="mt-3 border-t border-[var(--line)] pt-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2 text-sm text-[var(--ink-soft)]">
					<div className="flex items-center gap-0.5" aria-hidden="true">
						{ratingScale.map((value) => (
							<span
								key={value}
								className={`text-sm leading-none ${
									value <= filledStars
										? "text-amber-500"
										: "text-[var(--line)]"
								}`}
							>
								★
							</span>
						))}
					</div>
					<span className="font-semibold text-[var(--ink-strong)]">
						{formattedAverage}
					</span>
					<span className="text-xs text-[var(--ink-soft)]">{votesText}</span>
				</div>

				{isSignedIn ? (
					<label className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-soft)]">
						<span>Your rating</span>
						<select
							className="rounded-md border border-[var(--line)] bg-[var(--chip)] px-2 py-1 text-xs font-semibold text-[var(--ink-strong)]"
							value={localRating?.toString() ?? ""}
							disabled={pendingRating !== null}
							onChange={(event) => {
								const next = Number(event.target.value);
								if (!Number.isNaN(next) && ratingScale.includes(next)) {
									void handleRate(next);
								}
							}}
						>
							<option value="">-</option>
							{ratingScale.map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					</label>
				) : null}
			</div>

			{error ? <p className="mt-2 mb-0 text-xs text-red-600">{error}</p> : null}
		</div>
	);
}
