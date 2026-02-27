import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const MIN_RATING = 1
const MAX_RATING = 5

export const getSummaries = query({
  args: {
    appSlugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const currentUserId = identity?.subject ?? null
    const uniqueSlugs = [...new Set(args.appSlugs)]

    const results: Record<
      string,
      {
        average: number | null
        count: number
        myRating: number | null
      }
    > = {}

    for (const appSlug of uniqueSlugs) {
      const rows = await ctx.db
        .query('appRatings')
        .withIndex('by_app_slug', (q) => q.eq('appSlug', appSlug))
        .collect()

      const count = rows.length
      const total = rows.reduce((sum, row) => sum + row.rating, 0)
      const average = count === 0 ? null : Math.round((total / count) * 10) / 10

      const myRating = currentUserId
        ? rows.find((row) => row.clerkUserId === currentUserId)?.rating ?? null
        : null

      results[appSlug] = {
        average,
        count,
        myRating,
      }
    }

    return results
  },
})

export const upsert = mutation({
  args: {
    appSlug: v.string(),
    rating: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity?.subject) {
      throw new Error(
        'Authentication token missing. Confirm Clerk JWT template "convex" and Convex auth.config.',
      )
    }

    if (!Number.isInteger(args.rating) || args.rating < MIN_RATING || args.rating > MAX_RATING) {
      throw new Error('Rating must be an integer between 1 and 5.')
    }

    const now = Date.now()
    const existing = await ctx.db
      .query('appRatings')
      .withIndex('by_app_user', (q) =>
        q.eq('appSlug', args.appSlug).eq('clerkUserId', identity.subject),
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        updatedAt: now,
      })
      return existing._id
    }

    return await ctx.db.insert('appRatings', {
      appSlug: args.appSlug,
      clerkUserId: identity.subject,
      rating: args.rating,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const remove = mutation({
  args: {
    appSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity?.subject) {
      throw new Error(
        'Authentication token missing. Confirm Clerk JWT template "convex" and Convex auth.config.',
      )
    }

    const existing = await ctx.db
      .query('appRatings')
      .withIndex('by_app_user', (q) =>
        q.eq('appSlug', args.appSlug).eq('clerkUserId', identity.subject),
      )
      .unique()

    if (!existing) {
      return null
    }

    await ctx.db.delete(existing._id)
    return existing._id
  },
})
