import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const DAY_MS = 86_400_000;

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

export const getDueCards = queryGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
    all: v.optional(v.boolean()),
  },
  handler: async ({ db }, { deckId, all }) => {
    const now = Date.now();

    let cardsQuery;
    if (deckId) {
      cardsQuery = db
        .query("cards")
        .withIndex("by_deck_updatedAt", (q: any) => q.eq("deckId", deckId))
        .collect();
    } else {
      cardsQuery = db.query("cards").withIndex("by_updatedAt").collect();
    }

    const cards = await cardsQuery;

    const withProgress = await Promise.all(
      cards.map(async (card: any) => {
        const progress = await db
          .query("cardProgress")
          .withIndex("by_cardId", (q: any) => q.eq("cardId", card._id))
          .first();
        return { card, progress };
      }),
    );

    const due = all
      ? withProgress.sort((a, b) => {
          if (!a.progress) return -1;
          if (!b.progress) return 1;
          return a.progress.dueAt - b.progress.dueAt;
        })
      : withProgress
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
      reviewed: withProgress.filter(
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
  handler: async ({ db }, { cardId, quality }) => {
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
  handler: async ({ db }, { deckId }) => {
    const now = Date.now();
    const todayStart = now - (now % DAY_MS);

    let cardsQuery;
    if (deckId) {
      cardsQuery = db
        .query("cards")
        .withIndex("by_deck_updatedAt", (q: any) => q.eq("deckId", deckId))
        .collect();
    } else {
      cardsQuery = db.query("cards").withIndex("by_updatedAt").collect();
    }
    const cards = await cardsQuery;

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
