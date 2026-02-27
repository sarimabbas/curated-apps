import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  products: defineTable({
    title: v.string(),
    imageId: v.string(),
    price: v.number(),
  }),
  appCatalog: defineTable({
    appSlug: v.string(),
    name: v.string(),
    description: v.string(),
    website: v.optional(v.string()),
    websiteHost: v.string(),
    tags: v.array(v.string()),
    createdAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    appleAppStore: v.optional(v.string()),
    logoSource: v.optional(v.string()),
    logoHash: v.optional(v.string()),
    logoStorageId: v.optional(v.id('_storage')),
    sourceText: v.string(),
    embedding: v.array(v.float64()),
    syncedAt: v.number(),
  })
    .index('by_app_slug', ['appSlug'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
    }),
  appTags: defineTable({
    slug: v.string(),
    name: v.string(),
  }).index('by_slug', ['slug']),
  appRatings: defineTable({
    appSlug: v.string(),
    clerkUserId: v.string(),
    rating: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_app_slug', ['appSlug'])
    .index('by_app_user', ['appSlug', 'clerkUserId']),
  todos: defineTable({
    text: v.string(),
    completed: v.boolean(),
  }),
})
