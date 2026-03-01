import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import {
  getEntitledExternalUserId,
  requireEntitledExternalUserId,
} from "./entitlements";

const DAY_MS = 86_400_000;

function dayStart(ts: number) {
  return ts - (ts % DAY_MS);
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
    const userId = await getEntitledExternalUserId(ctx);
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
    const userId = await getEntitledExternalUserId(ctx);
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
    const userId = await requireEntitledExternalUserId(ctx);
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

    await db.insert("reviewEvents", {
      userId,
      cardId,
      deckId: card.deckId,
      quality: q,
      reviewedAt: now,
      dayStart: dayStart(now),
    });

    return { nextDueAt: dueAt, interval: next.interval };
  },
});

export const getSessionStats = queryGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
  },
  handler: async (ctx, { deckId }) => {
    const userId = await getEntitledExternalUserId(ctx);
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

export const getReviewHeatmap = queryGeneric({
  args: {
    days: v.optional(v.number()),
    sinceUserCreated: v.optional(v.boolean()),
  },
  handler: async (ctx, { days, sinceUserCreated }) => {
    const userId = await getEntitledExternalUserId(ctx);
    const fallbackSpanDays = Math.max(28, Math.min(366, Math.floor(days ?? 182)));
    if (!userId) {
      const now = Date.now();
      const todayStart = dayStart(now);
      const start = todayStart - (fallbackSpanDays - 1) * DAY_MS;
      return {
        days: [] as Array<{ dayStart: number; count: number }>,
        startDay: start,
        endDay: todayStart,
        maxCount: 0,
        totalReviews: 0,
        activeDays: 0,
        currentStreak: 0,
        longestStreak: 0,
      };
    }

    const now = Date.now();
    const todayStart = dayStart(now);
    let start = todayStart - (fallbackSpanDays - 1) * DAY_MS;

    if (sinceUserCreated) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_externalId", (q: any) => q.eq("externalId", userId))
        .first();
      if (user?.createdAt) {
        start = dayStart(user.createdAt);
      }
    }

    if (start > todayStart) {
      start = todayStart;
    }

    const spanDays = Math.max(1, Math.floor((todayStart - start) / DAY_MS) + 1);

    const events = await ctx.db
      .query("reviewEvents")
      .withIndex("by_user_reviewedAt", (q: any) =>
        q.eq("userId", userId).gte("reviewedAt", start).lte("reviewedAt", now),
      )
      .collect();

    const countsByDay = new Map<number, number>();
    for (const event of events) {
      const key = event.dayStart ?? dayStart(event.reviewedAt);
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    // Backward compatibility: before `reviewEvents` existed we only had
    // card-level `lastReviewedAt`. Use it as a coarse fallback.
    if (events.length === 0) {
      const progress = await ctx.db
        .query("cardProgress")
        .withIndex("by_user_dueAt", (q: any) => q.eq("userId", userId))
        .collect();
      for (const row of progress) {
        if (!row.lastReviewedAt) continue;
        if (row.lastReviewedAt < start || row.lastReviewedAt > now) continue;
        const key = dayStart(row.lastReviewedAt);
        countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
      }
    }

    const cells: Array<{ dayStart: number; count: number }> = [];
    let maxCount = 0;
    let totalReviews = 0;
    let activeDays = 0;

    for (let i = 0; i < spanDays; i++) {
      const key = start + i * DAY_MS;
      const count = countsByDay.get(key) ?? 0;
      cells.push({ dayStart: key, count });
      if (count > maxCount) maxCount = count;
      totalReviews += count;
      if (count > 0) activeDays += 1;
    }

    let currentStreak = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].count > 0) currentStreak += 1;
      else break;
    }

    let longestStreak = 0;
    let running = 0;
    for (const cell of cells) {
      if (cell.count > 0) {
        running += 1;
        if (running > longestStreak) longestStreak = running;
      } else {
        running = 0;
      }
    }

    return {
      days: cells,
      startDay: start,
      endDay: todayStart,
      maxCount,
      totalReviews,
      activeDays,
      currentStreak,
      longestStreak,
    };
  },
});
