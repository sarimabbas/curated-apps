import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ExternalLink, Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import AppCommandMenu from "../components/AppCommandMenu";
import AppDetailsContent from "../components/AppDetailsContent";
import AppRating, { type RatingSummary } from "../components/AppRating";
import HeaderUser from "../integrations/clerk/header-user";
import {
	createTagsBySlug,
	formatAppDate,
	listDirectoryApps,
	listDirectoryTags,
	type DirectoryApp,
	type DirectoryTag,
} from "#/lib/directory";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "#/lib/site";

const canonical = `${SITE_URL}/`;
const GITHUB_REPO_URL = "https://github.com/sarimabbas/curated-apps";
const SUBMIT_APP_URL =
	"https://github.com/sarimabbas/curated-apps/issues/new?title=App%20submission%3A%20";

type SortOption = "rating" | "alphabetical" | "created" | "updated";
type SortDirection = "asc" | "desc";
type HomeSearch = {
	app?: string;
};

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>): HomeSearch => ({
		app:
			typeof search.app === "string" && search.app.trim().length > 0
				? search.app
				: undefined,
	}),
	head: () => ({
		links: [{ rel: "canonical", href: canonical }],
		meta: [
			{ title: SITE_TITLE },
			{ name: "description", content: SITE_DESCRIPTION },
			{ property: "og:image", content: `${SITE_URL}/images/lagoon-1.svg` },
		],
	}),
	component: Home,
});

function Home() {
	const navigate = Route.useNavigate();
	const { app: selectedAppSlug } = Route.useSearch();
	const [activeTag, setActiveTag] = useState<string>("all");
	const [sortBy, setSortBy] = useState<SortOption>("rating");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

	const apps = useMemo(() => listDirectoryApps(), []);
	const tags = useMemo(
		() => listDirectoryTags().sort((a, b) => a.name.localeCompare(b.name)),
		[],
	);

	const tagsBySlug = useMemo(() => createTagsBySlug(tags), [tags]);

	const tagCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const app of apps) {
			for (const tag of app.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}
		return counts;
	}, [apps]);

	const visibleApps = useMemo(() => {
		if (activeTag === "all") {
			return apps;
		}
		return apps.filter((app) => app.tags.includes(activeTag));
	}, [activeTag, apps]);

	const ratingSummaries = useQuery((api as any).appRatings.getSummaries, {
		appSlugs: apps.map((app) => app.slug),
	});
	const selectedApp = useMemo(
		() => apps.find((app) => app.slug === selectedAppSlug),
		[apps, selectedAppSlug],
	);
	const selectedAppRating = selectedApp
		? ratingSummaries?.[selectedApp.slug]
		: undefined;

	const openAppDetails = useCallback(
		(appSlug: string) => {
			navigate({
				search: (prev) => ({ ...prev, app: appSlug }),
			});
		},
		[navigate],
	);

	const closeAppDetails = useCallback(() => {
		navigate({
			replace: true,
			search: (prev) => {
				if (!prev.app) {
					return prev;
				}
				const { app: _, ...rest } = prev;
				return rest;
			},
		});
	}, [navigate]);

	useEffect(() => {
		if (selectedAppSlug && !selectedApp) {
			closeAppDetails();
		}
	}, [closeAppDetails, selectedApp, selectedAppSlug]);

	const sortedVisibleApps = useMemo(() => {
		const list = [...visibleApps];

		const byName = (a: DirectoryApp, b: DirectoryApp) => a.name.localeCompare(b.name);
		const applyDirection = (cmp: number) =>
			sortDirection === "asc" ? cmp : -cmp;

		list.sort((a, b) => {
			if (sortBy === "alphabetical") {
				return applyDirection(byName(a, b));
			}

			if (sortBy === "created") {
				const cmpCreated = a.createdAtMs - b.createdAtMs;
				if (cmpCreated !== 0) {
					return applyDirection(cmpCreated);
				}
				return byName(a, b);
			}

			if (sortBy === "updated") {
				const cmpUpdated = a.updatedAtMs - b.updatedAtMs;
				if (cmpUpdated !== 0) {
					return applyDirection(cmpUpdated);
				}
				return byName(a, b);
			}

			const aSummary = ratingSummaries?.[a.slug];
			const bSummary = ratingSummaries?.[b.slug];
			const aAvg = aSummary?.average ?? null;
			const bAvg = bSummary?.average ?? null;

			if (aAvg === null && bAvg !== null) {
				return 1;
			}
			if (aAvg !== null && bAvg === null) {
				return -1;
			}
			if (aAvg === null && bAvg === null) {
				return byName(a, b);
			}

			const cmpAvg = aAvg - bAvg;
			if (cmpAvg !== 0) {
				return applyDirection(cmpAvg);
			}

			const aCount = aSummary?.count ?? 0;
			const bCount = bSummary?.count ?? 0;
			const cmpCount = aCount - bCount;
			if (cmpCount !== 0) {
				return applyDirection(cmpCount);
			}

			return byName(a, b);
		});

		return list;
	}, [visibleApps, sortBy, sortDirection, ratingSummaries]);

	return (
		<main className="page-wrap px-4 pb-10 pt-10">
			<section className="hero-minimal rise-in">
				<div className="mb-3 flex items-start justify-between gap-3">
					<p className="island-kicker m-0">Curated Apps</p>
					<div className="shrink-0">
						<HeaderUser />
					</div>
				</div>
				<h1 className="display-title max-w-3xl text-4xl leading-[1.04] font-semibold tracking-tight text-[var(--ink-strong)] sm:text-[3.4rem]">
					Directory for high quality apps
				</h1>
				<p className="mt-4 max-w-2xl text-base text-[var(--ink-muted)] sm:text-lg">
					Curated and ranked by the crowd. Discover something new.
				</p>
				<p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--ink-soft)]">
					<span>{apps.length} apps</span>
					<span aria-hidden="true">•</span>
					<span>{tags.length} tags</span>
					<span aria-hidden="true">•</span>
					<a
						href={SUBMIT_APP_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-2 text-[var(--ink-soft)] no-underline transition hover:text-[var(--ink-strong)]"
					>
						Open submissions
					</a>
					<a
						href={GITHUB_REPO_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center text-[var(--ink-soft)] transition hover:text-[var(--ink-strong)]"
					>
						<span className="sr-only">Open GitHub repository</span>
						<svg viewBox="0 0 16 16" aria-hidden="true" width="15" height="15">
							<path
								fill="currentColor"
								d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
							/>
						</svg>
					</a>
				</p>
			</section>

			<section className="mt-7">
				<div className="mb-3 flex flex-wrap items-center gap-2">
					<div className="flex flex-wrap gap-2">
						<TagFilter
							active={activeTag === "all"}
							label={`All (${apps.length})`}
							onClick={() => setActiveTag("all")}
						/>
						{tags.map((tag) => (
							<TagFilter
								key={tag.slug}
								active={activeTag === tag.slug}
								label={`${tag.name} (${tagCounts.get(tag.slug) ?? 0})`}
								onClick={() => setActiveTag(tag.slug)}
							/>
						))}
					</div>

					<div className="ml-auto flex items-center gap-2">
						<AppCommandMenu apps={apps} onSelectApp={openAppDetails} />

						<label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-soft)]">
							Sort
							<select
								value={sortBy}
								onChange={(event) => setSortBy(event.target.value as SortOption)}
								className="rounded-md border border-[var(--line)] bg-[var(--chip)] px-2 py-1 text-xs text-[var(--ink-strong)]"
							>
								<option value="rating">Rating</option>
								<option value="alphabetical">Alphabetical</option>
								<option value="created">Created</option>
								<option value="updated">Updated</option>
							</select>
						</label>

						<div className="flex items-center rounded-md border border-[var(--line)] bg-[var(--chip)] p-0.5 text-xs">
							<button
								type="button"
								onClick={() => setSortDirection("asc")}
								className={`rounded px-2 py-1 font-semibold ${
									sortDirection === "asc"
										? "bg-[var(--ink-strong)] text-[var(--bg)]"
										: "text-[var(--ink-soft)]"
								}`}
							>
								Asc
							</button>
							<button
								type="button"
								onClick={() => setSortDirection("desc")}
								className={`rounded px-2 py-1 font-semibold ${
									sortDirection === "desc"
										? "bg-[var(--ink-strong)] text-[var(--bg)]"
										: "text-[var(--ink-soft)]"
								}`}
							>
								Desc
							</button>
						</div>
					</div>
				</div>

				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{sortedVisibleApps.map((app, index) => (
						<AppCard
							key={app.slug}
							app={app}
							tagsBySlug={tagsBySlug}
							index={index}
							onOpenDetails={openAppDetails}
							ratingSummary={ratingSummaries?.[app.slug]}
						/>
					))}
				</div>

				{visibleApps.length === 0 ? (
					<div className="island-shell mt-4 rounded-2xl p-6 text-sm text-[var(--ink-muted)]">
						No apps found for this tag.
					</div>
				) : null}
			</section>

			{selectedApp ? (
				<AppDetailsModal
					app={selectedApp}
					onClose={closeAppDetails}
					ratingSummary={selectedAppRating}
					tagsBySlug={tagsBySlug}
				/>
			) : null}
		</main>
	);
}

function AppCard({
	app,
	tagsBySlug,
	index,
	onOpenDetails,
	ratingSummary,
}: {
	app: DirectoryApp;
	tagsBySlug: Map<string, DirectoryTag>;
	index: number;
	onOpenDetails: (appSlug: string) => void;
	ratingSummary: RatingSummary | undefined;
}) {
	const [logoFailed, setLogoFailed] = useState(false);

	return (
		<article
			className="island-shell rise-in group flex h-full flex-col rounded-2xl p-4"
			style={{ animationDelay: `${index * 40}ms` }}
		>
			<div className="mb-3 flex items-start gap-3">
				<div className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card-strong)]">
					{!logoFailed ? (
						<img
							src={app.logo}
							alt={`${app.name} logo`}
							className="h-full w-full object-cover"
							loading="lazy"
							onError={() => setLogoFailed(true)}
						/>
					) : (
						<span className="text-sm font-semibold text-[var(--ink-strong)]">
							{app.name.slice(0, 1).toUpperCase()}
						</span>
					)}
				</div>

				<div className="min-w-0 flex-1">
					<h2 className="truncate text-base font-semibold text-[var(--ink-strong)]">
						<Link
							to="/apps/$slug"
							params={{ slug: app.slug }}
							className="text-[var(--ink-strong)] no-underline transition hover:text-[var(--ink-soft)]"
						>
							{app.name}
						</Link>
					</h2>
					<p className="truncate text-xs text-[var(--ink-soft)]">
						{app.websiteHost}
					</p>
				</div>
			</div>

			<p className="mb-4 text-sm leading-6 text-[var(--ink-muted)]">
				{app.description}
			</p>

			<div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--ink-soft)]">
				<span>Added {formatAppDate(app.created_at)}</span>
				<span aria-hidden="true">•</span>
				<span>Updated {formatAppDate(app.updated_at)}</span>
			</div>

			<div className="mb-4 flex flex-wrap gap-1.5">
				{app.tags.map((tagSlug) => {
					const tagName = tagsBySlug.get(tagSlug)?.name ?? tagSlug;
					return (
						<span
							key={`${app.slug}-${tagSlug}`}
							className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-soft)]"
						>
							{tagName}
						</span>
					);
				})}
			</div>

			<div className="mt-auto flex items-center gap-2">
				<button
					type="button"
					onClick={() => onOpenDetails(app.slug)}
					className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)] transition hover:text-[var(--ink-strong)]"
				>
					Details
				</button>
				<a
					href={app.website}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--card-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-strong)] no-underline transition group-hover:-translate-y-0.5"
				>
					Visit
					<ExternalLink size={13} />
				</a>
				{app.apple_app_store ? (
					<a
						href={app.apple_app_store}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)] no-underline transition hover:text-[var(--ink-strong)]"
					>
						App Store
						<ExternalLink size={13} />
					</a>
				) : null}
			</div>

			<AppRating appSlug={app.slug} summary={ratingSummary} />
		</article>
	);
}

function AppDetailsModal({
	app,
	onClose,
	ratingSummary,
	tagsBySlug,
}: {
	app: DirectoryApp;
	onClose: () => void;
	ratingSummary: RatingSummary | undefined;
	tagsBySlug: Map<string, DirectoryTag>;
}) {
	const navigate = Route.useNavigate();

	const openFullPage = useCallback(() => {
		const navigateToDetail = () => {
			void navigate({
				to: "/apps/$slug",
				params: { slug: app.slug },
			});
		};

		const transitionDocument = document as Document & {
			startViewTransition?: (update: () => void) => unknown;
		};

		if (typeof transitionDocument.startViewTransition === "function") {
			transitionDocument.startViewTransition(() => {
				navigateToDetail();
			});
			return;
		}

		navigateToDetail();
	}, [app.slug, navigate]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		window.addEventListener("keydown", onKeyDown);

		return () => {
			document.body.style.overflow = originalOverflow;
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
			<button
				type="button"
				onClick={onClose}
				className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
				aria-label="Close app details"
			/>

			<div className="relative flex min-h-dvh items-end justify-center p-2 sm:items-center sm:p-6">
				<article className="island-shell vt-app-shell relative w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl sm:p-7">
					<div className="absolute right-3 top-3 flex items-center gap-1.5">
						<button
							type="button"
							onClick={openFullPage}
							className="rounded-full border border-[var(--line)] bg-[var(--chip)] p-1.5 text-[var(--ink-soft)] transition hover:text-[var(--ink-strong)]"
							aria-label="Open full page"
							title="Open full page"
						>
							<Maximize2 size={16} />
						</button>

						<button
							type="button"
							onClick={onClose}
							className="rounded-full border border-[var(--line)] bg-[var(--chip)] p-1.5 text-[var(--ink-soft)] transition hover:text-[var(--ink-strong)]"
							aria-label="Close"
						>
							<X size={16} />
						</button>
					</div>

					<AppDetailsContent
						app={app}
						ratingSummary={ratingSummary}
						tagsBySlug={tagsBySlug}
						titleTag="h2"
					/>
				</article>
			</div>
		</div>
	);
}

function TagFilter({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
				active
					? "border-[var(--ink-strong)] bg-[var(--ink-strong)] text-[var(--bg)]"
					: "border-[var(--line)] bg-[var(--chip)] text-[var(--ink-soft)] hover:text-[var(--ink-strong)]"
			}`}
		>
			{label}
		</button>
	);
}
