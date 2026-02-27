import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

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
    temperature: 0.35,
    timeout: 45_000,
    maxRetries: 1,
    configuration: { baseURL },
  });

  const history = parsed.messages.slice(-24);
  try {
    const response = await llm.invoke([
      new SystemMessage(
        [
          "You are a concise flashcard tutor.",
          "Help the learner deeply understand what this card is testing.",
          "Use markdown with short sections and bullets when helpful.",
          "If a visual explanation helps, include a Mermaid diagram in a fenced block.",
          "Stay focused on this card's topic and avoid unrelated tangents.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          "Current card context:",
          `Front: ${parsed.card.front}`,
          `Back: ${parsed.card.back}`,
          "Tutor this specific card.",
        ].join("\n"),
      ),
      ...history.map((msg) =>
        msg.role === "assistant"
          ? new AIMessage(msg.content)
          : new HumanMessage(msg.content),
      ),
      new HumanMessage(parsed.userMessage),
    ]);

    const reply = contentToText(response.content).trim();
    if (!reply) {
      return NextResponse.json(
        { error: "Model returned empty reply" },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply, model });
  } catch (error) {
    console.error("Card tutor chat failed", error);
    return NextResponse.json(
      { error: "Failed to generate tutor response" },
      { status: 502 },
    );
  }
}
