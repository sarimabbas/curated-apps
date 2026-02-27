import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  products: defineTable({
    title: v.string(),
    imageId: v.string(),
    price: v.number(),
  }),
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
