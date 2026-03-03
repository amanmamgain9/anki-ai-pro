import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildMagicLinkUrl,
  createMagicLinkToken,
  normalizeMagicLinkCallbackUrl,
  registerOneTimeMagicLink,
} from "@/lib/magic-link";

const requestSchema = z.object({
  email: z.string().trim().email(),
  callbackUrl: z.string().trim().optional(),
});

function resolveEmailMode() {
  if (process.env.NODE_ENV === "production") {
    return "smtp";
  }
  const explicit = process.env.MAGIC_LINK_EMAIL_MODE?.trim();
  if (explicit === "smtp" || explicit === "log" || explicit === "return_link") {
    return explicit;
  }
  return "log";
}

function getFromAddress() {
  const from = process.env.MAGIC_LINK_FROM?.trim();
  if (!from) {
    throw new Error("Missing MAGIC_LINK_FROM");
  }
  return from;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendMagicLinkEmail(input: { to: string; magicLink: string }) {
  const smtpUrl = process.env.MAGIC_LINK_SMTP_URL?.trim();
  if (!smtpUrl) {
    throw new Error("Missing MAGIC_LINK_SMTP_URL");
  }

  const transporter = nodemailer.createTransport(smtpUrl);
  const from = getFromAddress();

  await transporter.sendMail({
    from,
    to: input.to,
    subject: "Your aiankipro sign-in link",
    text: [
      "Click this link to sign in:",
      input.magicLink,
      "",
      "This link expires soon. If you did not request this, ignore this email.",
    ].join("\n"),
    html: `
      <p>Click to sign in:</p>
      <p><a href="${escapeHtml(input.magicLink)}">${escapeHtml(input.magicLink)}</a></p>
      <p>This link expires soon. If you did not request this, ignore this email.</p>
    `,
  });
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let parsed: z.infer<typeof requestSchema>;
    try {
      parsed = requestSchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const callbackUrl = normalizeMagicLinkCallbackUrl(parsed.callbackUrl);
    const { token, claims, expiresAt } = await createMagicLinkToken({
      email: parsed.email,
      callbackUrl,
    });
    await registerOneTimeMagicLink({
      token,
      claims,
      expiresAt,
    });
    const magicLink = buildMagicLinkUrl(token, callbackUrl);

    const mode = resolveEmailMode();
    if (mode === "return_link") {
      const expectedSecret = process.env.E2E_TEST_SECRET?.trim();
      const providedSecret = request.headers.get("x-e2e-secret")?.trim();
      if (!expectedSecret || providedSecret !== expectedSecret) {
        return NextResponse.json({ error: "Unauthorized test mode." }, { status: 401 });
      }
      return NextResponse.json({ ok: true, magicLink });
    }
    if (mode === "log") {
      console.info(`[magic-link] to=${parsed.email} link=${magicLink}`);
      return NextResponse.json({ ok: true });
    }

    await sendMagicLinkEmail({
      to: parsed.email,
      magicLink,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
