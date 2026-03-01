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

type BillingState = {
  isActive?: boolean;
  plan?: string;
  hasPremiumVoice?: boolean;
};

function escapeXml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
    const billing = (await convex.query(api.billing.getMyBilling, {})) as BillingState;
    const premiumEnabled = Boolean(
      billing?.isActive && (billing?.hasPremiumVoice || billing?.plan === "pro_plus"),
    );
    if (!premiumEnabled) {
      return NextResponse.json(
        { error: "Premium voice requires Pro+ plan" },
        { status: 403 },
      );
    }

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
      return NextResponse.json(
        {
          error: `Azure TTS failed (${response.status})`,
          detail: text.slice(0, 400),
        },
        { status: 502 },
      );
    }

    const audioBuffer = await response.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

