import { createHash, randomUUID } from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { SignJWT, jwtVerify } from "jose";

const DEFAULT_CALLBACK_URL = "/cards/generate";
const MAGIC_LINK_TOKEN_TTL_MINUTES = 15;
const MAGIC_LINK_TOKEN_TTL_MS = MAGIC_LINK_TOKEN_TTL_MINUTES * 60_000;
const api = anyApi;

export type MagicLinkClaims = {
  userId: string;
  email: string;
  name: string;
  callbackUrl: string;
};

type MagicLinkStoreRecord = MagicLinkClaims & {
  expiresAt: number;
  usedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type ConsumeResult =
  | { ok: true; claims: MagicLinkClaims }
  | { ok: false; reason: "not_found" | "used" | "expired" | "mismatch" };

const inMemoryMagicLinks = new Map<string, MagicLinkStoreRecord>();

function getNextAuthSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Missing NEXTAUTH_SECRET");
  }
  return secret;
}

function getIssuer() {
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (!nextAuthUrl) {
    return "http://localhost:3000";
  }
  return nextAuthUrl.replace(/\/+$/, "");
}

function sanitizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getConvexUrl() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }
  return url;
}

function createTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getConvexClient() {
  return new ConvexHttpClient(getConvexUrl());
}

export function normalizeMagicLinkCallbackUrl(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return DEFAULT_CALLBACK_URL;
  }
  if (value.startsWith("/")) return value;
  return DEFAULT_CALLBACK_URL;
}

export function buildMagicLinkUserId(email: string) {
  const normalized = sanitizeEmail(email);
  return `magic:${normalized}`;
}

export async function createMagicLinkToken(input: {
  email: string;
  callbackUrl?: string;
  name?: string;
}) {
  const email = sanitizeEmail(input.email);
  const userId = buildMagicLinkUserId(email);
  const callbackUrl = normalizeMagicLinkCallbackUrl(input.callbackUrl);
  const name = input.name?.trim() || email.split("@")[0] || "User";

  const now = Date.now();
  const expiresAt = now + MAGIC_LINK_TOKEN_TTL_MS;

  const token = await new SignJWT({
    email,
    name,
    callbackUrl,
    nonce: randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience("magic-link")
    .setIssuer(getIssuer())
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(new TextEncoder().encode(getNextAuthSecret()));

  return {
    token,
    expiresAt,
    claims: {
      userId,
      email,
      name,
      callbackUrl,
    } satisfies MagicLinkClaims,
  };
}

export async function verifyMagicLinkToken(token: string) {
  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(getNextAuthSecret()),
    {
      issuer: getIssuer(),
      audience: "magic-link",
    },
  );

  const email = typeof payload.email === "string" ? sanitizeEmail(payload.email) : "";
  const name = typeof payload.name === "string" && payload.name.length > 0 ? payload.name : email;
  const callbackUrl = normalizeMagicLinkCallbackUrl(payload.callbackUrl);
  const userId = typeof payload.sub === "string" && payload.sub.length > 0
    ? payload.sub
    : buildMagicLinkUserId(email);

  if (!email) {
    throw new Error("Invalid magic link token payload");
  }

  return {
    userId,
    email,
    name,
    callbackUrl,
  } satisfies MagicLinkClaims;
}

function registerMagicLinkFallback(input: {
  tokenHash: string;
  claims: MagicLinkClaims;
  expiresAt: number;
}) {
  const now = Date.now();
  inMemoryMagicLinks.set(input.tokenHash, {
    ...input.claims,
    expiresAt: input.expiresAt,
    usedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

function consumeMagicLinkFallback(tokenHash: string): ConsumeResult {
  const row = inMemoryMagicLinks.get(tokenHash);
  if (!row) return { ok: false, reason: "not_found" };
  if (typeof row.usedAt === "number") return { ok: false, reason: "used" };
  if (Date.now() >= row.expiresAt) return { ok: false, reason: "expired" };
  row.usedAt = Date.now();
  row.updatedAt = row.usedAt;
  inMemoryMagicLinks.set(tokenHash, row);
  return {
    ok: true,
    claims: {
      userId: row.userId,
      email: row.email,
      name: row.name,
      callbackUrl: row.callbackUrl,
    },
  };
}

export async function registerOneTimeMagicLink(input: {
  token: string;
  claims: MagicLinkClaims;
  expiresAt: number;
}) {
  const tokenHash = createTokenHash(input.token);
  try {
    const convex = getConvexClient();
    await convex.mutation(api.magicLinks.registerToken, {
      tokenHash,
      userId: input.claims.userId,
      email: input.claims.email,
      name: input.claims.name,
      callbackUrl: input.claims.callbackUrl,
      expiresAt: input.expiresAt,
    });
    return;
  } catch {
    registerMagicLinkFallback({
      tokenHash,
      claims: input.claims,
      expiresAt: input.expiresAt,
    });
  }
}

export async function consumeOneTimeMagicLink(input: {
  token: string;
  claims: MagicLinkClaims;
}): Promise<ConsumeResult> {
  const tokenHash = createTokenHash(input.token);
  try {
    const convex = getConvexClient();
    const result = (await convex.mutation(api.magicLinks.consumeToken, {
      tokenHash,
      now: Date.now(),
    })) as ConsumeResult;
    if (!result.ok) return result;
    if (
      result.claims.userId !== input.claims.userId ||
      result.claims.email !== input.claims.email
    ) {
      return { ok: false, reason: "mismatch" };
    }
    return result;
  } catch {
    const fallback = consumeMagicLinkFallback(tokenHash);
    if (!fallback.ok) return fallback;
    if (
      fallback.claims.userId !== input.claims.userId ||
      fallback.claims.email !== input.claims.email
    ) {
      return { ok: false, reason: "mismatch" };
    }
    return fallback;
  }
}

export function buildMagicLinkUrl(token: string, callbackUrl?: string) {
  const base = getIssuer();
  const safeCallbackUrl = normalizeMagicLinkCallbackUrl(callbackUrl);
  const url = new URL("/sign-in", base);
  url.searchParams.set("magicToken", token);
  url.searchParams.set("callbackUrl", safeCallbackUrl);
  return url.toString();
}
