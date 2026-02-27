import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import AppDetailsContent from "../components/AppDetailsContent";
import {
	createTagsBySlug,
	getDirectoryAppBySlug,
	listDirectoryTags,
} from "#/lib/directory";
import { SITE_URL } from "#/lib/site";

export const Route = createFileRoute("/apps/$slug")({
	loader: ({ params }) => {
		const app = getDirectoryAppBySlug(params.slug);
		if (!app) {
			throw notFound();
		}
		return app;
	},
	head: ({ loaderData, params }) => ({
		links: [{ rel: "canonical", href: `${SITE_URL}/apps/${params.slug}` }],
		meta: [
			{ title: `${loaderData?.name ?? "App"} | Curated Apps` },
			{ name: "description", content: loaderData?.description ?? "" },
			{ property: "og:image", content: `${SITE_URL}/images/lagoon-1.svg` },
		],
	}),
	component: AppDetailsPage,
});

function AppDetailsPage() {
	const app = Route.useLoaderData();

	const tags = useMemo(
		() => listDirectoryTags().sort((a, b) => a.name.localeCompare(b.name)),
		[],
	);
	const tagsBySlug = useMemo(() => createTagsBySlug(tags), [tags]);
	const ratingSummary = useQuery((api as any).appRatings.getSummaries, {
		appSlugs: [app.slug],
	});

	return (
		<main className="page-wrap px-4 pb-12 pt-10">
			<div className="mb-4">
				<Link
					to="/"
					className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-soft)] no-underline transition hover:text-[var(--ink-strong)]"
				>
					Back to directory
				</Link>
			</div>

			<article className="island-shell vt-app-shell rounded-2xl p-5 sm:p-7">
				<AppDetailsContent
					app={app}
					ratingSummary={ratingSummary?.[app.slug]}
					tagsBySlug={tagsBySlug}
					titleTag="h1"
				/>
			</article>
		</main>
	);
}
