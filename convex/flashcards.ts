import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import {
  getEntitledExternalUserId,
  requireEntitledExternalUserId,
} from "./entitlements";

const sampleCards = [
  {
    front: "# Binary search\n\nWhat are the preconditions?",
    back: `- The array must be **sorted**\n- Each step halves the search space\n\n\`\`\`mermaid\nflowchart TD\n  A[Start] --> B{Sorted?}\n  B -- Yes --> C[Binary search]\n  B -- No --> D[Sort first]\n\`\`\`\n`,
    tags: ["algorithms", "search"],
  },
  {
    front: "# HTTP status 404\n\nWhat does it mean?",
    back: "The server could not find the requested resource.",
    tags: ["web", "http"],
  },
];

async function isActiveDeckOwnedByUser(
  db: any,
  userId: string,
  deckId: any,
) {
  const deck = await db.get(deckId);
  return Boolean(deck && deck.userId === userId && !deck.deleted);
}

async function filterCardsInActiveDecks(
  db: any,
  userId: string,
  cards: any[],
  limit: number,
) {
  const deckState = new Map<string, boolean>();
  const visible: any[] = [];
  for (const card of cards) {
    if (!card.deckId) {
      visible.push(card);
    } else {
      const key = String(card.deckId);
      let active = deckState.get(key);
      if (active === undefined) {
        active = await isActiveDeckOwnedByUser(db, userId, card.deckId);
        deckState.set(key, active);
      }
      if (active) visible.push(card);
    }
    if (visible.length >= limit) break;
  }
  return visible;
}

export const list = queryGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
  },
  handler: async (ctx, { deckId }) => {
    const userId = await getEntitledExternalUserId(ctx);
    if (!userId) return [];
    const { db } = ctx;

    if (deckId) {
      const deckOk = await isActiveDeckOwnedByUser(db, userId, deckId);
      if (!deckOk) return [];
      return await db
        .query("cards")
        .withIndex("by_user_deck_updatedAt", (q: any) =>
          q.eq("userId", userId).eq("deckId", deckId),
        )
        .order("desc")
        .take(200);
    }

    const rows = await db
      .query("cards")
      .withIndex("by_user_updatedAt", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(400);
    return await filterCardsInActiveDecks(db, userId, rows, 200);
  },
});

export const create = mutationGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
    front: v.string(),
    back: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { deckId, front, back, tags }) => {
    const userId = await requireEntitledExternalUserId(ctx);
    const { db } = ctx;

    if (deckId) {
      const deckOk = await isActiveDeckOwnedByUser(db, userId, deckId);
      if (!deckOk) {
        throw new Error("Deck not found");
      }
    }

    const now = Date.now();
    const cleanedTags =
      tags
        ?.map((tag) => tag.trim())
        .filter((tag) => tag.length > 0) ?? [];

    return await db.insert("cards", {
      userId,
      deckId,
      front: front.trim(),
      back: back.trim(),
      tags: cleanedTags,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutationGeneric({
  args: {
    id: v.id("cards"),
    deckId: v.optional(v.id("decks")),
    front: v.string(),
    back: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, deckId, front, back, tags }) => {
    const userId = await requireEntitledExternalUserId(ctx);
    const { db } = ctx;

    const card = await db.get(id);
    if (!card || card.userId !== userId) {
      throw new Error("Card not found");
    }
    if (deckId) {
      const deckOk = await isActiveDeckOwnedByUser(db, userId, deckId);
      if (!deckOk) {
        throw new Error("Deck not found");
      }
    }

    const cleanedTags =
      tags
        ?.map((tag) => tag.trim())
        .filter((tag) => tag.length > 0) ?? [];

    const now = Date.now();
    await db.patch(id, {
      deckId,
      front: front.trim(),
      back: back.trim(),
      tags: cleanedTags,
      updatedAt: now,
    });

    const links = await db
      .query("cardChatLinks")
      .withIndex("by_cardId", (q: any) => q.eq("cardId", id))
      .collect();
    for (const link of links) {
      if (link.userId !== userId) continue;
      await db.patch(link._id, {
        manuallyModified: true,
        updatedAt: now,
      });
    }
  },
});

export const remove = mutationGeneric({
  args: {
    id: v.id("cards"),
  },
  handler: async (ctx, { id }) => {
    const userId = await requireEntitledExternalUserId(ctx);
    const { db } = ctx;

    const card = await db.get(id);
    if (!card || card.userId !== userId) {
      throw new Error("Card not found");
    }

    const progress = await db
      .query("cardProgress")
      .withIndex("by_cardId", (q) => q.eq("cardId", id))
      .first();
    if (progress) await db.delete(progress._id);

    const links = await db
      .query("cardChatLinks")
      .withIndex("by_cardId", (q: any) => q.eq("cardId", id))
      .collect();
    for (const link of links) {
      if (link.userId !== userId) continue;
      await db.delete(link._id);
    }

    await db.delete(id);
  },
});

export const bulkCreate = mutationGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
    cards: v.array(
      v.object({
        front: v.string(),
        back: v.string(),
        tags: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: async (ctx, { deckId, cards }) => {
    const userId = await requireEntitledExternalUserId(ctx);
    const { db } = ctx;

    if (deckId) {
      const deckOk = await isActiveDeckOwnedByUser(db, userId, deckId);
      if (!deckOk) {
        throw new Error("Deck not found");
      }
    }

    const now = Date.now();
    let created = 0;
    for (const [i, card] of cards.entries()) {
      const tags =
        card.tags
          ?.map((t) => t.trim())
          .filter((t) => t.length > 0) ?? [];
      await db.insert("cards", {
        userId,
        deckId,
        front: card.front.trim(),
        back: card.back.trim(),
        tags,
        createdAt: now + i,
        updatedAt: now + i,
      });
      created++;
    }
    return created;
  },
});

export const seed = mutationGeneric({
  handler: async (ctx) => {
    const userId = await requireEntitledExternalUserId(ctx);
    const { db } = ctx;

    const now = Date.now();
    const deckId = await db.insert("decks", {
      userId,
      name: "Sample Deck",
      description: "Example cards with Markdown + Mermaid.",
      deleted: false,
      createdAt: now,
      updatedAt: now,
    });
    let created = 0;
    for (const [index, card] of sampleCards.entries()) {
      await db.insert("cards", {
        ...card,
        userId,
        deckId,
        createdAt: now + index,
        updatedAt: now + index,
      });
      created += 1;
    }
    return created;
  },
});
