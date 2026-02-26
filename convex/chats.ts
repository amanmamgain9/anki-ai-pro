import { mutationGeneric, queryGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";

const messageInput = v.object({
  id: v.optional(v.string()),
  role: v.union(v.literal("assistant"), v.literal("user")),
  text: v.string(),
});

const cardInput = v.object({
  front: v.string(),
  back: v.string(),
  tags: v.optional(v.array(v.string())),
  manuallyModified: v.optional(v.boolean()),
});

const snapshotInput = v.object({
  topic: v.string(),
  level: v.optional(v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"))),
  count: v.number(),
  saveMode: v.union(v.literal("auto"), v.literal("existing")),
  deckId: v.optional(v.id("decks")),
  autoDeckName: v.optional(v.string()),
  cards: v.array(cardInput),
  messages: v.array(messageInput),
  workspace: v.union(v.literal("coach"), v.literal("editor")),
});

async function getUserId(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const userId = await getUserId(ctx);
  if (!userId) throw new ConvexError("Unauthorized");
  return userId;
}

function sanitizeSnapshot(
  snapshot: {
    topic: string;
    level?: "beginner" | "intermediate" | "advanced";
    count: number;
    saveMode: "auto" | "existing";
    deckId?: any;
    autoDeckName?: string;
    cards: Array<{ front: string; back: string; tags?: string[]; manuallyModified?: boolean }>;
    messages: Array<{ role: "assistant" | "user"; text: string }>;
    workspace: "coach" | "editor";
  },
) {
  const topic = snapshot.topic.trim();
  const level = snapshot.level;
  const count = Math.max(4, Math.min(30, Math.round(snapshot.count || 20)));
  const saveMode = snapshot.saveMode;
  const autoDeckName = snapshot.autoDeckName?.trim() || undefined;

  const messages = snapshot.messages
    .map((msg) => ({
      role: msg.role,
      text: msg.text.trim(),
    }))
    .filter((msg) => msg.text.length > 0)
    .slice(0, 300);

  const cards = snapshot.cards
    .map((card) => ({
      front: card.front.trim(),
      back: card.back.trim(),
      tags:
        card.tags
          ?.map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
          .slice(0, 12) ?? [],
      manuallyModified: Boolean(card.manuallyModified),
    }))
    .filter((card) => card.front.length > 0 && card.back.length > 0)
    .slice(0, 120);

  const title = topic || "Untitled";
  const preview =
    [...messages].reverse().find((m) => m.role === "user")?.text ||
    messages[messages.length - 1]?.text ||
    "";

  return {
    topic,
    level,
    count,
    saveMode,
    deckId: saveMode === "existing" ? snapshot.deckId : undefined,
    autoDeckName,
    cards,
    messages,
    workspace: snapshot.workspace,
    title,
    preview: preview.slice(0, 240),
  };
}

async function assertDeckOwner(db: any, userId: string, deckId: any) {
  const deck = await db.get(deckId);
  if (!deck || deck.userId !== userId) {
    throw new ConvexError("Deck not found");
  }
  return deck;
}

async function rewriteChatContent(
  db: any,
  chatId: any,
  userId: string,
  snapshot: ReturnType<typeof sanitizeSnapshot>,
  now: number,
) {
  const oldMessages = await db
    .query("chatMessages")
    .withIndex("by_chat_order", (q: any) => q.eq("chatId", chatId))
    .collect();
  for (const msg of oldMessages) {
    await db.delete(msg._id);
  }

  const oldCards = await db
    .query("chatCards")
    .withIndex("by_chat_order", (q: any) => q.eq("chatId", chatId))
    .collect();
  for (const card of oldCards) {
    await db.delete(card._id);
  }

  for (let i = 0; i < snapshot.messages.length; i++) {
    const msg = snapshot.messages[i];
    await db.insert("chatMessages", {
      userId,
      chatId,
      role: msg.role,
      text: msg.text,
      order: i,
      createdAt: now + i,
    });
  }

  for (let i = 0; i < snapshot.cards.length; i++) {
    const card = snapshot.cards[i];
    await db.insert("chatCards", {
      userId,
      chatId,
      front: card.front,
      back: card.back,
      tags: card.tags,
      order: i,
      manuallyModified: card.manuallyModified,
      createdAt: now + i,
      updatedAt: now + i,
    });
  }

  await db.patch(chatId, {
    status: "active",
    topic: snapshot.topic || undefined,
    level: snapshot.level,
    count: snapshot.count,
    saveMode: snapshot.saveMode,
    deckId: snapshot.deckId,
    autoDeckName: snapshot.autoDeckName,
    workspace: snapshot.workspace,
    title: snapshot.title,
    preview: snapshot.preview || undefined,
    cardCount: snapshot.cards.length,
    messageCount: snapshot.messages.length,
    updatedAt: now,
  });
}

export const listActive = queryGeneric({
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_user_status_updatedAt", (q: any) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .order("desc")
      .take(80);
    return chats.map((chat: any) => ({
      _id: chat._id,
      topic: chat.topic ?? "",
      title: chat.title ?? chat.topic ?? "Untitled",
      updatedAt: chat.updatedAt,
      cardCount: chat.cardCount ?? 0,
      messageCount: chat.messageCount ?? 0,
    }));
  },
});

export const get = queryGeneric({
  args: {
    id: v.id("chats"),
  },
  handler: async (ctx, { id }) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const chat = await ctx.db.get(id);
    if (!chat || chat.userId !== userId) return null;

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_chat_order", (q: any) => q.eq("chatId", id))
      .collect();

    const cards = await ctx.db
      .query("chatCards")
      .withIndex("by_chat_order", (q: any) => q.eq("chatId", id))
      .collect();

    return {
      _id: chat._id,
      status: chat.status,
      topic: chat.topic ?? "",
      level: chat.level,
      count: chat.count ?? 20,
      saveMode: chat.saveMode === "existing" ? "existing" : "auto",
      deckId: chat.deckId,
      autoDeckName: chat.autoDeckName ?? "",
      workspace: chat.workspace === "editor" ? "editor" : "coach",
      messages: messages.map((msg: any) => ({
        id: String(msg._id),
        role: msg.role === "user" ? "user" : "assistant",
        text: msg.text,
      })),
      cards: cards.map((card: any) => ({
        front: card.front,
        back: card.back,
        tags: card.tags ?? [],
        manuallyModified: Boolean(card.manuallyModified),
      })),
      updatedAt: chat.updatedAt,
    };
  },
});

export const upsertDraft = mutationGeneric({
  args: {
    chatId: v.optional(v.id("chats")),
    snapshot: snapshotInput,
  },
  handler: async (ctx, { chatId, snapshot: incoming }) => {
    const userId = await requireUserId(ctx);
    const snapshot = sanitizeSnapshot(incoming);
    const now = Date.now();
    const { db } = ctx;

    if (snapshot.saveMode === "existing" && snapshot.deckId) {
      await assertDeckOwner(db, userId, snapshot.deckId);
    }

    let targetChatId = chatId;
    if (targetChatId) {
      const existing = await db.get(targetChatId);
      if (!existing || existing.userId !== userId) {
        throw new ConvexError("Chat not found");
      }
      if (existing.status === "committed") {
        targetChatId = undefined;
      }
    }
    if (!targetChatId) {
      targetChatId = await db.insert("chats", {
        userId,
        status: "active",
        topic: snapshot.topic || undefined,
        level: snapshot.level,
        count: snapshot.count,
        saveMode: snapshot.saveMode,
        deckId: snapshot.deckId,
        autoDeckName: snapshot.autoDeckName,
        workspace: snapshot.workspace,
        title: snapshot.title,
        preview: snapshot.preview || undefined,
        cardCount: snapshot.cards.length,
        messageCount: snapshot.messages.length,
        createdAt: now,
        updatedAt: now,
      });
    }

    await rewriteChatContent(db, targetChatId, userId, snapshot, now);
    return targetChatId;
  },
});

export const discard = mutationGeneric({
  args: {
    id: v.id("chats"),
  },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const chat = await ctx.db.get(id);
    if (!chat || chat.userId !== userId) {
      throw new ConvexError("Chat not found");
    }
    if (chat.status === "committed") {
      throw new ConvexError("Committed chat cannot be discarded");
    }

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_chat_order", (q: any) => q.eq("chatId", id))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    const cards = await ctx.db
      .query("chatCards")
      .withIndex("by_chat_order", (q: any) => q.eq("chatId", id))
      .collect();
    for (const card of cards) {
      await ctx.db.delete(card._id);
    }

    await ctx.db.delete(id);
    return true;
  },
});

export const commit = mutationGeneric({
  args: {
    id: v.id("chats"),
    snapshot: snapshotInput,
  },
  handler: async (ctx, { id, snapshot: incoming }) => {
    const userId = await requireUserId(ctx);
    const snapshot = sanitizeSnapshot(incoming);
    const now = Date.now();
    const { db } = ctx;

    const chat = await db.get(id);
    if (!chat || chat.userId !== userId) {
      throw new ConvexError("Chat not found");
    }
    if (chat.status === "committed") {
      throw new ConvexError("Chat already committed");
    }

    if (snapshot.saveMode === "existing" && snapshot.deckId) {
      await assertDeckOwner(db, userId, snapshot.deckId);
    }

    await rewriteChatContent(db, id, userId, snapshot, now);

    let targetDeckId = snapshot.deckId;
    if (snapshot.saveMode === "existing") {
      if (!targetDeckId) {
        throw new ConvexError("Deck required for existing save mode");
      }
    } else {
      const deckName = (snapshot.autoDeckName || snapshot.topic || "Generated Deck").trim();
      targetDeckId = await db.insert("decks", {
        userId,
        name: deckName,
        description: snapshot.topic
          ? `Auto-created from AI chat (${snapshot.topic})`
          : "Auto-created from AI chat",
        createdAt: now,
        updatedAt: now,
      });
    }

    const chatCards = await db
      .query("chatCards")
      .withIndex("by_chat_order", (q: any) => q.eq("chatId", id))
      .collect();

    let created = 0;
    for (let i = 0; i < chatCards.length; i++) {
      const draftCard = chatCards[i];
      const cardId = await db.insert("cards", {
        userId,
        deckId: targetDeckId,
        front: draftCard.front,
        back: draftCard.back,
        tags: draftCard.tags ?? [],
        createdAt: now + i,
        updatedAt: now + i,
      });
      await db.insert("cardChatLinks", {
        userId,
        cardId,
        chatId: id,
        chatCardId: draftCard._id,
        manuallyModified: Boolean(draftCard.manuallyModified),
        createdAt: now + i,
        updatedAt: now + i,
      });
      created++;
    }

    await db.patch(id, {
      status: "committed",
      committedAt: now,
      updatedAt: now,
      deckId: targetDeckId,
      cardCount: created,
    });

    return { created, deckId: targetDeckId };
  },
});
