import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

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

export const list = queryGeneric({
  args: {
    deckId: v.optional(v.id("decks")),
  },
  handler: async ({ db }, { deckId }) => {
    if (deckId) {
      return await db
        .query("cards")
        .withIndex("by_deck_updatedAt", (q) => q.eq("deckId", deckId))
        .order("desc")
        .take(200);
    }
    return await db
      .query("cards")
      .withIndex("by_updatedAt")
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
  handler: async ({ db }, { deckId, front, back, tags }) => {
    const now = Date.now();
    const cleanedTags =
      tags
        ?.map((tag) => tag.trim())
        .filter((tag) => tag.length > 0) ?? [];
    return await db.insert("cards", {
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
  handler: async ({ db }, { id, deckId, front, back, tags }) => {
    const cleanedTags =
      tags
        ?.map((tag) => tag.trim())
        .filter((tag) => tag.length > 0) ?? [];
    await db.patch(id, {
      deckId,
      front: front.trim(),
      back: back.trim(),
      tags: cleanedTags,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutationGeneric({
  args: {
    id: v.id("cards"),
  },
  handler: async ({ db }, { id }) => {
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
  handler: async ({ db }, { deckId, cards }) => {
    const now = Date.now();
    let created = 0;
    for (const [i, card] of cards.entries()) {
      const tags =
        card.tags
          ?.map((t) => t.trim())
          .filter((t) => t.length > 0) ?? [];
      await db.insert("cards", {
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
  handler: async ({ db }) => {
    const now = Date.now();
    const deckId = await db.insert("decks", {
      name: "Sample Deck",
      description: "Example cards with Markdown + Mermaid.",
      createdAt: now,
      updatedAt: now,
    });
    let created = 0;
    for (const [index, card] of sampleCards.entries()) {
      await db.insert("cards", {
        ...card,
        deckId,
        createdAt: now + index,
        updatedAt: now + index,
      });
      created += 1;
    }
    return created;
  },
});
