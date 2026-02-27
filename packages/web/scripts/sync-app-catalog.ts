import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'

type SyncApp = {
  slug: string
  name: string
  description: string
  website: string
  websiteHost: string
  tags: string[]
  createdAt: string
  updatedAt: string
  createdAtMs: number
  updatedAtMs: number
  appleAppStore?: string
  logoSource: string
  logoHash?: string
  logoStorageId?: Id<'_storage'>
}

type SyncTag = {
  slug: string
  name: string
}

type ParsedAppFile = {
  absolutePath: string
  slug: string
  name: string
  description: string
  website: string
  websiteHost: string
  tags: string[]
  createdAt: string
  updatedAt: string
  createdAtMs: number
  updatedAtMs: number
  appleAppStore?: string
  logoSource: string
}

const APPS_ROOT = path.resolve(process.cwd(), '../directory/apps')
const TAGS_ROOT = path.resolve(process.cwd(), '../directory/tags')
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/
const LOGO_MIME_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function parseDateToMs(value: string, key: string, filePath: string) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${key} date in ${filePath}: "${value}"`)
  }
  return parsed
}

function parseFrontmatter(filePath: string, content: string) {
  const match = content.match(FRONTMATTER_RE)
  if (!match) {
    throw new Error(`Missing frontmatter in ${filePath}`)
  }

  const values: Record<string, string | string[]> = {}
  let currentKey: string | null = null

  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const keyMatch = line.match(/^([a-z_]+):\s*(.*)$/)
    if (keyMatch) {
      const key = keyMatch[1]
      const value = keyMatch[2]
      currentKey = key
      if (!value) {
        values[key] = []
        continue
      }
      values[key] = value.replace(/^['"]|['"]$/g, '')
      continue
    }

    if (currentKey && Array.isArray(values[currentKey])) {
      const listMatch = line.match(/^- (.+)$/)
      if (listMatch) {
        ;(values[currentKey] as string[]).push(listMatch[1].replace(/^['"]|['"]$/g, ''))
      }
    }
  }

  return values
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return []
  }

  const files: string[] = []

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(absolute)))
      continue
    }
    if (entry.isFile() && absolute.endsWith('.md')) {
      files.push(absolute)
    }
  }

  return files
}

function sha256Hex(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

function inferMimeType(filePath: string) {
  return LOGO_MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()]
}

async function loadSyncApps(): Promise<ParsedAppFile[]> {
  const files = await collectMarkdownFiles(APPS_ROOT)
  const apps: ParsedAppFile[] = []

  for (const filePath of files.sort()) {
    const content = await readFile(filePath, 'utf8')
    const frontmatter = parseFrontmatter(filePath, content)

    const name = frontmatter.name
    const slug = frontmatter.slug
    const description = frontmatter.description
    const website = frontmatter.website
    const createdAt = frontmatter.created_at
    const updatedAt = frontmatter.updated_at
    const tags = frontmatter.tags
    const logo = frontmatter.logo
    const appleAppStore = frontmatter.apple_app_store

    if (
      typeof name !== 'string' ||
      typeof slug !== 'string' ||
      typeof description !== 'string' ||
      typeof website !== 'string' ||
      typeof createdAt !== 'string' ||
      typeof updatedAt !== 'string' ||
      !Array.isArray(tags) ||
      typeof logo !== 'string'
    ) {
      throw new Error(`Invalid frontmatter shape in ${filePath}`)
    }

    apps.push({
      absolutePath: filePath,
      slug,
      name,
      description,
      website,
      websiteHost: new URL(website).host.replace(/^www\./, ''),
      tags,
      createdAt,
      updatedAt,
      createdAtMs: parseDateToMs(createdAt, 'created_at', filePath),
      updatedAtMs: parseDateToMs(updatedAt, 'updated_at', filePath),
      appleAppStore: typeof appleAppStore === 'string' ? appleAppStore : undefined,
      logoSource: logo,
    })
  }

  return apps
}

async function loadSyncTags(): Promise<SyncTag[]> {
  const files = await collectMarkdownFiles(TAGS_ROOT)
  const tags: SyncTag[] = []

  for (const filePath of files.sort()) {
    const content = await readFile(filePath, 'utf8')
    const frontmatter = parseFrontmatter(filePath, content)
    const name = frontmatter.name
    const slug = frontmatter.slug

    if (typeof name !== 'string' || typeof slug !== 'string') {
      throw new Error(`Invalid tag frontmatter shape in ${filePath}`)
    }

    tags.push({ name, slug })
  }

  return tags
}

async function uploadLogoIfNeeded(client: ConvexHttpClient, absoluteLogoPath: string) {
  const mimeType = inferMimeType(absoluteLogoPath)
  if (!mimeType) {
    throw new Error(`Unsupported logo extension: ${absoluteLogoPath}`)
  }

  const uploadUrl = await client.mutation(api.appCatalog.generateLogoUploadUrl, {})
  const bytes = await readFile(absoluteLogoPath)
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
    },
    body: bytes,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Logo upload failed (${response.status}): ${text.slice(0, 200)}`)
  }

  const data = (await response.json()) as { storageId?: string }
  if (!data.storageId) {
    throw new Error(`Logo upload response missing storageId for ${absoluteLogoPath}`)
  }

  return data.storageId as Id<'_storage'>
}

async function prepareSyncApps(
  client: ConvexHttpClient,
  parsedApps: ParsedAppFile[],
): Promise<SyncApp[]> {
  const snapshot = await client.query(api.appCatalog.getSeedSnapshot, {})
  const snapshotBySlug = new Map(snapshot.map((entry) => [entry.appSlug, entry]))
  const prepared: SyncApp[] = []

  for (const app of parsedApps) {
    const base: SyncApp = {
      slug: app.slug,
      name: app.name,
      description: app.description,
      website: app.website,
      websiteHost: app.websiteHost,
      tags: app.tags,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      createdAtMs: app.createdAtMs,
      updatedAtMs: app.updatedAtMs,
      appleAppStore: app.appleAppStore,
      logoSource: app.logoSource,
    }

    if (!app.logoSource.startsWith('./')) {
      prepared.push(base)
      continue
    }

    const absoluteLogoPath = path.resolve(path.dirname(app.absolutePath), app.logoSource)
    const fileBytes = await readFile(absoluteLogoPath)
    const logoHash = sha256Hex(fileBytes)
    const existing = snapshotBySlug.get(app.slug)

    if (existing?.logoHash === logoHash && existing.logoStorageId) {
      prepared.push({
        ...base,
        logoHash,
        logoStorageId: existing.logoStorageId,
      })
      continue
    }

    const storageId = await uploadLogoIfNeeded(client, absoluteLogoPath)
    prepared.push({
      ...base,
      logoHash,
      logoStorageId: storageId,
    })
  }

  return prepared
}

async function main() {
  const convexUrl = process.env.VITE_CONVEX_URL
  if (!convexUrl) {
    throw new Error('Missing VITE_CONVEX_URL for catalog sync.')
  }

  const parsedApps = await loadSyncApps()
  const tags = await loadSyncTags()

  if (parsedApps.length === 0) {
    console.log('No apps found to sync.')
    return
  }

  const client = new ConvexHttpClient(convexUrl)
  const apps = await prepareSyncApps(client, parsedApps)
  const result = await client.action(api.appCatalog.ensureSynced, { apps, tags })

  console.log(
    `Catalog sync complete: updated=${result.createdOrUpdated}, skipped=${result.skipped}, deleted=${result.deleted}, total=${result.total}, tagsUpdated=${result.tagsUpdated}, tagsDeleted=${result.tagsDeleted}`,
  )
}

void main()
