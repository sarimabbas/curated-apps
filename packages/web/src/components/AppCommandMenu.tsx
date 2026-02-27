import { Command } from "cmdk";
import { useAction } from "convex/react";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
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
	const [isSearching, setIsSearching] = useState(false);
	const [results, setResults] = useState<DirectoryApp[]>([]);
	const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());
	const vectorSearchApps = useAction((api as any).appCatalog.searchApps);

	const defaultResults = useMemo(
		() =>
			[...apps]
				.sort((a, b) => a.name.localeCompare(b.name))
				.slice(0, MAX_RESULTS),
		[apps],
	);
	const appsBySlug = useMemo(
		() => new Map<string, DirectoryApp>(apps.map((app) => [app.slug, app])),
		[apps],
	);

	useEffect(() => {
		if (!open) {
			setQuery("");
		}
		setResults(defaultResults);
	}, [open, defaultResults]);

	useEffect(() => {
		if (!open) {
			return;
		}

		const trimmed = query.trim();
		if (!trimmed) {
			setIsSearching(false);
			setResults(defaultResults);
			return;
		}

		let cancelled = false;
		const timer = window.setTimeout(() => {
			setIsSearching(true);
			void vectorSearchApps({
				limit: MAX_RESULTS,
				query: trimmed,
			})
				.then((matches: Array<{ appSlug: string }>) => {
					if (cancelled) {
						return;
					}

					const resolved = matches
						.map((match) => appsBySlug.get(match.appSlug))
						.filter((app): app is DirectoryApp => Boolean(app));
					setResults(resolved);
				})
				.catch(() => {
					if (!cancelled) {
						setResults([]);
					}
				})
				.finally(() => {
					if (!cancelled) {
						setIsSearching(false);
					}
				});
		}, 160);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [appsBySlug, defaultResults, open, query, vectorSearchApps]);

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

	function markLogoFailed(appSlug: string) {
		setFailedLogos((current) => {
			if (current.has(appSlug)) {
				return current;
			}
			const next = new Set(current);
			next.add(appSlug);
			return next;
		});
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
						<Command.Empty>
							{isSearching ? "Searching…" : "No apps found."}
						</Command.Empty>
						<Command.Group heading={query ? "Results" : "Apps"}>
							{results.map((app) => (
								<Command.Item
									key={app.slug}
									value={app.slug}
									onSelect={() => handleSelect(app.slug)}
								>
									<div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--chip)]">
										{!failedLogos.has(app.slug) ? (
											<img
												src={app.logo}
												alt={`${app.name} logo`}
												className="h-full w-full object-cover"
												loading="lazy"
												onError={() => markLogoFailed(app.slug)}
											/>
										) : (
											<span className="text-xs font-semibold text-[var(--ink-strong)]">
												{app.name.slice(0, 1).toUpperCase()}
											</span>
										)}
									</div>
									<div className="min-w-0 flex-1">
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
