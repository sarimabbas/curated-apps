import { v } from 'convex/values'
import { action, internalMutation, internalQuery, type ActionCtx } from './_generated/server'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'

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

const syncAppValidator = v.object({
  slug: v.string(),
  name: v.string(),
  description: v.string(),
  websiteHost: v.string(),
  tags: v.array(v.string()),
  createdAtMs: v.number(),
  updatedAtMs: v.number(),
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
  websiteHost: string
  tags: string[]
  createdAtMs: number
  updatedAtMs: number
}) {
  return [
    app.name,
    app.description,
    app.websiteHost,
    app.tags.join(' '),
    `created ${new Date(app.createdAtMs).toISOString()}`,
    `updated ${new Date(app.updatedAtMs).toISOString()}`,
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

  const docs = await ctx.runQuery((internal as any).appCatalog.fetchByIds, { ids })
  const docsById = new Map<string, any>(docs.map((doc: any) => [String(doc._id), doc]))

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

  const summaries = (await ctx.runQuery((api as any).appRatings.getSummaries, {
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

export const upsertCatalog = internalMutation({
  args: {
    appSlug: v.string(),
    name: v.string(),
    description: v.string(),
    websiteHost: v.string(),
    tags: v.array(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    sourceText: v.string(),
    embedding: v.array(v.float64()),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('appCatalog')
      .withIndex('by_app_slug', (q) => q.eq('appSlug', args.appSlug))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, args)
      return existing._id
    }

    return await ctx.db.insert('appCatalog', args)
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

    await ctx.db.delete(existing._id)
    return existing._id
  },
})

export const ensureSynced = action({
  args: {
    apps: v.array(syncAppValidator),
  },
  handler: async (ctx, args) => {
    if (args.apps.length > MAX_SYNC_APPS) {
      throw new Error(`Refusing to sync more than ${MAX_SYNC_APPS} apps in one request.`)
    }

    const snapshot = (await ctx.runQuery((internal as any).appCatalog.getSyncSnapshot, {})) as Array<{
      _id: any
      appSlug: string
      sourceText: string
      updatedAtMs: number
    }>
    const snapshotBySlug = new Map(snapshot.map((item) => [item.appSlug, item]))
    const inputSlugs = new Set(args.apps.map((app) => app.slug))

    let createdOrUpdated = 0
    let skipped = 0
    let deleted = 0

    for (const app of args.apps) {
      const sourceText = buildSourceText(app)
      const existing = snapshotBySlug.get(app.slug)

      if (existing && existing.sourceText === sourceText && existing.updatedAtMs === app.updatedAtMs) {
        skipped += 1
        continue
      }

      const embedding = await embedText(sourceText)
      await ctx.runMutation((internal as any).appCatalog.upsertCatalog, {
        appSlug: app.slug,
        name: app.name,
        description: app.description,
        websiteHost: app.websiteHost,
        tags: app.tags,
        createdAtMs: app.createdAtMs,
        updatedAtMs: app.updatedAtMs,
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
      await ctx.runMutation((internal as any).appCatalog.deleteCatalogBySlug, {
        appSlug: existing.appSlug,
      })
      deleted += 1
    }

    return {
      createdOrUpdated,
      deleted,
      skipped,
      total: args.apps.length,
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
  handler: async (ctx, args): Promise<RankedAppMatch[]> => {
    const source = (await ctx.runQuery((internal as any).appCatalog.getByAppSlug, {
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

    return await rankMatches(ctx, rawMatches, {
      excludeSlug: args.appSlug,
      limit: requestedLimit,
    })
  },
})
