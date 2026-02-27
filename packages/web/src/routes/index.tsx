import { Link, createFileRoute } from "@tanstack/react-router";
import { allApps, allTags } from "content-collections";
import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "#/lib/site";

const canonical = `${SITE_URL}/`;

type DirectoryApp = (typeof allApps)[number];

type DirectoryTag = (typeof allTags)[number];

export const Route = createFileRoute("/")({
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
	const [activeTag, setActiveTag] = useState<string>("all");

	const apps = useMemo(
		() => [...allApps].sort((a, b) => a.name.localeCompare(b.name)),
		[],
	);
	const tags = useMemo(
		() => [...allTags].sort((a, b) => a.name.localeCompare(b.name)),
		[],
	);

	const tagsBySlug = useMemo(
		() => new Map<string, DirectoryTag>(tags.map((tag) => [tag.slug, tag])),
		[tags],
	);

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

	return (
		<main className="page-wrap px-4 pb-10 pt-10">
			<section className="island-shell rise-in rounded-[1.6rem] p-6 sm:p-8">
				<p className="island-kicker mb-3">Curated Directory</p>
				<h1 className="display-title max-w-3xl text-4xl leading-[1.02] font-semibold tracking-tight text-[var(--ink-strong)] sm:text-6xl">
					Independent macOS apps,
					<br />
					selected one by one.
				</h1>
				<p className="mt-4 max-w-2xl text-base text-[var(--ink-muted)] sm:text-lg">
					A tiny, opinionated collection of tools worth keeping on your Mac.
					Each entry links straight to the app and its source.
				</p>
				<div className="mt-7 flex flex-wrap items-center gap-3 text-sm text-[var(--ink-muted)]">
					<span className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1.5">
						{apps.length} apps
					</span>
					<span className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1.5">
						{tags.length} tags
					</span>
					<Link
						to="/about"
						className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1.5 text-[var(--ink-strong)] no-underline transition hover:-translate-y-0.5"
					>
						About this directory
					</Link>
				</div>
			</section>

			<section className="mt-8">
				<div className="mb-3 flex flex-wrap gap-2">
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

				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{visibleApps.map((app, index) => (
						<AppCard
							key={app.slug}
							app={app}
							tagsBySlug={tagsBySlug}
							index={index}
						/>
					))}
				</div>

				{visibleApps.length === 0 ? (
					<div className="island-shell mt-4 rounded-2xl p-6 text-sm text-[var(--ink-muted)]">
						No apps found for this tag.
					</div>
				) : null}
			</section>
		</main>
	);
}

function AppCard({
	app,
	tagsBySlug,
	index,
}: {
	app: DirectoryApp;
	tagsBySlug: Map<string, DirectoryTag>;
	index: number;
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
						{app.name}
					</h2>
					<p className="truncate text-xs text-[var(--ink-soft)]">
						{app.websiteHost}
					</p>
				</div>
			</div>

			<p className="mb-4 text-sm leading-6 text-[var(--ink-muted)]">
				{app.description}
			</p>

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
		</article>
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
					? "border-[var(--ink-strong)] bg-[var(--ink-strong)] text-white"
					: "border-[var(--line)] bg-[var(--chip)] text-[var(--ink-soft)] hover:text-[var(--ink-strong)]"
			}`}
		>
			{label}
		</button>
	);
}
