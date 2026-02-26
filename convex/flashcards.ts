import { mutationGeneric, queryGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";

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

async function getUserId(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const userId = await getUserId(ctx);
  if (!userId) throw new ConvexError("Unauthorized");
  return userId;
}

export const list = queryGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
  },
  handler: async (ctx, { deckId }) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const { db } = ctx;

    if (deckId) {
      const deck = await db.get(deckId);
      if (!deck || deck.userId !== userId) return [];
      return await db
        .query("cards")
        .withIndex("by_user_deck_updatedAt", (q: any) =>
          q.eq("userId", userId).eq("deckId", deckId),
        )
        .order("desc")
        .take(200);
    }
    return await db
      .query("cards")
      .withIndex("by_user_updatedAt", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(200);
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
    const userId = await requireUserId(ctx);
    const { db } = ctx;

    if (deckId) {
      const deck = await db.get(deckId);
      if (!deck || deck.userId !== userId) {
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
    const userId = await requireUserId(ctx);
    const { db } = ctx;

    const card = await db.get(id);
    if (!card || card.userId !== userId) {
      throw new Error("Card not found");
    }
    if (deckId) {
      const deck = await db.get(deckId);
      if (!deck || deck.userId !== userId) {
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
    const userId = await requireUserId(ctx);
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
    const userId = await requireUserId(ctx);
    const { db } = ctx;

    if (deckId) {
      const deck = await db.get(deckId);
      if (!deck || deck.userId !== userId) {
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
    const userId = await requireUserId(ctx);
    const { db } = ctx;

    const now = Date.now();
    const deckId = await db.insert("decks", {
      userId,
      name: "Sample Deck",
      description: "Example cards with Markdown + Mermaid.",
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
