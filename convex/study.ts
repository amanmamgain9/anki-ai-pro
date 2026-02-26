import { mutationGeneric, queryGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";

const DAY_MS = 86_400_000;

async function getUserId(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const userId = await getUserId(ctx);
  if (!userId) throw new ConvexError("Unauthorized");
  return userId;
}

/**
 * SM-2 spaced repetition algorithm.
 *
 * quality: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
 * Maps to SM-2 quality scores: 1, 3, 4, 5
 */
function sm2(
  quality: number,
  prev: { easeFactor: number; interval: number; repetitions: number },
) {
  const q = [1, 3, 4, 5][quality] ?? 4;

  let { easeFactor, interval, repetitions } = prev;

  if (q >= 3) {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * easeFactor);

    easeFactor += 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  } else {
    repetitions = 0;
    interval = 1;
  }

  easeFactor = Math.max(1.3, easeFactor);

  return { easeFactor, interval, repetitions };
}

async function listCardsByDeck(
  db: any,
  userId: string,
  deckId?: any,
) {
  if (deckId) {
    const deck = await db.get(deckId);
    if (!deck || deck.userId !== userId) {
      return null;
    }
    const cards = await db
      .query("cards")
      .withIndex("by_user_deck_updatedAt", (q: any) =>
        q.eq("userId", userId).eq("deckId", deckId),
      )
      .collect();
    return cards.sort((a: any, b: any) => a.createdAt - b.createdAt);
  }

  const cards = await db
    .query("cards")
    .withIndex("by_user_updatedAt", (q: any) => q.eq("userId", userId))
    .collect();
  return cards.sort((a: any, b: any) => a.createdAt - b.createdAt);
}

async function withProgress(db: any, cards: any[]) {
  return Promise.all(
    cards.map(async (card: any) => {
      const progress = await db
        .query("cardProgress")
        .withIndex("by_cardId", (q: any) => q.eq("cardId", card._id))
        .first();
      return { card, progress };
    }),
  );
}

export const getDueCards = queryGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
    all: v.optional(v.boolean()),
  },
  handler: async (ctx, { deckId, all }) => {
    const userId = await getUserId(ctx);
    if (!userId) return { due: [], total: 0, reviewed: 0 };
    const { db } = ctx;
    const now = Date.now();

    const cards = await listCardsByDeck(db, userId, deckId);
    if (cards === null) return { due: [], total: 0, reviewed: 0 };
    const cardsWithProgress = await withProgress(db, cards);

    const due = all
      ? cardsWithProgress.sort((a, b) => {
          if (!a.progress) return -1;
          if (!b.progress) return 1;
          return a.progress.dueAt - b.progress.dueAt;
        })
      : cardsWithProgress
          .filter(({ progress }) => !progress || progress.dueAt <= now)
          .sort((a, b) => {
            if (!a.progress) return -1;
            if (!b.progress) return 1;
            return a.progress.dueAt - b.progress.dueAt;
          });

    return {
      due: due.map(({ card, progress }) => ({
        ...card,
        progress: progress
          ? {
              easeFactor: progress.easeFactor,
              interval: progress.interval,
              repetitions: progress.repetitions,
              dueAt: progress.dueAt,
            }
          : null,
      })),
      total: cards.length,
      reviewed: cardsWithProgress.filter(
        ({ progress }) => progress && progress.dueAt > now,
      ).length,
    };
  },
});

export const getLinearCards = queryGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
    chatId: v.optional(v.id("chats")),
  },
  handler: async (ctx, { deckId, chatId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return { due: [], total: 0, reviewed: 0 };
    const { db } = ctx;
    const now = Date.now();

    let cards: any[] = [];

    if (chatId) {
      const chat = await db.get(chatId);
      if (!chat || chat.userId !== userId) {
        return { due: [], total: 0, reviewed: 0 };
      }

      const links = await db
        .query("cardChatLinks")
        .withIndex("by_chatId", (q: any) => q.eq("chatId", chatId))
        .collect();

      const linkByChatCardId = new Map<string, any>();
      const fallbackLinks: any[] = [];
      for (const link of links) {
        if (link.chatCardId) linkByChatCardId.set(String(link.chatCardId), link);
        else fallbackLinks.push(link);
      }

      const chatCards = await db
        .query("chatCards")
        .withIndex("by_chat_order", (q: any) => q.eq("chatId", chatId))
        .collect();

      const orderedLinks: any[] = [];
      for (const chatCard of chatCards) {
        const linked = linkByChatCardId.get(String(chatCard._id));
        if (linked) orderedLinks.push(linked);
      }

      fallbackLinks.sort((a, b) => a.createdAt - b.createdAt);
      for (const link of fallbackLinks) {
        if (!orderedLinks.find((x) => String(x._id) === String(link._id))) {
          orderedLinks.push(link);
        }
      }

      const linkedCards = await Promise.all(
        orderedLinks.map((link) => db.get(link.cardId)),
      );
      cards = linkedCards.filter((card) => card && card.userId === userId);

      if (cards.length === 0) {
        const fallbackCards = await listCardsByDeck(db, userId, deckId || chat.deckId);
        if (fallbackCards === null) return { due: [], total: 0, reviewed: 0 };
        cards = fallbackCards;
      }
    } else {
      const fallbackCards = await listCardsByDeck(db, userId, deckId);
      if (fallbackCards === null) return { due: [], total: 0, reviewed: 0 };
      cards = fallbackCards;
    }

    const seen = new Set<string>();
    const orderedUniqueCards = cards.filter((card) => {
      if (!card) return false;
      const id = String(card._id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const cardsWithProgress = await withProgress(db, orderedUniqueCards);

    return {
      due: cardsWithProgress.map(({ card, progress }) => ({
        ...card,
        progress: progress
          ? {
              easeFactor: progress.easeFactor,
              interval: progress.interval,
              repetitions: progress.repetitions,
              dueAt: progress.dueAt,
            }
          : null,
      })),
      total: orderedUniqueCards.length,
      reviewed: cardsWithProgress.filter(
        ({ progress }) => progress && progress.dueAt > now,
      ).length,
    };
  },
});

export const recordReview = mutationGeneric({
  args: {
    cardId: v.id("cards"),
    quality: v.number(),
  },
  handler: async (ctx, { cardId, quality }) => {
    const userId = await requireUserId(ctx);
    const { db } = ctx;

    const card = await db.get(cardId);
    if (!card || card.userId !== userId) {
      throw new Error("Card not found");
    }

    const now = Date.now();
    const q = Math.max(0, Math.min(3, Math.round(quality)));

    const existing = await db
      .query("cardProgress")
      .withIndex("by_cardId", (q: any) => q.eq("cardId", cardId))
      .first();

    const prev = existing
      ? {
          easeFactor: existing.easeFactor,
          interval: existing.interval,
          repetitions: existing.repetitions,
        }
      : { easeFactor: 2.5, interval: 0, repetitions: 0 };

    const next = sm2(q, prev);
    const dueAt = now + next.interval * DAY_MS;

    if (existing) {
      await db.patch(existing._id, {
        easeFactor: next.easeFactor,
        interval: next.interval,
        repetitions: next.repetitions,
        dueAt,
        lastReviewedAt: now,
      });
    } else {
      await db.insert("cardProgress", {
        userId,
        cardId,
        easeFactor: next.easeFactor,
        interval: next.interval,
        repetitions: next.repetitions,
        dueAt,
        lastReviewedAt: now,
      });
    }

    return { nextDueAt: dueAt, interval: next.interval };
  },
});

export const getSessionStats = queryGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
  },
  handler: async (ctx, { deckId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return { total: 0, newCount: 0, dueCount: 0, reviewedToday: 0 };
    const { db } = ctx;
    const now = Date.now();
    const todayStart = now - (now % DAY_MS);
    const cards = await listCardsByDeck(db, userId, deckId);
    if (cards === null) return { total: 0, newCount: 0, dueCount: 0, reviewedToday: 0 };

    let newCount = 0;
    let dueCount = 0;
    let reviewedToday = 0;

    for (const card of cards) {
      const progress = await db
        .query("cardProgress")
        .withIndex("by_cardId", (q: any) => q.eq("cardId", card._id))
        .first();

      if (!progress) {
        newCount++;
      } else if (progress.dueAt <= now) {
        dueCount++;
      }

      if (progress?.lastReviewedAt && progress.lastReviewedAt >= todayStart) {
        reviewedToday++;
      }
    }

    return { total: cards.length, newCount, dueCount, reviewedToday };
  },
});
