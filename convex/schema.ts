import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    externalId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    paddleCustomerId: v.optional(v.string()),
    onboardingCompletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_paddleCustomerId", ["paddleCustomerId"]),

  subscriptions: defineTable({
    userId: v.id("users"),
    paddleSubscriptionId: v.string(),
    paddleCustomerId: v.optional(v.string()),
    status: v.string(),
    priceId: v.optional(v.string()),
    productId: v.optional(v.string()),
    currentPeriodStartsAt: v.optional(v.number()),
    currentPeriodEndsAt: v.optional(v.number()),
    nextBilledAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastEventType: v.optional(v.string()),
  })
    .index("by_paddleSubscriptionId", ["paddleSubscriptionId"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"]),

  billingEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    occurredAt: v.optional(v.number()),
    processedAt: v.number(),
    status: v.string(),
    userId: v.optional(v.id("users")),
    paddleSubscriptionId: v.optional(v.string()),
    paddleCustomerId: v.optional(v.string()),
    rawBody: v.optional(v.string()),
  }).index("by_eventId", ["eventId"]),

  decks: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_updatedAt", ["userId", "updatedAt"]),

  cards: defineTable({
    userId: v.string(),
    deckId: v.optional(v.id("decks")),
    front: v.string(),
    back: v.string(),
    tags: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_updatedAt", ["userId", "updatedAt"])
    .index("by_user_deck_updatedAt", ["userId", "deckId", "updatedAt"]),

  chats: defineTable({
    userId: v.string(),
    status: v.string(),
    topic: v.optional(v.string()),
    level: v.optional(v.string()),
    count: v.number(),
    saveMode: v.string(),
    deckId: v.optional(v.id("decks")),
    autoDeckName: v.optional(v.string()),
    workspace: v.string(),
    title: v.optional(v.string()),
    preview: v.optional(v.string()),
    cardCount: v.number(),
    messageCount: v.number(),
    committedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_status_updatedAt", ["userId", "status", "updatedAt"])
    .index("by_user_updatedAt", ["userId", "updatedAt"]),

  chatMessages: defineTable({
    userId: v.string(),
    chatId: v.id("chats"),
    role: v.string(),
    text: v.string(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_chat_order", ["chatId", "order"]),

  chatCards: defineTable({
    userId: v.string(),
    chatId: v.id("chats"),
    front: v.string(),
    back: v.string(),
    tags: v.array(v.string()),
    order: v.number(),
    manuallyModified: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_chat_order", ["chatId", "order"]),

  cardChatLinks: defineTable({
    userId: v.string(),
    cardId: v.id("cards"),
    chatId: v.id("chats"),
    chatCardId: v.optional(v.id("chatCards")),
    manuallyModified: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_cardId", ["cardId"])
    .index("by_chatId", ["chatId"]),

  cardProgress: defineTable({
    userId: v.string(),
    cardId: v.id("cards"),
    easeFactor: v.number(),
    interval: v.number(),
    repetitions: v.number(),
    dueAt: v.number(),
    lastReviewedAt: v.optional(v.number()),
  })
    .index("by_cardId", ["cardId"])
    .index("by_user_dueAt", ["userId", "dueAt"]),
});
