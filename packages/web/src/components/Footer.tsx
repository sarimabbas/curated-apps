import ThemeToggle from "./ThemeToggle";

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="site-footer mt-16 px-4 pb-12 pt-8 text-[var(--ink-soft)]">
			<div className="page-wrap flex flex-col gap-4 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
				<p className="m-0 text-xs text-[var(--ink-soft)]">by @sarim_ok</p>

				<div className="flex items-center justify-center gap-3 sm:justify-end">
					<p className="m-0 text-xs text-[var(--ink-soft)]">&copy; {year}</p>
					<ThemeToggle />
				</div>
			</div>
		</footer>
	);
}
