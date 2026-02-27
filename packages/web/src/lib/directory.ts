export type DirectoryApp = {
	slug: string;
	name: string;
	description: string;
	website: string;
	websiteHost: string;
	logo: string;
	tags: string[];
	apple_app_store?: string;
	created_at: string;
	updated_at: string;
	createdAtMs: number;
	updatedAtMs: number;
};

export type DirectoryTag = {
	name: string;
	slug: string;
};

const appDateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
	year: "numeric",
});

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
