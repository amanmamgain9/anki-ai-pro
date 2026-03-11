import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { normalizeMermaidMarkdown } from "@/lib/mermaid";
import { ensureProAccess } from "@/lib/server-entitlements";

export const runtime = "nodejs";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(6000),
});

const requestSchema = z.object({
  card: z.object({
    front: z.string().trim().min(1).max(600),
    back: z.string().trim().min(1).max(10_000),
  }),
  messages: z.array(messageSchema).min(2).max(60),
});

function clampText(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max);
}

function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const proCheck = await ensureProAccess(session);
  if (proCheck) return proCheck;

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
    temperature: 0.25,
    timeout: 45_000,
    maxRetries: 1,
    configuration: { baseURL },
  });

  const transcript = parsed.messages
    .slice(-20)
    .map((msg) =>
      `${msg.role === "assistant" ? "Tutor" : "Learner"}: ${clampText(msg.content, 2000)}`,
    )
    .join("\n\n");
  const cardFront = clampText(parsed.card.front, 500);
  const cardBack = clampText(parsed.card.back, 4000);

  try {
    const response = await llm.invoke([
      new SystemMessage(
        [
          "You are a study coach generating a markdown summary from a tutoring chat.",
          "Output clean markdown only, no JSON.",
          "Focus on conceptual clarity and recall usefulness.",
          "If a diagram helps understanding, include Mermaid in a fenced code block.",
          "Use only valid Mermaid flowchart syntax.",
          "Keep each edge on one line and write labeled edges as -->|label|.",
          "Quote node labels when they contain punctuation, math notation, or parentheses.",
          "If you are not sure the Mermaid will be valid, omit the diagram.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          "Card context:",
          `Front: ${cardFront}`,
          `Back: ${cardBack}`,
          "",
          "Tutor conversation transcript:",
          transcript,
          "",
          "Generate a concise markdown summary with these sections:",
          "## What This Card Is Testing",
          "## Key Understanding",
          "## Common Mistakes",
          "## Quick Self-Check",
        ].join("\n"),
      ),
    ]);

    const summary = normalizeMermaidMarkdown(contentToText(response.content).trim());
    if (!summary) {
      return NextResponse.json(
        { error: "Model returned empty summary" },
        { status: 502 },
      );
    }

    return NextResponse.json({ summary, model });
  } catch (error) {
    console.error("Card tutor summary failed", error);
    const errorMessage =
      error instanceof Error && error.message
        ? error.message
        : "Failed to generate chat summary";
    return NextResponse.json(
      { error: errorMessage },
      { status: 502 },
    );
  }
}
