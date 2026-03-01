import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  locale: z.string().trim().default("en"),
  card: z.object({
    front: z.string().trim().min(1).max(600),
    back: z.string().trim().min(1).max(10_000),
  }),
  userAnswer: z.string().trim().min(1).max(4_000),
});

const responseSchema = z.object({
  quality: z.number().int().min(0).max(3),
  confidence: z.number().min(0).max(1),
  feedback: z.string().trim().min(1).max(280),
});

function clampText(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max);
}

function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
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
    temperature: 0.1,
    timeout: 30_000,
    maxRetries: 1,
    configuration: { baseURL },
  });

  const cardFront = clampText(parsed.card.front, 500);
  const cardBack = clampText(parsed.card.back, 2_200);
  const userAnswer = clampText(parsed.userAnswer, 1_800);
  const isZh = parsed.locale.toLowerCase().startsWith("zh");

  try {
    const response = await llm.invoke([
      new SystemMessage(
        [
          "You evaluate a learner's spoken answer against a flashcard back.",
          "Return JSON only with keys: quality, confidence, feedback.",
          "quality must be integer: 0=Again, 1=Hard, 2=Good, 3=Easy.",
          "confidence must be a number between 0 and 1 for how certain your quality rating is.",
          "feedback must be one or two short sentences.",
          isZh
            ? "Write feedback in Simplified Chinese."
            : "Write feedback in English.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          `Front: ${cardFront}`,
          `Correct Back: ${cardBack}`,
          `Learner Answer: ${userAnswer}`,
          "",
          "Evaluate correctness, completeness, and confidence.",
          "Be strict but encouraging.",
        ].join("\n"),
      ),
    ]);

    const raw = contentToText(response.content).trim();
    const jsonText = extractJson(raw);
    const candidate = JSON.parse(jsonText);
    const validated = responseSchema.parse(candidate);
    return NextResponse.json(validated);
  } catch (error) {
    console.error("Card answer evaluation failed", error);
    return NextResponse.json(
      {
        quality: 2,
        confidence: 0.55,
        feedback: isZh
          ? "我建议这次给“良好”。你可以说“重来/困难/良好/简单”来覆盖。"
          : "I suggest 'Good' for this attempt. Say again/hard/good/easy to override.",
      },
      { status: 200 },
    );
  }
}
