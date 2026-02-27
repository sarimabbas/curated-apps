import { ConvexHttpClient } from "convex/browser";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { api } from "../convex/_generated/api";

type SyncApp = {
	slug: string;
	name: string;
	description: string;
	websiteHost: string;
	tags: string[];
	createdAtMs: number;
	updatedAtMs: number;
};

const APPS_ROOT = path.resolve(process.cwd(), "../directory/apps");
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

function parseDateToMs(value: string, key: string, filePath: string) {
	const parsed = Date.parse(`${value}T00:00:00.000Z`);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Invalid ${key} date in ${filePath}: "${value}"`);
	}
	return parsed;
}

function parseFrontmatter(filePath: string, content: string) {
	const match = content.match(FRONTMATTER_RE);
	if (!match) {
		throw new Error(`Missing frontmatter in ${filePath}`);
	}

	const values: Record<string, string | string[]> = {};
	let currentKey: string | null = null;

	for (const rawLine of match[1].split("\n")) {
		const line = rawLine.trim();
		if (!line) {
			continue;
		}

		const keyMatch = line.match(/^([a-z_]+):\s*(.*)$/);
		if (keyMatch) {
			const key = keyMatch[1];
			const value = keyMatch[2];
			currentKey = key;
			if (!value) {
				values[key] = [];
				continue;
			}
			values[key] = value.replace(/^['"]|['"]$/g, "");
			continue;
		}

		if (currentKey && Array.isArray(values[currentKey])) {
			const listMatch = line.match(/^- (.+)$/);
			if (listMatch) {
				(values[currentKey] as string[]).push(
					listMatch[1].replace(/^['"]|['"]$/g, ""),
				);
				continue;
			}
		}
	}

	return values;
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const absolute = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectMarkdownFiles(absolute)));
			continue;
		}
		if (entry.isFile() && absolute.endsWith(".md")) {
			files.push(absolute);
		}
	}

	return files;
}

async function loadSyncApps(): Promise<SyncApp[]> {
	const files = await collectMarkdownFiles(APPS_ROOT);
	const apps: SyncApp[] = [];

	for (const filePath of files.sort()) {
		const content = await readFile(filePath, "utf8");
		const frontmatter = parseFrontmatter(filePath, content);

		const name = frontmatter.name;
		const slug = frontmatter.slug;
		const description = frontmatter.description;
		const website = frontmatter.website;
		const createdAt = frontmatter.created_at;
		const updatedAt = frontmatter.updated_at;
		const tags = frontmatter.tags;

		if (
			typeof name !== "string" ||
			typeof slug !== "string" ||
			typeof description !== "string" ||
			typeof website !== "string" ||
			typeof createdAt !== "string" ||
			typeof updatedAt !== "string" ||
			!Array.isArray(tags)
		) {
			throw new Error(`Invalid frontmatter shape in ${filePath}`);
		}

		apps.push({
			createdAtMs: parseDateToMs(createdAt, "created_at", filePath),
			description,
			name,
			slug,
			tags,
			updatedAtMs: parseDateToMs(updatedAt, "updated_at", filePath),
			websiteHost: new URL(website).host.replace(/^www\./, ""),
		});
	}

	return apps;
}

async function main() {
	const convexUrl = process.env.VITE_CONVEX_URL;
	if (!convexUrl) {
		throw new Error("Missing VITE_CONVEX_URL for catalog sync.");
	}

	const apps = await loadSyncApps();
	if (apps.length === 0) {
		console.log("No apps found to sync.");
		return;
	}

	const client = new ConvexHttpClient(convexUrl);
	const result = await client.action(api.appCatalog.ensureSynced, { apps });
	console.log(
		`Catalog sync complete: updated=${result.createdOrUpdated}, skipped=${result.skipped}, deleted=${result.deleted}, total=${result.total}`,
	);
}

void main();
