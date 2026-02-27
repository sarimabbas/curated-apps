import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
	component: About,
});

function About() {
	return (
		<main className="page-wrap px-4 py-10">
			<section className="island-shell rounded-2xl p-6 sm:p-8">
				<p className="island-kicker mb-2">About</p>
				<h1 className="display-title mb-4 text-4xl font-semibold text-[var(--ink-strong)] sm:text-5xl">
					Why this exists
				</h1>
				<div className="space-y-4 text-base leading-8 text-[var(--ink-muted)]">
					<p>
						Curated Apps is a compact directory of macOS tools discovered from
						communities and manually reviewed before being promoted.
					</p>
					<p>
						Intake is automated, but publishing is intentional. Apps first land
						in triage, and only approved ones move into the main directory.
					</p>
					<p>
						The source data lives in markdown files, so every entry is auditable
						in Git and easy to update.
					</p>
				</div>
			</section>
		</main>
	);
}
