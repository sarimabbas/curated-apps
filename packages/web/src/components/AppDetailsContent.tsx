import { Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { CalendarDays, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { RatingSummary } from "./AppRating";
import AppRating from "./AppRating";
import { formatAppDate, type DirectoryTag } from "#/lib/directory";
import type { DirectoryApp } from "#/lib/directory";

export default function AppDetailsContent({
	app,
	onSelectSimilarApp,
	ratingSummary,
	tagsBySlug,
	titleTag = "h2",
}: {
	app: DirectoryApp;
	onSelectSimilarApp?: (appSlug: string) => void;
	ratingSummary: RatingSummary | undefined;
	tagsBySlug: Map<string, DirectoryTag>;
	titleTag?: "h1" | "h2";
}) {
	const [logoFailed, setLogoFailed] = useState(false);
	const [failedSimilarLogos, setFailedSimilarLogos] = useState<Set<string>>(
		new Set(),
	);
	const [similarApps, setSimilarApps] = useState<
		Array<{
			appSlug: string;
			name: string;
			description: string;
			websiteHost: string;
			logo: string;
		}>
	>([]);
	const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
	const TitleTag = titleTag;
	const findSimilarApps = useAction((api as any).appCatalog.similarApps);
	const markSimilarLogoFailed = (appSlug: string) => {
		setFailedSimilarLogos((current) => {
			if (current.has(appSlug)) {
				return current;
			}
			const next = new Set(current);
			next.add(appSlug);
			return next;
		});
	};
	useEffect(() => {
		let cancelled = false;
		setIsLoadingSimilar(true);

		void findSimilarApps({
			appSlug: app.slug,
			limit: 4,
		})
			.then(
				(matches: Array<{
					appSlug: string;
					name: string;
					description: string;
					websiteHost: string;
					logo: string;
				}>) => {
					if (!cancelled) {
						setSimilarApps(
							matches.filter((entry) => entry.appSlug !== app.slug),
						);
					}
				},
			)
			.catch(() => {
				if (!cancelled) {
					setSimilarApps([]);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoadingSimilar(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [app.slug, findSimilarApps]);

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

			<div className="mt-4 border-t border-[var(--line)] pt-4">
				<p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-[var(--ink-soft)] uppercase">
					Similar apps
				</p>

				{isLoadingSimilar ? (
					<p className="mt-2 mb-0 text-sm text-[var(--ink-soft)]">Finding similar apps…</p>
				) : similarApps.length === 0 ? (
					<p className="mt-2 mb-0 text-sm text-[var(--ink-soft)]">No similar apps yet.</p>
				) : (
					<div className="mt-3 -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pt-1 pb-2">
						{similarApps.map((similar) => {
							const cardBody = (
								<>
									<div className="mb-2 flex items-start gap-2">
										<div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--chip)]">
											{!failedSimilarLogos.has(similar.appSlug) ? (
												<img
													src={similar.logo}
													alt={`${similar.name} logo`}
													className="h-full w-full object-cover"
													loading="lazy"
													onError={() => markSimilarLogoFailed(similar.appSlug)}
												/>
											) : (
												<span className="text-xs font-semibold text-[var(--ink-strong)]">
													{similar.name.slice(0, 1).toUpperCase()}
												</span>
											)}
										</div>
										<div className="min-w-0">
											<p className="m-0 truncate text-sm font-semibold text-[var(--ink-strong)]">
												{similar.name}
											</p>
											<p className="m-0 truncate text-[11px] text-[var(--ink-soft)]">
												{similar.websiteHost}
											</p>
										</div>
									</div>
									<p className="m-0 text-xs leading-5 text-[var(--ink-muted)] line-clamp-2">
										{similar.description}
									</p>
								</>
							);

							const cardClassName =
								"group flex min-h-[150px] min-w-[220px] max-w-[220px] snap-start flex-col rounded-xl border border-[var(--line)] bg-[var(--card-strong)] p-2.5 text-left transition hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--line)_45%,var(--lagoon-deep)_55%)]";
							const key = `similar-${app.slug}-${similar.appSlug}`;

							if (onSelectSimilarApp) {
								return (
									<button
										key={key}
										type="button"
										onClick={() => onSelectSimilarApp(similar.appSlug)}
										className={cardClassName}
									>
										{cardBody}
									</button>
								);
							}

							return (
								<Link
									key={key}
									to="/apps/$slug"
									params={{ slug: similar.appSlug }}
									className={`${cardClassName} no-underline`}
								>
									{cardBody}
								</Link>
							);
						})}
					</div>
				)}
			</div>
		</>
	);
}
