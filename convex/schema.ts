import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  decks: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_updatedAt", ["updatedAt"]),

  cards: defineTable({
    deckId: v.optional(v.id("decks")),
    front: v.string(),
    back: v.string(),
    tags: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_updatedAt", ["updatedAt"])
    .index("by_deck_updatedAt", ["deckId", "updatedAt"]),

  cardProgress: defineTable({
    cardId: v.id("cards"),
    easeFactor: v.number(),
    interval: v.number(),
    repetitions: v.number(),
    dueAt: v.number(),
    lastReviewedAt: v.optional(v.number()),
  })
    .index("by_cardId", ["cardId"])
    .index("by_dueAt", ["dueAt"]),
});
