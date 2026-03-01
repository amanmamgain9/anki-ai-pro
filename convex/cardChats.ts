import { mutationGeneric, queryGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";
import { requireEntitledExternalUserId } from "./entitlements";

const TITLE_MAX = 72;
const PREVIEW_MAX = 220;
const SUMMARY_MAX = 12_000;

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<any> }; db: any }) {
  return requireEntitledExternalUserId(ctx);
}

function normalizeInline(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function makeTitle(userText: string) {
  const normalized = normalizeInline(userText);
  return normalized.length <= TITLE_MAX
    ? normalized
    : `${normalized.slice(0, TITLE_MAX - 1)}…`;
}

function makePreview(text: string) {
  const normalized = normalizeInline(text);
  return normalized.length <= PREVIEW_MAX
    ? normalized
    : `${normalized.slice(0, PREVIEW_MAX - 1)}…`;
}

async function assertOwnsCard(
  db: any,
  userId: string,
  cardId: any,
) {
  const card = await db.get(cardId);
  if (!card || card.userId !== userId) {
    throw new ConvexError("Card not found");
  }
  return card;
}

async function assertOwnsChat(
  db: any,
  userId: string,
  chatId: any,
) {
  const chat = await db.get(chatId);
  if (!chat || chat.userId !== userId) {
    throw new ConvexError("Chat not found");
  }
  return chat;
}

export const listForCard = queryGeneric({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, { cardId }) => {
    const userId = await requireUserId(ctx);
    await assertOwnsCard(ctx.db, userId, cardId);

    const sessions = await ctx.db
      .query("cardStudyChats")
      .withIndex("by_card_updatedAt", (q: any) => q.eq("cardId", cardId))
      .collect();

    return sessions
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
      .map((chat: any) => ({
        _id: chat._id,
        cardId: chat.cardId,
        status: chat.status,
        title: chat.title ?? null,
        summary: chat.summary ?? null,
        hasSummary: Boolean(chat.summary),
        messageCount: chat.messageCount,
        lastMessagePreview: chat.lastMessagePreview ?? null,
        finishedAt: chat.finishedAt ?? null,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      }));
  },
});

export const get = queryGeneric({
  args: {
    id: v.id("cardStudyChats"),
  },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const chat = await assertOwnsChat(ctx.db, userId, id);

    const messages = await ctx.db
      .query("cardStudyMessages")
      .withIndex("by_chat_order", (q: any) => q.eq("chatId", id))
      .collect();

    return {
      chat: {
        _id: chat._id,
        cardId: chat.cardId,
        status: chat.status,
        title: chat.title ?? null,
        summary: chat.summary ?? null,
        messageCount: chat.messageCount,
        lastMessagePreview: chat.lastMessagePreview ?? null,
        finishedAt: chat.finishedAt ?? null,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
      messages: messages.map((msg: any) => ({
        _id: msg._id,
        role: msg.role,
        content: msg.content,
        order: msg.order,
        createdAt: msg.createdAt,
      })),
    };
  },
});

export const start = mutationGeneric({
  args: {
    cardId: v.id("cards"),
  },
  handler: async (ctx, { cardId }) => {
    const userId = await requireUserId(ctx);
    await assertOwnsCard(ctx.db, userId, cardId);

    const now = Date.now();
    const id = await ctx.db.insert("cardStudyChats", {
      userId,
      cardId,
      status: "active",
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const appendTurn = mutationGeneric({
  args: {
    id: v.id("cardStudyChats"),
    userMessage: v.string(),
    assistantMessage: v.string(),
  },
  handler: async (ctx, { id, userMessage, assistantMessage }) => {
    const userId = await requireUserId(ctx);
    const chat = await assertOwnsChat(ctx.db, userId, id);

    const userText = userMessage.trim();
    const assistantText = assistantMessage.trim();
    if (!userText || !assistantText) {
      throw new ConvexError("Both userMessage and assistantMessage are required");
    }

    const existing = await ctx.db
      .query("cardStudyMessages")
      .withIndex("by_chat_order", (q: any) => q.eq("chatId", id))
      .collect();

    const now = Date.now();
    const startOrder = existing.length;
    await ctx.db.insert("cardStudyMessages", {
      userId,
      chatId: id,
      role: "user",
      content: userText,
      order: startOrder,
      createdAt: now,
    });
    await ctx.db.insert("cardStudyMessages", {
      userId,
      chatId: id,
      role: "assistant",
      content: assistantText,
      order: startOrder + 1,
      createdAt: now,
    });

    await ctx.db.patch(chat._id, {
      status: "active",
      title: chat.title ?? makeTitle(userText),
      messageCount: chat.messageCount + 2,
      lastMessagePreview: makePreview(assistantText),
      updatedAt: now,
    });

    return { id: chat._id };
  },
});

export const complete = mutationGeneric({
  args: {
    id: v.id("cardStudyChats"),
    summary: v.string(),
  },
  handler: async (ctx, { id, summary }) => {
    const userId = await requireUserId(ctx);
    const chat = await assertOwnsChat(ctx.db, userId, id);
    const normalized = summary.trim();
    if (!normalized) {
      throw new ConvexError("Summary is required");
    }

    const now = Date.now();
    await ctx.db.patch(chat._id, {
      status: "completed",
      summary:
        normalized.length <= SUMMARY_MAX
          ? normalized
          : normalized.slice(0, SUMMARY_MAX),
      finishedAt: now,
      updatedAt: now,
    });
    return { id: chat._id };
  },
});
