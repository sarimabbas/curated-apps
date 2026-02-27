import { createFileRoute } from '@tanstack/react-router'
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '#/lib/site'

export const Route = createFileRoute('/rss.xml')({
  server: {
    handlers: {
      GET: () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title><![CDATA[${SITE_TITLE}]]></title><description><![CDATA[${SITE_DESCRIPTION}]]></description><link>${SITE_URL}</link></channel></rss>`

        return new Response(xml, {
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
          },
        })
      },
    },
  },
})
