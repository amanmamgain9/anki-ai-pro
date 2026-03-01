import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import {
  getEntitledExternalUserId,
  requireEntitledExternalUserId,
} from "./entitlements";

export const list = queryGeneric({
  handler: async (ctx) => {
    const userId = await getEntitledExternalUserId(ctx);
    if (!userId) return [];
    const { db } = ctx;
    return await db
      .query("decks")
      .withIndex("by_user_updatedAt", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

export const create = mutationGeneric({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { name, description }) => {
    const userId = await requireEntitledExternalUserId(ctx);
    const { db } = ctx;
    const now = Date.now();
    return await db.insert("decks", {
      userId,
      name: name.trim(),
      description: description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutationGeneric({
  args: {
    id: v.id("decks"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, description }) => {
    const userId = await requireEntitledExternalUserId(ctx);
    const { db } = ctx;
    const deck = await db.get(id);
    if (!deck || deck.userId !== userId) {
      throw new Error("Deck not found");
    }
    await db.patch(id, {
      name: name.trim(),
      description: description?.trim() || undefined,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutationGeneric({
  args: {
    id: v.id("decks"),
  },
  handler: async (ctx, { id }) => {
    const userId = await requireEntitledExternalUserId(ctx);
    const { db } = ctx;
    const deck = await db.get(id);
    if (!deck || deck.userId !== userId) {
      throw new Error("Deck not found");
    }
    const cards = await db
      .query("cards")
      .withIndex("by_user_deck_updatedAt", (q: any) =>
        q.eq("userId", userId).eq("deckId", id),
      )
      .collect();
    for (const card of cards) {
      const progress = await db
        .query("cardProgress")
        .withIndex("by_cardId", (q) => q.eq("cardId", card._id))
        .first();
      if (progress) await db.delete(progress._id);
      await db.delete(card._id);
    }
    await db.delete(id);
  },
});
