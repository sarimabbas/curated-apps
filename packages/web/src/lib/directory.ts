import { allApps, allTags } from "content-collections";

export type DirectoryApp = (typeof allApps)[number];
export type DirectoryTag = (typeof allTags)[number];

const appDateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
	year: "numeric",
});

export function listDirectoryApps() {
	return [...allApps];
}

export function listDirectoryTags() {
	return [...allTags];
}

export function getDirectoryAppBySlug(slug: string) {
	return allApps.find((app) => app.slug === slug);
}

export function createTagsBySlug(tags: DirectoryTag[]) {
	return new Map<string, DirectoryTag>(tags.map((tag) => [tag.slug, tag]));
}

export function formatAppDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day)
	) {
		return value;
	}
	return appDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}
