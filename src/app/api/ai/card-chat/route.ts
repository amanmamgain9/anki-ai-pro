import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createAiChatModel, getAiProviderErrorMessage } from "@/lib/ai-provider";
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
  messages: z.array(messageSchema).max(40).default([]),
  userMessage: z.string().trim().min(1).max(6000),
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

  let llm;
  let model: string;
  try {
    ({ llm, model } = createAiChatModel({
      temperature: 0.35,
      timeout: 45_000,
      maxRetries: 1,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: getAiProviderErrorMessage(error) },
      { status: 500 },
    );
  }

  const history = parsed.messages
    .slice(-12)
    .map((msg) => ({
      role: msg.role,
      content: clampText(msg.content, 2000),
    }));
  const cardFront = clampText(parsed.card.front, 500);
  const cardBack = clampText(parsed.card.back, 4000);
  const userMessage = clampText(parsed.userMessage, 2000);

  try {
    const response = await llm.invoke([
      new SystemMessage(
        [
          "You are a concise flashcard tutor.",
          "Help the learner deeply understand what this card is testing.",
          "Use markdown with short sections and bullets when helpful.",
          "If a visual explanation helps, include a Mermaid diagram in a fenced block.",
          "Use only valid Mermaid flowchart syntax.",
          "Keep each edge on one line and write labeled edges as -->|label|.",
          "Quote node labels when they contain punctuation, math notation, or parentheses.",
          "If you are not sure the Mermaid will be valid, omit the diagram.",
          "Stay focused on this card's topic and avoid unrelated tangents.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          "Current card context:",
          `Front: ${cardFront}`,
          `Back: ${cardBack}`,
          "Tutor this specific card.",
        ].join("\n"),
      ),
      ...history.map((msg) =>
        msg.role === "assistant"
          ? new AIMessage(msg.content)
          : new HumanMessage(msg.content),
      ),
      new HumanMessage(userMessage),
    ]);

    const reply = normalizeMermaidMarkdown(contentToText(response.content).trim());
    if (!reply) {
      return NextResponse.json(
        { error: "Model returned empty reply" },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply, model });
  } catch (error) {
    console.error("Card tutor chat failed", error);
    const errorMessage =
      error instanceof Error && error.message
        ? error.message
        : "Failed to generate tutor response";
    return NextResponse.json(
      { error: errorMessage },
      { status: 502 },
    );
  }
}
