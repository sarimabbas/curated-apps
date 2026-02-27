import { Command } from "cmdk";
import Fuse from "fuse.js";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DirectoryApp } from "#/lib/directory";

const MAX_RESULTS = 24;

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	const tag = target.tagName.toLowerCase();
	return (
		target.isContentEditable ||
		tag === "input" ||
		tag === "textarea" ||
		tag === "select"
	);
}

export default function AppCommandMenu({
	apps,
	onSelectApp,
}: {
	apps: DirectoryApp[];
	onSelectApp: (appSlug: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [shortcutLabel, setShortcutLabel] = useState("⌘K");

	const fuse = useMemo(
		() =>
			new Fuse(apps, {
				ignoreLocation: true,
				keys: [
					{ name: "name", weight: 0.52 },
					{ name: "description", weight: 0.28 },
					{ name: "websiteHost", weight: 0.12 },
					{ name: "tags", weight: 0.08 },
				],
				threshold: 0.34,
			}),
		[apps],
	);

	const results = useMemo(() => {
		const trimmed = query.trim();
		if (!trimmed) {
			return [...apps]
				.sort((a, b) => a.name.localeCompare(b.name))
				.slice(0, MAX_RESULTS);
		}
		return fuse.search(trimmed, { limit: MAX_RESULTS }).map((result) => result.item);
	}, [apps, fuse, query]);

	useEffect(() => {
		setQuery("");
	}, [open]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		setShortcutLabel(
			/(Mac|iPhone|iPad|iPod)/i.test(window.navigator.platform)
				? "⌘K"
				: "Ctrl K",
		);

		const onKeyDown = (event: KeyboardEvent) => {
			if (isEditableTarget(event.target)) {
				return;
			}

			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((value) => !value);
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	function handleSelect(appSlug: string) {
		onSelectApp(appSlug);
		setOpen(false);
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] transition hover:text-[var(--ink-strong)]"
			>
				<Search size={13} />
				<span>Search</span>
				<kbd className="rounded border border-[var(--line)] bg-[var(--card-strong)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-soft)]">
					{shortcutLabel}
				</kbd>
			</button>

			<Command.Dialog
				open={open}
				onOpenChange={setOpen}
				label="Search apps"
				shouldFilter={false}
				overlayClassName="cmdk-overlay"
				className="cmdk-dialog"
			>
				<div className="cmdk-inner">
					<div className="cmdk-input-wrap">
						<Search size={14} />
						<Command.Input
							value={query}
							onValueChange={setQuery}
							placeholder="Search apps..."
						/>
					</div>

					<Command.List>
						<Command.Empty>No apps found.</Command.Empty>
						<Command.Group heading={query ? "Results" : "Apps"}>
							{results.map((app) => (
								<Command.Item
									key={app.slug}
									value={app.slug}
									onSelect={() => handleSelect(app.slug)}
								>
									<div className="min-w-0">
										<p className="m-0 truncate text-sm font-semibold text-[var(--ink-strong)]">
											{app.name}
										</p>
										<p className="m-0 truncate text-xs text-[var(--ink-soft)]">
											{app.websiteHost} • {app.description}
										</p>
									</div>
								</Command.Item>
							))}
						</Command.Group>
					</Command.List>
				</div>
			</Command.Dialog>
		</>
	);
}
