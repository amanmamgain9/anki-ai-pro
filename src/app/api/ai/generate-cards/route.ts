import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  topic: z.string().trim().min(2).max(140),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  count: z.number().int().min(4).max(30).optional(),
});

const responseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(1).max(300),
        back: z.string().trim().min(1).max(4000),
        tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
      }),
    )
    .min(1)
    .max(30),
});

function normalizeCards(
  cards: Array<{ front: string; back: string; tags?: string[] }>,
) {
  return cards.map((card) => ({
    front: card.front.trim(),
    back: card.back.trim(),
    tags:
      card.tags
        ?.map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8) ?? [],
  }));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsedRequest: z.infer<typeof requestSchema>;
  try {
    const body = await req.json();
    parsedRequest = requestSchema.parse(body);
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

  const targetCount = parsedRequest.count ?? 12;

  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.35,
    timeout: 45_000,
    maxRetries: 1,
    configuration: { baseURL },
  });

  const structured = llm.withStructuredOutput(responseSchema, {
    name: "anki_generation_result",
  });

  try {
    const output = await structured.invoke([
      new SystemMessage(
        [
          "You generate high-quality Anki flashcards in markdown.",
          "Output must strictly match the JSON schema provided by the tool.",
          "Card fronts should be concise prompts/questions.",
          "Card backs should be clear, accurate, and can include markdown bullet points or short examples.",
          "Avoid fluff. Focus on retention and exam-style recall.",
          "Do not include duplicate cards.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          `Topic: ${parsedRequest.topic}`,
          `Learner level: ${parsedRequest.level}`,
          `Target card count: ${targetCount}`,
          "Generate practical cards that progress from fundamentals to stronger recall.",
          "Each card must have front, back, and optional tags.",
        ].join("\n"),
      ),
    ]);

    const cards = normalizeCards(output.cards);

    return NextResponse.json({
      title: output.title.trim(),
      cards,
      model,
    });
  } catch (error) {
    console.error("Groq generation failed", error);
    return NextResponse.json(
      { error: "Failed to generate cards from LLM" },
      { status: 502 },
    );
  }
}
