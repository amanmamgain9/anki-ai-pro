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
    const rows = await db
      .query("decks")
      .withIndex("by_user_updatedAt", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(300);
    return rows.filter((deck: any) => !deck.deleted).slice(0, 100);
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
      deleted: false,
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
    if (!deck || deck.userId !== userId || deck.deleted) {
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
    if (!deck || deck.userId !== userId || deck.deleted) {
      throw new Error("Deck not found");
    }
    await db.patch(id, {
      deleted: true,
      updatedAt: Date.now(),
    });
  },
});
