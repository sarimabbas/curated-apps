import { defineCollection, defineConfig } from '@content-collections/core'
import { compileMarkdown } from '@content-collections/markdown'
import { compileMDX } from '@content-collections/mdx'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import remarkGfm from 'remark-gfm'
import { z } from 'zod'

const blog = defineCollection({
  name: 'blog',
  directory: 'content/blog',
  include: '**/*.{md,mdx}',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.string(),
    content: z.string(),
    heroImage: z.string().optional(),
  }),
  transform: async (document, context) => {
    const isMdx = document._meta.filePath.endsWith('.mdx')

    return {
      ...document,
      slug: document._meta.path,
      pubDate: new Date(document.pubDate).toISOString(),
      html: isMdx ? null : await compileMarkdown(context, document),
      mdx: isMdx
        ? await compileMDX(context, document, {
            remarkPlugins: [remarkGfm],
          })
        : null,
    }
  },
})

const directoryAppsPath = path.resolve(process.cwd(), '../directory/apps')
const logoMimeByExtension: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

async function resolveLogo(logo: string, filePath: string): Promise<string> {
  if (!logo.startsWith('./')) {
    return logo
  }

  const appFileAbsolutePath = path.resolve(directoryAppsPath, filePath)
  const logoAbsolutePath = path.resolve(path.dirname(appFileAbsolutePath), logo)
  const extension = path.extname(logoAbsolutePath).toLowerCase()
  const mimeType = logoMimeByExtension[extension]

  if (!mimeType) {
    return logo
  }

  try {
    const bytes = await readFile(logoAbsolutePath)
    return `data:${mimeType};base64,${bytes.toString('base64')}`
  } catch {
    return logo
  }
}

const app = defineCollection({
  name: 'app',
  directory: '../directory/apps',
  include: '**/*.md',
  schema: z.object({
    apple_app_store: z.url().optional(),
    description: z.string(),
    logo: z.string(),
    name: z.string(),
    slug: z.string(),
    tags: z.array(z.string()),
    website: z.url(),
  }),
  transform: async (document) => {
    const resolvedLogo = await resolveLogo(document.logo, document._meta.filePath)

    return {
      ...document,
      logo: resolvedLogo,
      logoIsEmbedded: resolvedLogo.startsWith('data:'),
      websiteHost: new URL(document.website).host.replace(/^www\./, ''),
    }
  },
})

const tag = defineCollection({
  name: 'tag',
  directory: '../directory/tags',
  include: '**/*.md',
  schema: z.object({
    name: z.string(),
    slug: z.string(),
  }),
})

export default defineConfig({
  collections: [blog, app, tag],
})
