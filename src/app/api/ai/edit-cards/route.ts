import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

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
  summary: z.string().trim().min(1).max(220).optional(),
});

function normalizeCards(cards: Array<{ front: string; back: string; tags?: string[] }>) {
  return cards
    .map((card) => ({
      front: card.front.trim(),
      back: card.back.trim(),
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

  let parsedRequest: z.infer<typeof requestSchema>;
  try {
    parsedRequest = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const apiKey = process.env.GROQ_API_KEY ?? process.env.KIMI_API_KEY;
  const baseURL =
    process.env.GROQ_BASE_URL ??
    process.env.KIMI_BASE_URL ??
    "https://api.groq.com/openai/v1";
  const model =
    process.env.GROQ_MODEL ??
    process.env.KIMI_MODEL ??
    "moonshotai/kimi-k2-instruct-0905";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing GROQ_API_KEY in server environment. Set GROQ_API_KEY, GROQ_BASE_URL, and GROQ_MODEL.",
      },
      { status: 500 },
    );
  }

  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.2,
    timeout: 45_000,
    maxRetries: 1,
    configuration: { baseURL },
  });

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
      summary: output.summary?.trim(),
      model,
    });
  } catch (error) {
    console.error("Groq draft edit failed", error);
    return NextResponse.json(
      { error: "Failed to edit cards from LLM" },
      { status: 502 },
    );
  }
}
