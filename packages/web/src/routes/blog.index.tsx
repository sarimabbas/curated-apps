import { createFileRoute } from '@tanstack/react-router'
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '#/lib/site'

const canonical = `${SITE_URL}/blog`
const pageTitle = `Blog | ${SITE_TITLE}`

export const Route = createFileRoute('/blog/')({
  head: () => ({
    links: [{ rel: 'canonical', href: canonical }],
    meta: [
      { title: pageTitle },
      { name: 'description', content: SITE_DESCRIPTION },
      { property: 'og:image', content: `${SITE_URL}/images/lagoon-1.svg` },
    ],
  }),
  component: BlogIndex,
})

function BlogIndex() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="mb-4">
        <p className="island-kicker mb-2">Latest Dispatches</p>
        <h1 className="display-title m-0 text-4xl font-bold tracking-tight text-[var(--sea-ink)] sm:text-5xl">
          Blog
        </h1>
      </section>

      <section className="island-shell rounded-2xl p-6 text-sm text-[var(--sea-ink-soft)]">
        No posts yet.
      </section>
    </main>
  )
}
