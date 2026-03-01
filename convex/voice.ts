import { mutationGeneric, queryGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";

const EVENT_TEXT_MAX = 6_000;
const EVENT_META_MAX = 8_000;

async function getUserId(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const userId = await getUserId(ctx);
  if (!userId) throw new ConvexError("Unauthorized");
  return userId;
}

async function assertOwnsDeck(db: any, userId: string, deckId?: any) {
  if (!deckId) return;
  const deck = await db.get(deckId);
  if (!deck || deck.userId !== userId) {
    throw new ConvexError("Deck not found");
  }
}

async function assertOwnsCard(db: any, userId: string, cardId?: any) {
  if (!cardId) return;
  const card = await db.get(cardId);
  if (!card || card.userId !== userId) {
    throw new ConvexError("Card not found");
  }
}

async function assertOwnsCardChat(db: any, userId: string, cardChatId?: any) {
  if (!cardChatId) return;
  const chat = await db.get(cardChatId);
  if (!chat || chat.userId !== userId) {
    throw new ConvexError("Card chat not found");
  }
}

async function assertOwnsSession(db: any, userId: string, id: any) {
  const session = await db.get(id);
  if (!session || session.userId !== userId) {
    throw new ConvexError("Voice session not found");
  }
  return session;
}

export const startSession = mutationGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
    cardId: v.optional(v.id("cards")),
    cardChatId: v.optional(v.id("cardStudyChats")),
    channel: v.string(),
    locale: v.string(),
  },
  handler: async (ctx, { deckId, cardId, cardChatId, channel, locale }) => {
    const userId = await requireUserId(ctx);
    await assertOwnsDeck(ctx.db, userId, deckId);
    await assertOwnsCard(ctx.db, userId, cardId);
    await assertOwnsCardChat(ctx.db, userId, cardChatId);

    const now = Date.now();
    const id = await ctx.db.insert("voiceSessions", {
      userId,
      deckId,
      cardId,
      cardChatId,
      channel,
      locale,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

export const appendEvent = mutationGeneric({
  args: {
    sessionId: v.id("voiceSessions"),
    source: v.string(),
    channel: v.string(),
    type: v.string(),
    text: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, source, channel, type, text, metadata }) => {
    const userId = await requireUserId(ctx);
    const session = await assertOwnsSession(ctx.db, userId, sessionId);
    const now = Date.now();

    await ctx.db.insert("voiceEvents", {
      userId,
      sessionId,
      source,
      channel,
      type,
      text: text.length <= EVENT_TEXT_MAX ? text : text.slice(0, EVENT_TEXT_MAX),
      metadata:
        metadata && metadata.length > EVENT_META_MAX
          ? metadata.slice(0, EVENT_META_MAX)
          : metadata,
      createdAt: now,
    });

    await ctx.db.patch(session._id, {
      updatedAt: now,
      channel,
    });

    return { ok: true };
  },
});

export const updateSessionContext = mutationGeneric({
  args: {
    sessionId: v.id("voiceSessions"),
    deckId: v.optional(v.id("decks")),
    cardId: v.optional(v.id("cards")),
    cardChatId: v.optional(v.id("cardStudyChats")),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, deckId, cardId, cardChatId, channel }) => {
    const userId = await requireUserId(ctx);
    const session = await assertOwnsSession(ctx.db, userId, sessionId);
    await assertOwnsDeck(ctx.db, userId, deckId);
    await assertOwnsCard(ctx.db, userId, cardId);
    await assertOwnsCardChat(ctx.db, userId, cardChatId);

    await ctx.db.patch(session._id, {
      deckId,
      cardId,
      cardChatId,
      channel: channel ?? session.channel,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const endSession = mutationGeneric({
  args: {
    sessionId: v.id("voiceSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const userId = await requireUserId(ctx);
    const session = await assertOwnsSession(ctx.db, userId, sessionId);
    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "ended",
      endedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const listRecentSessions = queryGeneric({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("voiceSessions")
      .withIndex("by_user_updatedAt", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(Math.max(1, Math.min(limit ?? 20, 100)));

    return rows.map((row: any) => ({
      _id: row._id,
      deckId: row.deckId ?? null,
      cardId: row.cardId ?? null,
      cardChatId: row.cardChatId ?? null,
      channel: row.channel,
      locale: row.locale,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      endedAt: row.endedAt ?? null,
    }));
  },
});
