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
    trialEndsAt: v.optional(v.number()),
    trialRedeemedAt: v.optional(v.number()),
    manualAccessTier: v.optional(v.string()),
    manualAccessEndsAt: v.optional(v.number()),
    manualAccessReason: v.optional(v.string()),
    manualAccessGrantedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_email", ["email"])
    .index("by_paddleCustomerId", ["paddleCustomerId"]),

  authIdentities: defineTable({
    provider: v.string(),
    providerSubject: v.string(),
    userId: v.id("users"),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_provider_subject", ["provider", "providerSubject"])
    .index("by_providerSubject_updatedAt", ["providerSubject", "updatedAt"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"])
    .index("by_email_updatedAt", ["email", "updatedAt"]),

  subscriptions: defineTable({
    userId: v.id("users"),
    paddleSubscriptionId: v.string(),
    paddleCustomerId: v.optional(v.string()),
    status: v.string(),
    appPlan: v.optional(v.string()),
    requiresPriceMappingReview: v.optional(v.boolean()),
    tier: v.optional(v.string()),
    tierSourcePriceId: v.optional(v.string()),
    priceId: v.optional(v.string()),
    productId: v.optional(v.string()),
    currentPeriodStartsAt: v.optional(v.number()),
    currentPeriodEndsAt: v.optional(v.number()),
    nextBilledAt: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    lastEventOccurredAt: v.optional(v.number()),
    lastSubscriptionUpdatedAt: v.optional(v.number()),
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
    externalId: v.optional(v.string()),
    checkoutSessionId: v.optional(v.string()),
    paddleSubscriptionId: v.optional(v.string()),
    paddleCustomerId: v.optional(v.string()),
    subscriptionUpdatedAt: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    priceId: v.optional(v.string()),
    priceIds: v.optional(v.array(v.string())),
    productId: v.optional(v.string()),
    currentPeriodStartsAt: v.optional(v.union(v.string(), v.null())),
    currentPeriodEndsAt: v.optional(v.union(v.string(), v.null())),
    nextBilledAt: v.optional(v.union(v.string(), v.null())),
    canceledAt: v.optional(v.union(v.string(), v.null())),
    rawBody: v.optional(v.string()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_status_externalId", ["status", "externalId"])
    .index("by_status_customerId", ["status", "paddleCustomerId"]),

  billingRecoveryCases: defineTable({
    userId: v.id("users"),
    externalId: v.string(),
    status: v.string(),
    issueCodes: v.array(v.string()),
    paddleCustomerId: v.optional(v.string()),
    paddleSubscriptionIds: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastDetectedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  paddleCheckoutSessions: defineTable({
    sessionId: v.string(),
    userId: v.id("users"),
    externalId: v.string(),
    plan: v.string(),
    priceId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    paddleCustomerId: v.optional(v.string()),
    paddleSubscriptionId: v.optional(v.string()),
    clientCompletedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_completedAt", ["userId", "completedAt"]),

  billingPlanPrices: defineTable({
    plan: v.string(),
    tier: v.string(),
    interval: v.string(),
    trialEligible: v.boolean(),
    paddlePriceId: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plan", ["plan"])
    .index("by_priceId", ["paddlePriceId"])
    .index("by_active_plan", ["active", "plan"]),

  magicLinks: defineTable({
    tokenHash: v.string(),
    userId: v.string(),
    email: v.string(),
    name: v.string(),
    callbackUrl: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_email_createdAt", ["email", "createdAt"]),

  featureUsageMonthly: defineTable({
    userId: v.id("users"),
    feature: v.string(),
    monthKey: v.string(),
    usedUnits: v.number(),
    quotaUnits: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_feature_month", ["userId", "feature", "monthKey"])
    .index("by_user_month", ["userId", "monthKey"]),

  decks: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    deleted: v.optional(v.boolean()),
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

  cardStudyChats: defineTable({
    userId: v.string(),
    cardId: v.id("cards"),
    status: v.string(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    messageCount: v.number(),
    lastMessagePreview: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_card_updatedAt", ["cardId", "updatedAt"])
    .index("by_user_updatedAt", ["userId", "updatedAt"]),

  cardStudyMessages: defineTable({
    userId: v.string(),
    chatId: v.id("cardStudyChats"),
    role: v.string(),
    content: v.string(),
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

  reviewEvents: defineTable({
    userId: v.string(),
    cardId: v.id("cards"),
    deckId: v.optional(v.id("decks")),
    quality: v.number(),
    reviewedAt: v.number(),
    dayStart: v.number(),
  })
    .index("by_user_reviewedAt", ["userId", "reviewedAt"])
    .index("by_user_dayStart", ["userId", "dayStart"]),

  studyStates: defineTable({
    userId: v.string(),
    deckId: v.id("decks"),
    mode: v.string(),
    sourceChatId: v.optional(v.id("chats")),
    currentCardId: v.optional(v.id("cards")),
    currentIndex: v.number(),
    totalCards: v.number(),
    orderFingerprint: v.string(),
    startedAt: v.number(),
    lastSeenAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user_deck_mode_chat", ["userId", "deckId", "mode", "sourceChatId"])
    .index("by_user_mode_updatedAt", ["userId", "mode", "updatedAt"])
    .index("by_user_deck_updatedAt", ["userId", "deckId", "updatedAt"]),

  voiceSessions: defineTable({
    userId: v.string(),
    deckId: v.optional(v.id("decks")),
    cardId: v.optional(v.id("cards")),
    cardChatId: v.optional(v.id("cardStudyChats")),
    channel: v.string(), // "study" | "tutor"
    locale: v.string(),
    status: v.string(), // "active" | "ended"
    createdAt: v.number(),
    updatedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_user_updatedAt", ["userId", "updatedAt"])
    .index("by_user_status_updatedAt", ["userId", "status", "updatedAt"]),

  voiceEvents: defineTable({
    userId: v.string(),
    sessionId: v.id("voiceSessions"),
    source: v.string(), // "user" | "assistant" | "system"
    channel: v.string(), // "study" | "tutor"
    type: v.string(), // "transcript" | "command" | "spoken" | "evaluation" | "error"
    text: v.string(),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session_createdAt", ["sessionId", "createdAt"])
    .index("by_user_createdAt", ["userId", "createdAt"]),
});
