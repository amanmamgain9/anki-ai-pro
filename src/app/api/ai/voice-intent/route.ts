import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createAiChatModel, getAiProviderErrorMessage } from "@/lib/ai-provider";
import { authOptions } from "@/lib/auth";
import { ensureProAccess } from "@/lib/server-entitlements";

export const runtime = "nodejs";

const requestSchema = z.object({
  locale: z.string().trim().default("en"),
  transcript: z.string().trim().min(1).max(600),
  context: z.object({
    hasDeck: z.boolean().default(false),
    hasCard: z.boolean().default(false),
    tutorOpen: z.boolean().default(false),
    cardFlipped: z.boolean().default(false),
  }),
});

const responseSchema = z.object({
  intent: z.enum(["command", "answer", "tutor", "deck_select", "unknown"]),
  command: z
    .enum([
      "flip",
      "showFront",
      "showBack",
      "nextCard",
      "previousCard",
      "repeat",
      "applySuggested",
      "openTutor",
      "closeTutor",
      "stopVoiceMode",
      "rate",
    ])
    .optional(),
  rateQuality: z.number().int().min(0).max(3).optional(),
  prompt: z.string().trim().min(1).max(280).optional(),
  deckQuery: z.string().trim().min(1).max(180).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

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

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
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
  try {
    ({ llm } = createAiChatModel({
      temperature: 0,
      timeout: 25_000,
      maxRetries: 1,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: getAiProviderErrorMessage(error) },
      { status: 500 },
    );
  }

  const isZh = parsed.locale.toLowerCase().startsWith("zh");
  const transcript = parsed.transcript;
  const { hasDeck, hasCard, tutorOpen, cardFlipped } = parsed.context;

  try {
    const response = await llm.invoke([
      new SystemMessage(
        [
          "You classify one voice transcript for a flashcard study app.",
          "Return JSON only.",
          "User can speak in any language.",
          "Normalize all detected commands into the English enum values.",
          "Allowed intents: command, answer, tutor, deck_select, unknown.",
          "Use intent=command when transcript asks action like flip/show front/show back/next/previous/repeat/open tutor/close tutor/stop voice/rate.",
          "When command=rate, include rateQuality as 0..3.",
          "Use intent=tutor for free-form tutor questions even when tutorOpen=false.",
          "Use intent=answer for learner recall answers to the current card.",
          "Use intent=deck_select when no deck is selected and transcript likely names a deck/topic; include deckQuery.",
          "confidence is a number 0..1 for how sure you are about this classification.",
          "If intent is unknown, omit command and deckQuery.",
          isZh
            ? "Assume the user may speak Simplified Chinese."
            : "Assume the user may speak English.",
        ].join(" "),
      ),
      new HumanMessage(
        [
          `Transcript: ${transcript}`,
          `Context: hasDeck=${hasDeck}, hasCard=${hasCard}, tutorOpen=${tutorOpen}, cardFlipped=${cardFlipped}`,
        ].join("\n"),
      ),
    ]);

    const raw = contentToText(response.content).trim();
    const jsonText = extractJson(raw);
    const candidate = JSON.parse(jsonText);
    const validated = responseSchema.parse(candidate);
    return NextResponse.json(validated);
  } catch (error) {
    console.error("Voice intent classification failed", error);
    return NextResponse.json(
      {
        intent: "unknown",
        confidence: 0.35,
        error: getAiProviderErrorMessage(error),
      },
      { status: 200 },
    );
  }
}
