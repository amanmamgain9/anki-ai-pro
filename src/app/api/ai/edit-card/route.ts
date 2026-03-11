import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { normalizeMermaidMarkdown } from "@/lib/mermaid";
import { ensureProAccess } from "@/lib/server-entitlements";

export const runtime = "nodejs";

const cardSchema = z.object({
  front: z.string().trim().min(1).max(300),
  back: z.string().trim().min(1).max(4000),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
});

const requestSchema = z.object({
  instruction: z.string().trim().min(2).max(600),
  card: cardSchema,
});

const responseSchema = z.object({
  card: cardSchema,
  summary: z.string().trim().min(1).max(220).optional(),
});

function normalizeCard(card: { front: string; back: string; tags?: string[] }) {
  return {
    front: normalizeMermaidMarkdown(card.front.trim()),
    back: normalizeMermaidMarkdown(card.back.trim()),
    tags:
      card.tags
        ?.map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8) ?? [],
  };
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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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
    name: "anki_single_card_edit_result",
  });

  try {
    const output = await structured.invoke([
      new SystemMessage(
        [
          "You are an expert flashcard editor for spaced repetition.",
          "Rewrite exactly one flashcard according to the user instruction.",
          "Always return exactly one edited card.",
          "Do not add extra cards, remove the card, or turn the answer into a deck.",
          "Keep the same language as the existing card unless the instruction explicitly asks otherwise.",
          "Preserve useful scope and avoid hallucinations.",
          "If Mermaid is used, keep it valid and concise.",
          "Return strictly valid JSON matching the output schema.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          `Instruction: ${parsedRequest.instruction}`,
          "Current card:",
          `Front: ${parsedRequest.card.front}`,
          `Back: ${parsedRequest.card.back}`,
          parsedRequest.card.tags.length
            ? `Tags: ${parsedRequest.card.tags.join(", ")}`
            : "Tags: none",
          "Improve this one card only.",
          "You may rewrite front, back, and tags, but the result must stay as one card.",
        ].join("\n"),
      ),
    ]);

    const card = normalizeCard(output.card);
    if (!card.front || !card.back) {
      return NextResponse.json(
        { error: "Model returned an invalid card" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      card,
      summary: output.summary?.trim(),
      model,
    });
  } catch (error) {
    console.error("Single card edit failed", error);
    return NextResponse.json(
      { error: "Failed to edit card from LLM" },
      { status: 502 },
    );
  }
}
