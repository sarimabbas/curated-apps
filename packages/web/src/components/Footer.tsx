export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="site-footer mt-16 px-4 pb-12 pt-8 text-[var(--ink-soft)]">
			<div className="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
				<p className="m-0 text-sm">&copy; {year} Curated Apps directory</p>
				<p className="island-kicker m-0">
					Human-reviewed, AI-assisted collection
				</p>
			</div>
		</footer>
	);
}
