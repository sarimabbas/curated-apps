import { createFileRoute, notFound } from '@tanstack/react-router'
import { SITE_URL } from '#/lib/site'

export const Route = createFileRoute('/blog/$slug')({
  loader: () => {
    throw notFound()
  },
  head: ({ params }) => ({
    links: [{ rel: 'canonical', href: `${SITE_URL}/blog/${params.slug}` }],
    meta: [
      { title: 'Post' },
      { name: 'description', content: 'Blog post' },
      { property: 'og:image', content: `${SITE_URL}/images/lagoon-1.svg` },
    ],
  }),
  component: BlogPost,
})

function BlogPost() {
  return null
}
