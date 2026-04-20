import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createAiChatModel, getAiProviderErrorMessage } from "@/lib/ai-provider";
import { authOptions } from "@/lib/auth";
import { cardAuthoringRules, normalizeCardMarkdown } from "@/lib/card-markdown";
import { ensureProAccess } from "@/lib/server-entitlements";

export const runtime = "nodejs";

const cardSchema = z.object({
  front: z.string().trim().min(1).max(300),
  back: z.string().trim().min(1).max(4000),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
});

const requestSchema = z.object({
  topic: z.string().trim().min(2).max(140).optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  instruction: z.string().trim().min(2).max(600),
  cards: z.array(cardSchema).min(1).max(80),
});

const responseSchema = z.object({
  cards: z.array(cardSchema).min(1).max(80),
  summary: z.string().trim().max(220),
});

function normalizeCards(cards: Array<{ front: string; back: string; tags?: string[] }>) {
  return cards
    .map((card) => ({
      front: normalizeCardMarkdown(card.front),
      back: normalizeCardMarkdown(card.back),
      tags:
        card.tags
          ?.map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 8) ?? [],
    }))
    .filter((card) => card.front.length > 0 && card.back.length > 0);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const proCheck = await ensureProAccess(session);
  if (proCheck) return proCheck;

  let parsedRequest: z.infer<typeof requestSchema>;
  try {
    parsedRequest = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  let llm;
  let model: string;
  try {
    ({ llm, model } = createAiChatModel({
      temperature: 0.2,
      timeout: 45_000,
      maxRetries: 1,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: getAiProviderErrorMessage(error) },
      { status: 500 },
    );
  }

  const structured = llm.withStructuredOutput(responseSchema, {
    name: "anki_edit_result",
  });

  try {
    const cardsBlock = parsedRequest.cards
      .map((card, index) => {
        const tags = card.tags.length ? ` [tags: ${card.tags.join(", ")}]` : "";
        return `${index + 1}. Front: ${card.front}\nBack: ${card.back}${tags}`;
      })
      .join("\n\n");

    const output = await structured.invoke([
      new SystemMessage(
        [
          "You are an expert flashcard editor for spaced repetition.",
          "Rewrite the provided card set according to the user instruction.",
          "Keep the same language as the existing cards unless the instruction explicitly asks otherwise.",
          "Preserve useful scope and avoid hallucinations.",
          cardAuthoringRules,
          "Always include a summary string. Use an empty string if there is nothing useful to say.",
          "Return strictly valid JSON matching the output schema.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          parsedRequest.topic ? `Topic: ${parsedRequest.topic}` : undefined,
          parsedRequest.level ? `Learner level: ${parsedRequest.level}` : undefined,
          `Instruction: ${parsedRequest.instruction}`,
          "Current cards:",
          cardsBlock,
          "Return the improved full card list (not only deltas).",
          "You may remove redundant cards or add missing high-value cards.",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ]);

    const cards = normalizeCards(output.cards);
    if (!cards.length) {
      return NextResponse.json(
        { error: "Model returned no valid cards" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      cards,
      summary: output.summary.trim() || undefined,
      model,
    });
  } catch (error) {
    console.error("Draft edit failed", error);
    return NextResponse.json(
      { error: `Failed to edit cards from LLM: ${getAiProviderErrorMessage(error)}` },
      { status: 502 },
    );
  }
}
