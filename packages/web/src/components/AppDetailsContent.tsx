import { CalendarDays, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { RatingSummary } from "./AppRating";
import AppRating from "./AppRating";
import type { DirectoryApp, DirectoryTag } from "#/lib/directory";
import { formatAppDate } from "#/lib/directory";

export default function AppDetailsContent({
	app,
	ratingSummary,
	tagsBySlug,
	titleTag = "h2",
}: {
	app: DirectoryApp;
	ratingSummary: RatingSummary | undefined;
	tagsBySlug: Map<string, DirectoryTag>;
	titleTag?: "h1" | "h2";
}) {
	const [logoFailed, setLogoFailed] = useState(false);
	const TitleTag = titleTag;

	return (
		<>
			<div className="mb-4 flex items-start gap-3 pr-8 sm:mb-5">
				<div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card-strong)]">
					{!logoFailed ? (
						<img
							src={app.logo}
							alt={`${app.name} logo`}
							className="h-full w-full object-cover"
							loading="lazy"
							onError={() => setLogoFailed(true)}
						/>
					) : (
						<span className="text-base font-semibold text-[var(--ink-strong)]">
							{app.name.slice(0, 1).toUpperCase()}
						</span>
					)}
				</div>

				<div className="min-w-0">
					<TitleTag className="m-0 text-2xl leading-tight font-semibold text-[var(--ink-strong)] sm:text-3xl">
						{app.name}
					</TitleTag>
					<p className="mt-1 mb-0 text-sm text-[var(--ink-soft)]">{app.websiteHost}</p>
				</div>
			</div>

			<p className="mb-5 text-base leading-7 text-[var(--ink-muted)]">
				{app.description}
			</p>

			<div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-soft)]">
				<span className="inline-flex items-center gap-1">
					<CalendarDays size={13} aria-hidden="true" />
					Added {formatAppDate(app.created_at)}
				</span>
				<span className="inline-flex items-center gap-1">
					<RefreshCw size={13} aria-hidden="true" />
					Updated {formatAppDate(app.updated_at)}
				</span>
			</div>

			<div className="mb-5 flex flex-wrap gap-1.5">
				{app.tags.map((tagSlug) => {
					const tagName = tagsBySlug.get(tagSlug)?.name ?? tagSlug;
					return (
						<span
							key={`details-${app.slug}-${tagSlug}`}
							className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-xs font-medium text-[var(--ink-soft)]"
						>
							{tagName}
						</span>
					);
				})}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<a
					href={app.website}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--card-strong)] px-3.5 py-2 text-sm font-semibold text-[var(--ink-strong)] no-underline transition hover:-translate-y-0.5"
				>
					Visit Website
					<ExternalLink size={14} />
				</a>
				{app.apple_app_store ? (
					<a
						href={app.apple_app_store}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-transparent px-3.5 py-2 text-sm font-semibold text-[var(--ink-soft)] no-underline transition hover:text-[var(--ink-strong)]"
					>
						Open in App Store
						<ExternalLink size={14} />
					</a>
				) : null}
			</div>

			<AppRating appSlug={app.slug} summary={ratingSummary} />
		</>
	);
}
