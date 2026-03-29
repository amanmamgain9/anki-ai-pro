import { createHmac } from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

const api = anyApi;

export const runtime = "nodejs";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(1400),
  locale: z.string().trim().default("en"),
});

type ConsumeResult = {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  monthKey?: string;
};

type SyncUserResult = {
  userId: string;
};

function escapeXml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getTtsRefundProofSecret() {
  const secret = process.env.PADDLE_WEBHOOK_FORWARD_SECRET;
  if (!secret) {
    throw new Error("Missing PADDLE_WEBHOOK_FORWARD_SECRET");
  }
  return secret;
}

function createRefundSignature(
  userId: string,
  monthKey: string,
  units: number,
  proofIssuedAt: number,
) {
  return createHmac("sha256", getTtsRefundProofSecret())
    .update(`${userId}:${monthKey}:${units}:${proofIssuedAt}`)
    .digest("hex");
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.convexToken) {
      return NextResponse.json(
        { error: "Missing Convex auth token in session" },
        { status: 401 },
      );
    }

    let parsed: z.infer<typeof requestSchema>;
    try {
      parsed = requestSchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_CONVEX_URL" },
        { status: 500 },
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(session.convexToken);
    const synced = (await convex.mutation(api.billing.syncCurrentUser, {})) as SyncUserResult;

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;
    if (!speechKey || !speechRegion) {
      return NextResponse.json(
        {
          error:
            "Missing Azure Speech config. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.",
        },
        { status: 500 },
      );
    }

    const units = parsed.text.length;
    const consume = (await convex.mutation(api.usage.consumePremiumTtsPreview, {
      units,
    })) as ConsumeResult;
    if (!consume.allowed) {
      if (consume.reason === "preview_exhausted") {
        return NextResponse.json(
          {
            error: "Pro preview credits exhausted for this month",
            remaining: consume.remaining ?? 0,
          },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: "Premium voice is unavailable for this account" },
        { status: 403 },
      );
    }

    const isZh = parsed.locale.toLowerCase().startsWith("zh");
    const voiceName = isZh
      ? process.env.AZURE_SPEECH_VOICE_ZH ?? "zh-CN-XiaoxiaoNeural"
      : process.env.AZURE_SPEECH_VOICE_EN ?? "en-US-AvaMultilingualNeural";
    const lang = isZh ? "zh-CN" : "en-US";
    const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = [
      `<speak version="1.0" xml:lang="${lang}">`,
      `<voice name="${voiceName}">`,
      escapeXml(parsed.text),
      "</voice>",
      "</speak>",
    ].join("");

    let consumedPreview:
      | {
          units: number;
          monthKey: string;
          proofIssuedAt: number;
          refundSignature: string;
        }
      | null =
      typeof consume.monthKey === "string"
        ? (() => {
            const proofIssuedAt = Date.now();
            return {
              units,
              monthKey: consume.monthKey,
              proofIssuedAt,
              refundSignature: createRefundSignature(
                synced.userId,
                consume.monthKey,
                units,
                proofIssuedAt,
              ),
            };
          })()
        : null;

    const refundPreview = async () => {
      if (!consumedPreview) return;
      const refund = consumedPreview;
      consumedPreview = null;
      try {
        await convex.mutation(api.usage.refundPremiumTtsPreview, refund);
      } catch (refundError) {
        console.error("Failed to refund premium TTS preview usage", refundError);
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": speechKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "aiankipro-voice",
        },
        body: ssml,
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        await refundPreview();
        return NextResponse.json(
          {
            error: `Azure TTS failed (${response.status})`,
            detail: text.slice(0, 400),
          },
          { status: 502 },
        );
      }

      const audioBuffer = await response.arrayBuffer();
      consumedPreview = null;
      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      await refundPreview();
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
