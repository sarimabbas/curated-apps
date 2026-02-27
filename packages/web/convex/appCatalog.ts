import { v } from 'convex/values'
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
} from './_generated/server'
import { api, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const DEFAULT_SEARCH_LIMIT = 16
const MAX_SEARCH_LIMIT = 32
const MAX_SYNC_APPS = 512
const DAY_MS = 24 * 60 * 60 * 1000

type RankedAppMatch = {
  appSlug: string
  score: number
  vectorScore: number
}

type DirectoryAppRecord = {
  slug: string
  name: string
  description: string
  website: string
  websiteHost: string
  logo: string
  tags: string[]
  apple_app_store?: string
  created_at: string
  updated_at: string
  createdAtMs: number
  updatedAtMs: number
}

const syncTagValidator = v.object({
  slug: v.string(),
  name: v.string(),
})

const syncAppValidator = v.object({
  slug: v.string(),
  name: v.string(),
  description: v.string(),
  website: v.string(),
  websiteHost: v.string(),
  tags: v.array(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  createdAtMs: v.number(),
  updatedAtMs: v.number(),
  appleAppStore: v.optional(v.string()),
  logoSource: v.string(),
  logoHash: v.optional(v.string()),
  logoStorageId: v.optional(v.id('_storage')),
})

function clampLimit(value: number | undefined, fallback: number) {
  if (!value || Number.isNaN(value)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(value), 1), MAX_SEARCH_LIMIT)
}

function buildSourceText(app: {
  name: string
  description: string
  website: string
  websiteHost: string
  tags: string[]
  createdAt: string
  updatedAt: string
  appleAppStore?: string
}) {
  return [
    app.name,
    app.description,
    app.website,
    app.websiteHost,
    app.tags.join(' '),
    `created ${app.createdAt}`,
    `updated ${app.updatedAt}`,
    app.appleAppStore ?? '',
  ].join('\n')
}

function recencyBoost(updatedAtMs: number, now: number) {
  const ageDays = Math.max(0, (now - updatedAtMs) / DAY_MS)
  const freshness = Math.max(0, 1 - ageDays / 365)
  return freshness * 0.14
}

function ratingBoost(summary: { average: number | null; count: number } | undefined) {
  if (!summary || summary.average === null) {
    return 0
  }

  const avgBoost = (summary.average / 5) * 0.16
  const countBoost = (Math.min(summary.count, 40) / 40) * 0.05
  return avgBoost + countBoost
}

async function embedText(text: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in Convex environment.')
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Embedding request failed with ${response.status}: ${errorText.slice(0, 300)}`,
    )
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>
  }
  const embedding = data.data?.[0]?.embedding

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error('Invalid embedding response shape from provider.')
  }

  return embedding.map((value) => Number(value))
}

async function resolveLogoUrl(ctx: any, doc: Doc<'appCatalog'>) {
  if (doc.logoStorageId) {
    const storageUrl = await ctx.storage.getUrl(doc.logoStorageId)
    if (storageUrl) {
      return storageUrl
    }
  }
  return doc.logoSource ?? ''
}

async function toDirectoryAppRecord(ctx: any, doc: Doc<'appCatalog'>): Promise<DirectoryAppRecord> {
  const logo = await resolveLogoUrl(ctx, doc)
  const createdAt =
    doc.createdAt ?? new Date(doc.createdAtMs).toISOString().slice(0, 10)
  const updatedAt =
    doc.updatedAt ?? new Date(doc.updatedAtMs).toISOString().slice(0, 10)
  const website = doc.website ?? `https://${doc.websiteHost}`

  return {
    slug: doc.appSlug,
    name: doc.name,
    description: doc.description,
    website,
    websiteHost: doc.websiteHost,
    logo,
    tags: doc.tags,
    apple_app_store: doc.appleAppStore,
    created_at: createdAt,
    updated_at: updatedAt,
    createdAtMs: doc.createdAtMs,
    updatedAtMs: doc.updatedAtMs,
  }
}

async function rankMatches(
  ctx: ActionCtx,
  rawMatches: Array<{ _id: Id<'appCatalog'>; _score: number }>,
  options?: {
    excludeSlug?: string
    limit?: number
  },
): Promise<RankedAppMatch[]> {
  const ids = rawMatches.map((match) => match._id)
  if (ids.length === 0) {
    return []
  }

  const docs = await ctx.runQuery(internal.appCatalog.fetchByIds, { ids })
  const docsById = new Map<string, any>(docs.map((doc) => [String(doc._id), doc]))

  const hydrated = rawMatches
    .map((match) => {
      const doc = docsById.get(String(match._id))
      if (!doc) {
        return null
      }
      if (options?.excludeSlug && doc.appSlug === options.excludeSlug) {
        return null
      }
      return {
        doc,
        vectorScore: match._score,
      }
    })
    .filter(Boolean) as Array<{ doc: any; vectorScore: number }>

  if (hydrated.length === 0) {
    return []
  }

  const summaries = (await ctx.runQuery(api.appRatings.getSummaries, {
    appSlugs: hydrated.map((item) => item.doc.appSlug),
  })) as Record<string, { average: number | null; count: number; myRating: number | null }>

  const now = Date.now()
  const ranked = hydrated
    .map(({ doc, vectorScore }) => {
      const boostedScore =
        vectorScore + recencyBoost(doc.updatedAtMs, now) + ratingBoost(summaries[doc.appSlug])

      return {
        appSlug: doc.appSlug as string,
        score: boostedScore,
        vectorScore,
      }
    })
    .sort((a, b) => b.score - a.score)

  return ranked.slice(0, clampLimit(options?.limit, DEFAULT_SEARCH_LIMIT))
}

export const listApps = query({
  args: {},
  handler: async (ctx): Promise<DirectoryAppRecord[]> => {
    const docs = await ctx.db.query('appCatalog').collect()
    docs.sort((a, b) => a.name.localeCompare(b.name))

    const apps: DirectoryAppRecord[] = []
    for (const doc of docs) {
      apps.push(await toDirectoryAppRecord(ctx, doc))
    }
    return apps
  },
})

export const getAppBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args): Promise<DirectoryAppRecord | null> => {
    const doc = await ctx.db
      .query('appCatalog')
      .withIndex('by_app_slug', (q) => q.eq('appSlug', args.slug))
      .unique()

    if (!doc) {
      return null
    }

    return await toDirectoryAppRecord(ctx, doc)
  },
})

export const getAppsBySlugs = query({
  args: {
    slugs: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<DirectoryAppRecord[]> => {
    const uniqueSlugs = [...new Set(args.slugs)]
    const docsBySlug = new Map<string, Doc<'appCatalog'>>()

    for (const slug of uniqueSlugs) {
      const doc = await ctx.db
        .query('appCatalog')
        .withIndex('by_app_slug', (q) => q.eq('appSlug', slug))
        .unique()
      if (doc) {
        docsBySlug.set(slug, doc)
      }
    }

    const result: DirectoryAppRecord[] = []
    for (const slug of args.slugs) {
      const doc = docsBySlug.get(slug)
      if (!doc) {
        continue
      }
      result.push(await toDirectoryAppRecord(ctx, doc))
    }

    return result
  },
})

export const listTags = query({
  args: {},
  handler: async (ctx) => {
    const tags = await ctx.db.query('appTags').collect()
    tags.sort((a, b) => a.name.localeCompare(b.name))
    return tags.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
    }))
  },
})

export const getByAppSlug = internalQuery({
  args: {
    appSlug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('appCatalog')
      .withIndex('by_app_slug', (q) => q.eq('appSlug', args.appSlug))
      .unique()
  },
})

export const getSyncSnapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query('appCatalog').collect()
    return docs.map((doc) => ({
      _id: doc._id,
      appSlug: doc.appSlug,
      sourceText: doc.sourceText,
      updatedAtMs: doc.updatedAtMs,
      logoHash: doc.logoHash,
      logoStorageId: doc.logoStorageId,
    }))
  },
})

export const getSeedSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query('appCatalog').collect()
    return docs.map((doc) => ({
      appSlug: doc.appSlug,
      logoHash: doc.logoHash,
      logoStorageId: doc.logoStorageId,
    }))
  },
})

export const getTagSnapshot = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query('appTags').collect()
    return docs.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
    }))
  },
})

export const fetchByIds = internalQuery({
  args: {
    ids: v.array(v.id('appCatalog')),
  },
  handler: async (ctx, args) => {
    const docs = []
    for (const id of args.ids) {
      const doc = await ctx.db.get(id)
      if (doc) {
        docs.push(doc)
      }
    }
    return docs
  },
})

export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const upsertCatalog = internalMutation({
  args: {
    appSlug: v.string(),
    name: v.string(),
    description: v.string(),
    website: v.string(),
    websiteHost: v.string(),
    tags: v.array(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    appleAppStore: v.optional(v.string()),
    logoSource: v.string(),
    logoHash: v.optional(v.string()),
    logoStorageId: v.optional(v.id('_storage')),
    sourceText: v.string(),
    embedding: v.array(v.float64()),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('appCatalog')
      .withIndex('by_app_slug', (q) => q.eq('appSlug', args.appSlug))
      .unique()

    const nextDoc = {
      appSlug: args.appSlug,
      name: args.name,
      description: args.description,
      website: args.website,
      websiteHost: args.websiteHost,
      tags: args.tags,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
      createdAtMs: args.createdAtMs,
      updatedAtMs: args.updatedAtMs,
      sourceText: args.sourceText,
      embedding: args.embedding,
      syncedAt: args.syncedAt,
      ...(args.appleAppStore ? { appleAppStore: args.appleAppStore } : {}),
      ...(args.logoHash ? { logoHash: args.logoHash } : {}),
      ...(args.logoStorageId ? { logoStorageId: args.logoStorageId } : {}),
      logoSource: args.logoSource,
    }

    if (existing) {
      if (existing.logoStorageId && existing.logoStorageId !== args.logoStorageId) {
        await ctx.storage.delete(existing.logoStorageId)
      }
      await ctx.db.replace(existing._id, nextDoc)
      return existing._id
    }

    return await ctx.db.insert('appCatalog', nextDoc)
  },
})

export const deleteCatalogBySlug = internalMutation({
  args: {
    appSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('appCatalog')
      .withIndex('by_app_slug', (q) => q.eq('appSlug', args.appSlug))
      .unique()

    if (!existing) {
      return null
    }

    if (existing.logoStorageId) {
      await ctx.storage.delete(existing.logoStorageId)
    }

    await ctx.db.delete(existing._id)
    return existing._id
  },
})

export const upsertTag = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('appTags')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name })
      return existing._id
    }

    return await ctx.db.insert('appTags', {
      slug: args.slug,
      name: args.name,
    })
  },
})

export const deleteTagBySlug = internalMutation({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('appTags')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique()

    if (!existing) {
      return null
    }

    await ctx.db.delete(existing._id)
    return existing._id
  },
})

export const ensureSynced = action({
  args: {
    apps: v.array(syncAppValidator),
    tags: v.array(syncTagValidator),
  },
  handler: async (ctx, args) => {
    if (args.apps.length > MAX_SYNC_APPS) {
      throw new Error(`Refusing to sync more than ${MAX_SYNC_APPS} apps in one request.`)
    }

    const snapshot = await ctx.runQuery(internal.appCatalog.getSyncSnapshot, {})
    const snapshotBySlug = new Map(snapshot.map((item) => [item.appSlug, item]))
    const inputSlugs = new Set(args.apps.map((app) => app.slug))

    let createdOrUpdated = 0
    let skipped = 0
    let deleted = 0

    for (const app of args.apps) {
      if (app.logoSource.startsWith('./') && !app.logoStorageId) {
        throw new Error(`Missing logoStorageId for local logo app slug=${app.slug}`)
      }

      const sourceText = buildSourceText(app)
      const existing = snapshotBySlug.get(app.slug)

      const isUnchanged =
        existing &&
        existing.sourceText === sourceText &&
        existing.updatedAtMs === app.updatedAtMs &&
        (existing.logoHash ?? undefined) === app.logoHash &&
        existing.logoStorageId === app.logoStorageId

      if (isUnchanged) {
        skipped += 1
        continue
      }

      const embedding = await embedText(sourceText)
      await ctx.runMutation(internal.appCatalog.upsertCatalog, {
        appSlug: app.slug,
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
        logoHash: app.logoHash,
        logoStorageId: app.logoStorageId,
        sourceText,
        embedding,
        syncedAt: Date.now(),
      })
      createdOrUpdated += 1
    }

    for (const existing of snapshot) {
      if (inputSlugs.has(existing.appSlug)) {
        continue
      }
      await ctx.runMutation(internal.appCatalog.deleteCatalogBySlug, {
        appSlug: existing.appSlug,
      })
      deleted += 1
    }

    const tagSnapshot = await ctx.runQuery(internal.appCatalog.getTagSnapshot, {})
    const existingTagSlugs = new Set(tagSnapshot.map((tag) => tag.slug))
    const inputTagSlugs = new Set(args.tags.map((tag) => tag.slug))
    let tagsUpdated = 0
    let tagsDeleted = 0

    for (const tag of args.tags) {
      await ctx.runMutation(internal.appCatalog.upsertTag, tag)
      tagsUpdated += 1
    }

    for (const slug of existingTagSlugs) {
      if (inputTagSlugs.has(slug)) {
        continue
      }
      await ctx.runMutation(internal.appCatalog.deleteTagBySlug, { slug })
      tagsDeleted += 1
    }

    return {
      createdOrUpdated,
      deleted,
      skipped,
      total: args.apps.length,
      tagsUpdated,
      tagsDeleted,
    }
  },
})

export const searchApps = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RankedAppMatch[]> => {
    const query = args.query.trim()
    if (!query) {
      return []
    }

    const embedding = await embedText(query)
    const rawMatches = (await ctx.vectorSearch('appCatalog', 'by_embedding', {
      vector: embedding,
      limit: clampLimit(args.limit, DEFAULT_SEARCH_LIMIT),
    })) as Array<{ _id: Id<'appCatalog'>; _score: number }>

    return await rankMatches(ctx, rawMatches, {
      limit: args.limit,
    })
  },
})

export const similarApps = action({
  args: {
    appSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ appSlug: string; name: string; description: string; websiteHost: string; logo: string }>> => {
    const source = (await ctx.runQuery(internal.appCatalog.getByAppSlug, {
      appSlug: args.appSlug,
    })) as { embedding: number[] } | null

    if (!source) {
      return []
    }

    const requestedLimit = clampLimit(args.limit, 6)
    const rawMatches = (await ctx.vectorSearch('appCatalog', 'by_embedding', {
      vector: source.embedding,
      limit: Math.min(requestedLimit + 6, MAX_SEARCH_LIMIT),
    })) as Array<{ _id: Id<'appCatalog'>; _score: number }>

    const ranked = await rankMatches(ctx, rawMatches, {
      excludeSlug: args.appSlug,
      limit: requestedLimit,
    })

    if (ranked.length === 0) {
      return []
    }

    const appDetails = await ctx.runQuery(api.appCatalog.getAppsBySlugs, {
      slugs: ranked.map((entry) => entry.appSlug),
    })
    const appBySlug = new Map(appDetails.map((app) => [app.slug, app]))

    return ranked
      .map((entry) => {
        const app = appBySlug.get(entry.appSlug)
        if (!app) {
          return null
        }

        return {
          appSlug: app.slug,
          name: app.name,
          description: app.description,
          websiteHost: app.websiteHost,
          logo: app.logo,
        }
      })
      .filter((value): value is { appSlug: string; name: string; description: string; websiteHost: string; logo: string } => Boolean(value))
  },
})
