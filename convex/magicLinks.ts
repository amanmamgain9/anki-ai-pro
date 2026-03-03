import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

export const registerToken = mutationGeneric({
  args: {
    tokenHash: v.string(),
    userId: v.string(),
    email: v.string(),
    name: v.string(),
    callbackUrl: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("magicLinks")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        email: args.email,
        name: args.name,
        callbackUrl: args.callbackUrl,
        expiresAt: args.expiresAt,
        updatedAt: now,
      });
      return { ok: true, updated: true };
    }

    await ctx.db.insert("magicLinks", {
      tokenHash: args.tokenHash,
      userId: args.userId,
      email: args.email,
      name: args.name,
      callbackUrl: args.callbackUrl,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, updated: false };
  },
});

export const consumeToken = mutationGeneric({
  args: {
    tokenHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, { tokenHash, now }) => {
    const row = await ctx.db
      .query("magicLinks")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();

    if (!row) {
      return { ok: false as const, reason: "not_found" as const };
    }
    if (typeof row.usedAt === "number") {
      return { ok: false as const, reason: "used" as const };
    }
    if (now >= row.expiresAt) {
      return { ok: false as const, reason: "expired" as const };
    }

    await ctx.db.patch(row._id, {
      usedAt: now,
      updatedAt: now,
    });

    return {
      ok: true as const,
      claims: {
        userId: row.userId,
        email: row.email,
        name: row.name,
        callbackUrl: row.callbackUrl,
      },
    };
  },
});

export const getTokenStatus = queryGeneric({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query("magicLinks")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!row) return { exists: false as const };
    return {
      exists: true as const,
      usedAt: row.usedAt ?? null,
      expiresAt: row.expiresAt,
    };
  },
});
