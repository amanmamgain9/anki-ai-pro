import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { cardAuthoringRules, normalizeCardMarkdown } from "@/lib/card-markdown";
import { ensureProAccess } from "@/lib/server-entitlements";

export const runtime = "nodejs";
const DEFAULT_TARGET_COUNT = 20;

const requestSchema = z.object({
  topic: z.string().trim().min(2).max(140),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  count: z.number().int().min(4).max(30).optional(),
});

const coveragePlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtopics: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        weight: z.number().int().min(1).max(10),
        focus: z.string().trim().min(1).max(220),
      }),
    )
    .min(3)
    .max(8),
});

const responseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  cards: z
    .array(
      z.object({
        subtopic: z.string().trim().min(1).max(100),
        front: z.string().trim().min(1).max(300),
        back: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

function buildCoverageTargets(
  subtopics: Array<{ name: string; weight: number; focus: string }>,
  count: number,
) {
  const cleaned = subtopics
    .map((subtopic) => ({
      name: subtopic.name.trim(),
      weight: Math.max(1, Math.min(10, Math.round(subtopic.weight || 1))),
      focus: subtopic.focus.trim(),
    }))
    .filter((subtopic) => subtopic.name.length > 0 && subtopic.focus.length > 0)
    .slice(0, Math.min(count, 8));

  if (cleaned.length === 0) {
    return [{ name: "Core concepts", focus: "Foundations and core recall", target: count }];
  }

  const totalWeight = cleaned.reduce((sum, subtopic) => sum + subtopic.weight, 0) || cleaned.length;
  const targets = cleaned.map((subtopic) => {
    const raw = (subtopic.weight / totalWeight) * count;
    const target = Math.max(1, Math.floor(raw));
    return {
      ...subtopic,
      target,
      remainder: raw - target,
    };
  });

  let assigned = targets.reduce((sum, subtopic) => sum + subtopic.target, 0);

  while (assigned < count) {
    const candidate = targets
      .slice()
      .sort((a, b) => b.remainder - a.remainder || b.weight - a.weight)[assigned % targets.length];
    candidate.target += 1;
    assigned += 1;
  }

  while (assigned > count) {
    const candidate = targets
      .slice()
      .sort((a, b) => a.remainder - b.remainder || a.weight - b.weight)
      .find((subtopic) => subtopic.target > 1);
    if (!candidate) break;
    candidate.target -= 1;
    assigned -= 1;
  }

  return targets.map(({ name, focus, target }) => ({ name, focus, target }));
}

function normalizeCards(
  cards: Array<{ subtopic: string; front: string; back: string }>,
) {
  return cards.map((card) => ({
    subtopic: card.subtopic.trim(),
    front: normalizeCardMarkdown(card.front),
    back: normalizeCardMarkdown(card.back),
  }));
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

  const targetCount = parsedRequest.count ?? DEFAULT_TARGET_COUNT;

  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.35,
    timeout: 45_000,
    maxRetries: 1,
    configuration: { baseURL },
  });

  const planner = llm.withStructuredOutput(coveragePlanSchema, {
    name: "anki_coverage_plan",
  });
  const structured = llm.withStructuredOutput(responseSchema, {
    name: "anki_generation_result",
  });

  try {
    const coveragePlan = await planner.invoke([
      new SystemMessage(
        [
          "You design learning plans for flashcard decks.",
          "Return strictly valid JSON matching the schema.",
          "Order subtopics exactly in the sequence you would teach them in a good textbook chapter.",
          "Start with foundations, then build to applied understanding and recall.",
          "Weights should represent relative card volume per subtopic.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          `Topic: ${parsedRequest.topic}`,
          `Learner level: ${parsedRequest.level}`,
          `Target card count: ${targetCount}`,
          "Create a balanced subtopic plan with 3-8 subtopics in teaching order.",
          "Each subtopic must include a short focus note and weight (1-10).",
        ].join("\n"),
      ),
    ]);

    const coverageTargets = buildCoverageTargets(coveragePlan.subtopics, targetCount);
    const coverageLines = coverageTargets.map(
      (subtopic, index) =>
        `${index + 1}. ${subtopic.name} -> ${subtopic.target} cards. Focus: ${subtopic.focus}`,
    );

    const output = await structured.invoke([
      new SystemMessage(
        [
          "You generate high-quality Anki flashcards in markdown.",
          "Output must strictly match the JSON schema provided by the tool.",
          "Every card must map to one of the provided subtopics.",
          "Card fronts should be concise prompts/questions.",
          "Card backs should be clear, accurate, and can include markdown bullet points or short examples.",
          "Keep cards in a teaching sequence, like a well-written chapter.",
          "Teach prerequisites first, then build complexity.",
          "Start with core ideas, then processes, then applied comparisons and exam-style recall.",
          "Avoid fluff. Focus on retention and exam-style recall.",
          "Do not include duplicate cards or overlapping cards.",
          "Respect the requested subtopic card counts for coverage.",
          cardAuthoringRules,
        ].join(" "),
      ),
      new HumanMessage(
        [
          `Coverage title: ${coveragePlan.title}`,
          `Topic: ${parsedRequest.topic}`,
          `Learner level: ${parsedRequest.level}`,
          `Target card count: ${targetCount}`,
          "Subtopic coverage targets:",
          ...coverageLines,
          "Order cards from easiest foundations to harder application.",
          "Do not jump ahead before introducing needed ideas.",
          "Each card must have subtopic, front, and back.",
          "Return exactly the target number of cards.",
        ].join("\n"),
      ),
    ]);

    const cards = normalizeCards(output.cards)
      .slice(0, targetCount)
      .map(({ front, back }) => ({ front, back, tags: [] as string[] }));

    return NextResponse.json({
      title: output.title.trim(),
      cards,
      coverage: coverageTargets,
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
