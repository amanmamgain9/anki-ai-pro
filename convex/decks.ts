import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

export const list = queryGeneric({
  handler: async ({ db }) => {
    return await db
      .query("decks")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(100);
  },
});

export const create = mutationGeneric({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async ({ db }, { name, description }) => {
    const now = Date.now();
    return await db.insert("decks", {
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
  handler: async ({ db }, { id, name, description }) => {
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
  handler: async ({ db }, { id }) => {
    const cards = await db
      .query("cards")
      .withIndex("by_deck_updatedAt", (q) => q.eq("deckId", id))
      .collect();
    for (const card of cards) {
      await db.delete(card._id);
    }
    await db.delete(id);
  },
});
