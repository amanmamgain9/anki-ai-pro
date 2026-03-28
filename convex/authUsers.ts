import { ConvexError, v } from "convex/values";
import {
  mutationGeneric,
  type GenericDatabaseWriter,
} from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  findAuthIdentityByProviderSubject,
  findCanonicalSubscriptionByPaddleSubscriptionId,
  findCanonicalUserByEmail,
  listAuthIdentitiesByUserId,
  listUsersByEmail,
  listUsersByExternalId,
  pickCanonicalSubscriptionRow,
} from "./billingIdentity";

type AuthUserDb = GenericDatabaseWriter<DataModel>;
type BillingUser = Doc<"users">;

export type CanonicalAuthUserInput = {
  provider?: string;
  providerSubject?: string;
  externalIdHint?: string;
  email?: string;
  name?: string;
  imageUrl?: string;
  now?: number;
};

function sanitizeEmail(email: string | undefined) {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function sanitizeText(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function createCanonicalExternalId(now: number) {
  return `usr_${now.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function buildMergedExternalId(row: Pick<Doc<"users">, "_id" | "externalId">) {
  return `merged:${row.externalId}:${row._id}`;
}

function selectPreferredManualAccess(
  primary: BillingUser,
  secondary: BillingUser,
  now: number,
) {
  const score = (user: BillingUser) => {
    if (user.manualAccessTier !== "pro_plus") {
      return {
        hasAccess: false,
        active: false,
        indefinite: false,
        endsAt: Number.NEGATIVE_INFINITY,
      };
    }
    const endsAt = typeof user.manualAccessEndsAt === "number" ? user.manualAccessEndsAt : null;
    const active = endsAt === null || endsAt > now;
    return {
      hasAccess: true,
      active,
      indefinite: endsAt === null,
      endsAt: endsAt ?? Number.POSITIVE_INFINITY,
    };
  };

  const primaryScore = score(primary);
  const secondaryScore = score(secondary);

  if (primaryScore.hasAccess !== secondaryScore.hasAccess) {
    return primaryScore.hasAccess ? primary : secondary;
  }
  if (primaryScore.active !== secondaryScore.active) {
    return primaryScore.active ? primary : secondary;
  }
  if (primaryScore.indefinite !== secondaryScore.indefinite) {
    return primaryScore.indefinite ? primary : secondary;
  }
  if (primaryScore.endsAt !== secondaryScore.endsAt) {
    return primaryScore.endsAt > secondaryScore.endsAt ? primary : secondary;
  }
  return primary;
}

async function migrateChatRows(
  db: AuthUserDb,
  fromExternalId: string,
  toExternalId: string,
  now: number,
) {
  const chats = await db
    .query("chats")
    .withIndex("by_user_updatedAt", (q) => q.eq("userId", fromExternalId))
    .collect();
  for (const chat of chats) {
    await db.patch(chat._id, {
      userId: toExternalId,
      updatedAt: now,
    });
    const messages = await db
      .query("chatMessages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", chat._id))
      .collect();
    for (const message of messages) {
      await db.patch(message._id, { userId: toExternalId });
    }
    const cards = await db
      .query("chatCards")
      .withIndex("by_chat_order", (q) => q.eq("chatId", chat._id))
      .collect();
    for (const card of cards) {
      await db.patch(card._id, {
        userId: toExternalId,
        updatedAt: now,
      });
    }
    const links = await db
      .query("cardChatLinks")
      .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
      .collect();
    for (const link of links) {
      await db.patch(link._id, {
        userId: toExternalId,
        updatedAt: now,
      });
    }
  }
}

async function migrateCardStudyRows(
  db: AuthUserDb,
  fromExternalId: string,
  toExternalId: string,
  now: number,
) {
  const chats = await db
    .query("cardStudyChats")
    .withIndex("by_user_updatedAt", (q) => q.eq("userId", fromExternalId))
    .collect();
  for (const chat of chats) {
    await db.patch(chat._id, {
      userId: toExternalId,
      updatedAt: now,
    });
    const messages = await db
      .query("cardStudyMessages")
      .withIndex("by_chat_order", (q) => q.eq("chatId", chat._id))
      .collect();
    for (const message of messages) {
      await db.patch(message._id, { userId: toExternalId });
    }
  }
}

async function migrateCardRows(
  db: AuthUserDb,
  fromExternalId: string,
  toExternalId: string,
  now: number,
) {
  const cards = await db
    .query("cards")
    .withIndex("by_user_updatedAt", (q) => q.eq("userId", fromExternalId))
    .collect();
  for (const card of cards) {
    await db.patch(card._id, {
      userId: toExternalId,
      updatedAt: now,
    });
    const links = await db
      .query("cardChatLinks")
      .withIndex("by_cardId", (q) => q.eq("cardId", card._id))
      .collect();
    for (const link of links) {
      await db.patch(link._id, {
        userId: toExternalId,
        updatedAt: now,
      });
    }
  }
}

async function migrateVoiceRows(
  db: AuthUserDb,
  fromExternalId: string,
  toExternalId: string,
  now: number,
) {
  const sessions = await db
    .query("voiceSessions")
    .withIndex("by_user_updatedAt", (q) => q.eq("userId", fromExternalId))
    .collect();
  for (const session of sessions) {
    await db.patch(session._id, {
      userId: toExternalId,
      updatedAt: now,
    });
    const events = await db
      .query("voiceEvents")
      .withIndex("by_session_createdAt", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const event of events) {
      await db.patch(event._id, {
        userId: toExternalId,
      });
    }
  }
}

async function migrateMagicLinkRows(
  db: AuthUserDb,
  loser: Pick<Doc<"users">, "externalId" | "email">,
  canonicalExternalId: string,
  now: number,
) {
  const email = sanitizeEmail(loser.email);
  if (!email) return;
  const rows = await db
    .query("magicLinks")
    .withIndex("by_email_createdAt", (q) => q.eq("email", email))
    .collect();
  for (const row of rows) {
    if (row.userId !== loser.externalId) continue;
    await db.patch(row._id, {
      userId: canonicalExternalId,
      updatedAt: now,
    });
  }
}

async function migrateFeatureUsageRows(
  db: AuthUserDb,
  loserUserId: Id<"users">,
  canonicalUserId: Id<"users">,
  now: number,
) {
  const existing = await db
    .query("featureUsageMonthly")
    .withIndex("by_user_month", (q) => q.eq("userId", canonicalUserId))
    .collect();
  const existingByKey = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    existingByKey.set(`${row.feature}:${row.monthKey}`, row);
  }
  const rows = await db
    .query("featureUsageMonthly")
    .withIndex("by_user_month", (q) => q.eq("userId", loserUserId))
    .collect();
  for (const row of rows) {
    const key = `${row.feature}:${row.monthKey}`;
    const target = existingByKey.get(key);
    if (!target) {
      await db.patch(row._id, {
        userId: canonicalUserId,
        updatedAt: now,
      });
      existingByKey.set(key, { ...row, userId: canonicalUserId, updatedAt: now });
      continue;
    }

    await db.patch(target._id, {
      usedUnits: target.usedUnits + row.usedUnits,
      quotaUnits:
        typeof target.quotaUnits === "number" || typeof row.quotaUnits === "number"
          ? Math.max(target.quotaUnits ?? 0, row.quotaUnits ?? 0)
          : undefined,
      updatedAt: now,
    });
    await db.delete(row._id);
  }
}

async function migrateBillingEventRows(
  db: AuthUserDb,
  loser: BillingUser,
  canonical: BillingUser,
  now: number,
) {
  const rows = await db.query("billingEvents").collect();
  for (const row of rows) {
    if (row.userId !== loser._id && row.externalId !== loser.externalId) continue;
    await db.patch(row._id, {
      userId: row.userId === loser._id ? canonical._id : row.userId,
      externalId: row.externalId === loser.externalId ? canonical.externalId : row.externalId,
      processedAt: Math.max(row.processedAt, now),
    });
  }
}

async function migrateSubscriptionRows(
  db: AuthUserDb,
  loserUserId: Id<"users">,
  canonicalUserId: Id<"users">,
  now: number,
) {
  const rows = await db
    .query("subscriptions")
    .withIndex("by_userId_updatedAt", (q) => q.eq("userId", loserUserId))
    .collect();
  for (const row of rows) {
    const existing = await findCanonicalSubscriptionByPaddleSubscriptionId(
      db,
      row.paddleSubscriptionId,
    );
    if (!existing || existing._id === row._id) {
      await db.patch(row._id, {
        userId: canonicalUserId,
        updatedAt: now,
      });
      continue;
    }

    if (existing.userId !== canonicalUserId) {
      await db.patch(row._id, {
        userId: canonicalUserId,
        updatedAt: now,
      });
      continue;
    }

    const winner = pickCanonicalSubscriptionRow([existing, row]);
    if (!winner || winner._id === existing._id) {
      await db.delete(row._id);
      continue;
    }

    await db.patch(row._id, {
      userId: canonicalUserId,
      updatedAt: now,
    });
    await db.delete(existing._id);
  }
}

async function repointAuthIdentityRows(
  db: AuthUserDb,
  loserUserId: Id<"users">,
  canonicalUserId: Id<"users">,
  now: number,
) {
  const rows = await listAuthIdentitiesByUserId(db, loserUserId);
  for (const row of rows) {
    const existing = await findAuthIdentityByProviderSubject(
      db,
      row.provider,
      row.providerSubject,
    );
    if (existing && existing._id !== row._id) {
      if (existing.userId !== canonicalUserId) {
        await db.patch(existing._id, {
          userId: canonicalUserId,
          email: row.email ?? existing.email,
          updatedAt: now,
          lastSeenAt: now,
        });
      }
      await db.delete(row._id);
      continue;
    }

    await db.patch(row._id, {
      userId: canonicalUserId,
      updatedAt: now,
      lastSeenAt: now,
    });
  }
}

async function mergeUserIntoCanonical(
  db: AuthUserDb,
  canonical: BillingUser,
  loser: BillingUser,
  now: number,
) {
  if (canonical._id === loser._id) return canonical;

  const decks = await db
    .query("decks")
    .withIndex("by_user_updatedAt", (q) => q.eq("userId", loser.externalId))
    .collect();
  for (const deck of decks) {
    await db.patch(deck._id, {
      userId: canonical.externalId,
      updatedAt: now,
    });
  }
  await migrateCardRows(db, loser.externalId, canonical.externalId, now);
  await migrateChatRows(db, loser.externalId, canonical.externalId, now);
  await migrateCardStudyRows(db, loser.externalId, canonical.externalId, now);
  const progressRows = await db
    .query("cardProgress")
    .withIndex("by_user_dueAt", (q) => q.eq("userId", loser.externalId))
    .collect();
  for (const row of progressRows) {
    await db.patch(row._id, { userId: canonical.externalId });
  }
  const reviewEvents = await db
    .query("reviewEvents")
    .withIndex("by_user_reviewedAt", (q) => q.eq("userId", loser.externalId))
    .collect();
  for (const row of reviewEvents) {
    await db.patch(row._id, { userId: canonical.externalId });
  }
  const studyStates = await db
    .query("studyStates")
    .withIndex("by_user_mode_updatedAt", (q) => q.eq("userId", loser.externalId))
    .collect();
  for (const row of studyStates) {
    await db.patch(row._id, {
      userId: canonical.externalId,
      updatedAt: now,
    });
  }
  await migrateVoiceRows(db, loser.externalId, canonical.externalId, now);
  await migrateMagicLinkRows(db, loser, canonical.externalId, now);
  await migrateSubscriptionRows(db, loser._id, canonical._id, now);
  await migrateFeatureUsageRows(db, loser._id, canonical._id, now);
  await migrateBillingEventRows(db, loser, canonical, now);
  await repointAuthIdentityRows(db, loser._id, canonical._id, now);

  const canonicalPatch: Partial<Doc<"users">> & { updatedAt: number; lastSeenAt: number } = {
    updatedAt: now,
    lastSeenAt: now,
  };
  if (!canonical.email && loser.email) canonicalPatch.email = loser.email;
  if (!canonical.name && loser.name) canonicalPatch.name = loser.name;
  if (!canonical.imageUrl && loser.imageUrl) canonicalPatch.imageUrl = loser.imageUrl;
  if (!canonical.paddleCustomerId && loser.paddleCustomerId) {
    canonicalPatch.paddleCustomerId = loser.paddleCustomerId;
  }
  const manualAccessSource = selectPreferredManualAccess(canonical, loser, now);
  if (manualAccessSource.manualAccessTier === "pro_plus") {
    canonicalPatch.manualAccessTier = manualAccessSource.manualAccessTier;
    canonicalPatch.manualAccessEndsAt = manualAccessSource.manualAccessEndsAt;
    canonicalPatch.manualAccessReason = manualAccessSource.manualAccessReason;
    canonicalPatch.manualAccessGrantedBy = manualAccessSource.manualAccessGrantedBy;
  }
  await db.patch(canonical._id, canonicalPatch);
  await db.patch(loser._id, {
    externalId: buildMergedExternalId(loser),
    email: undefined,
    paddleCustomerId: undefined,
    manualAccessTier: undefined,
    manualAccessEndsAt: undefined,
    manualAccessReason: undefined,
    manualAccessGrantedBy: undefined,
    updatedAt: now,
    lastSeenAt: now,
  });

  const refreshed = await db.get(canonical._id);
  if (!refreshed) {
    throw new ConvexError("Canonical user missing after merge");
  }
  return refreshed;
}

async function upsertAuthIdentity(
  db: AuthUserDb,
  args: {
    provider?: string;
    providerSubject?: string;
    email?: string;
    userId: Id<"users">;
    now: number;
  },
) {
  if (!args.provider || !args.providerSubject) return;
  const existing = await findAuthIdentityByProviderSubject(
    db,
    args.provider,
    args.providerSubject,
  );
  const patch = {
    userId: args.userId,
    email: args.email,
    updatedAt: args.now,
    lastSeenAt: args.now,
  };
  if (existing) {
    await db.patch(existing._id, patch);
    return;
  }
  await db.insert("authIdentities", {
    provider: args.provider,
    providerSubject: args.providerSubject,
    userId: args.userId,
    email: args.email,
    createdAt: args.now,
    updatedAt: args.now,
    lastSeenAt: args.now,
  });
}

async function createCanonicalUser(
  db: AuthUserDb,
  args: CanonicalAuthUserInput & { now: number },
) {
  const userId = await db.insert("users", {
    externalId: createCanonicalExternalId(args.now),
    email: args.email,
    name: args.name,
    imageUrl: args.imageUrl,
    createdAt: args.now,
    updatedAt: args.now,
    lastSeenAt: args.now,
  });
  const user = await db.get(userId);
  if (!user) throw new ConvexError("Failed to create canonical user");
  return user;
}

export async function ensureCanonicalAuthUser(
  db: AuthUserDb,
  input: CanonicalAuthUserInput,
) {
  const now = input.now ?? Date.now();
  const provider = sanitizeText(input.provider);
  const providerSubject = sanitizeText(input.providerSubject);
  const externalIdHint = sanitizeText(input.externalIdHint);
  const email = sanitizeEmail(input.email);
  const name = sanitizeText(input.name);
  const imageUrl = sanitizeText(input.imageUrl);

  const authIdentity = await findAuthIdentityByProviderSubject(
    db,
    provider,
    providerSubject,
  );
  const authUser = authIdentity ? await db.get(authIdentity.userId) : null;
  const emailUser = email ? await findCanonicalUserByEmail(db, email) : null;
  const hintUser = externalIdHint
    ? (await listUsersByExternalId(db, externalIdHint))[0] ?? null
    : null;

  let canonical =
    emailUser ??
    authUser ??
    hintUser ??
    (await createCanonicalUser(db, {
      provider,
      providerSubject,
      externalIdHint,
      email,
      name,
      imageUrl,
      now,
    }));

  const losers = new Map<string, BillingUser>();
  if (authUser && authUser._id !== canonical._id) losers.set(String(authUser._id), authUser);
  if (hintUser && hintUser._id !== canonical._id) losers.set(String(hintUser._id), hintUser);
  if (email) {
    const sameEmailUsers = await listUsersByEmail(db, email);
    for (const row of sameEmailUsers) {
      if (row._id === canonical._id) continue;
      losers.set(String(row._id), row);
    }
  }

  for (const loser of losers.values()) {
    canonical = await mergeUserIntoCanonical(db, canonical, loser, now);
  }

  await db.patch(canonical._id, {
    email,
    name,
    imageUrl,
    updatedAt: now,
    lastSeenAt: now,
  });

  await upsertAuthIdentity(db, {
    provider,
    providerSubject,
    email,
    userId: canonical._id,
    now,
  });

  const refreshed = await db.get(canonical._id);
  if (!refreshed) {
    throw new ConvexError("Canonical user missing after sync");
  }
  return refreshed;
}

export const syncSessionIdentity = mutationGeneric({
  args: {
    forwardSecret: v.string(),
    provider: v.optional(v.string()),
    providerSubject: v.optional(v.string()),
    externalIdHint: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
    if (!expectedSecret || args.forwardSecret !== expectedSecret) {
      throw new ConvexError("Unauthorized auth sync call");
    }
    const user = await ensureCanonicalAuthUser(ctx.db, args);
    return {
      userId: user._id,
      externalId: user.externalId,
      paddleCustomerId: user.paddleCustomerId ?? null,
    };
  },
});

export const migrateDuplicateUsersByEmail = mutationGeneric({
  args: {
    forwardSecret: v.string(),
  },
  handler: async (ctx, { forwardSecret }) => {
    const expectedSecret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
    if (!expectedSecret || forwardSecret !== expectedSecret) {
      throw new ConvexError("Unauthorized auth migration call");
    }

    const users = await ctx.db.query("users").collect();
    const emails = Array.from(
      new Set(
        users
          .map((row) => sanitizeEmail(row.email))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    let groupsMerged = 0;
    let usersMerged = 0;
    for (const email of emails) {
      const sameEmailUsers = await listUsersByEmail(ctx.db, email);
      if (sameEmailUsers.length < 2) continue;
      groupsMerged += 1;
      const canonical = await ensureCanonicalAuthUser(ctx.db, {
        email,
        name: sameEmailUsers[0]?.name,
        imageUrl: sameEmailUsers[0]?.imageUrl,
      });
      usersMerged += sameEmailUsers.filter((row) => row._id !== canonical._id).length;
    }

    return {
      groupsMerged,
      usersMerged,
    };
  },
});
