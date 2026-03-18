import { createHmac, timingSafeEqual } from "crypto";
import { getPaddleForwardSecret } from "@/lib/paddle";

const CHECKOUT_TOKEN_TTL_MS = 86_400_000;

type CheckoutTokenPayload = {
  exp: number;
  iat: number;
  sub: string;
};

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signValue(value: string) {
  return createHmac("sha256", getPaddleForwardSecret()).update(value).digest("base64url");
}

export function createPaddleCheckoutToken(externalId: string) {
  const payload: CheckoutTokenPayload = {
    sub: externalId,
    iat: Date.now(),
    exp: Date.now() + CHECKOUT_TOKEN_TTL_MS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyPaddleCheckoutToken(token: string | undefined) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signValue(encodedPayload);
  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: CheckoutTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as CheckoutTokenPayload;
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    typeof payload.exp !== "number" ||
    payload.exp < Date.now()
  ) {
    return null;
  }

  return payload.sub;
}
