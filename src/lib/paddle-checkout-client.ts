import { getPublicPaddleClientToken, getPublicPaddleEnvironment } from "@/lib/paddle-client";

const PADDLE_CLIENT_TOKEN = getPublicPaddleClientToken();
const PADDLE_ENV = getPublicPaddleEnvironment();
const PENDING_CHECKOUT_COMPLETION_KEY = "aianki:paddle-pending-checkout-completion";

type PendingCheckoutCompletion = {
  sessionId: string;
  transactionId: string;
  recordedAt: number;
};

async function postJson(url: string, body: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
}

function persistPendingCheckoutCompletion(sessionId: string, transactionId: string) {
  try {
    localStorage.setItem(
      PENDING_CHECKOUT_COMPLETION_KEY,
      JSON.stringify({
        sessionId,
        transactionId,
        recordedAt: Date.now(),
      } satisfies PendingCheckoutCompletion),
    );
  } catch {
    // Best effort only.
  }
}

function readPendingCheckoutCompletion() {
  try {
    const raw = localStorage.getItem(PENDING_CHECKOUT_COMPLETION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCheckoutCompletion | null;
    if (
      !parsed ||
      typeof parsed.sessionId !== "string" ||
      parsed.sessionId.length === 0 ||
      typeof parsed.transactionId !== "string" ||
      parsed.transactionId.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingCheckoutCompletion() {
  try {
    localStorage.removeItem(PENDING_CHECKOUT_COMPLETION_KEY);
  } catch {
    // Best effort only.
  }
}

function sendCompletionBeacon(sessionId: string, transactionId: string) {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }
  try {
    const blob = new Blob([JSON.stringify({ sessionId, transactionId })], {
      type: "application/json",
    });
    return navigator.sendBeacon("/api/paddle/checkout/complete", blob);
  } catch {
    return false;
  }
}

export async function recoverPendingCheckoutCompletion() {
  const pending = readPendingCheckoutCompletion();
  if (!pending) return false;
  if (Date.now() - pending.recordedAt > 24 * 60 * 60_000) {
    clearPendingCheckoutCompletion();
    return false;
  }
  try {
    await postJson("/api/paddle/checkout/complete", {
      sessionId: pending.sessionId,
      transactionId: pending.transactionId,
    });
    clearPendingCheckoutCompletion();
    return true;
  } catch {
    return false;
  }
}

export async function abandonCheckoutSession(sessionId: string) {
  try {
    await postJson("/api/paddle/checkout/abort", { sessionId });
  } catch {
    // Best effort rollback for client-side launch failures or overlay close.
  }
}

function clearActiveCheckoutSession() {
  window.__aiankiPaddleCheckoutSessionId = undefined;
}

export function setActiveCheckoutSession(sessionId: string) {
  window.__aiankiPaddleCheckoutSessionId = sessionId;
}

export function initializePaddleForBilling(successUrl: string) {
  window.__aiankiPaddleCheckoutSuccessUrl = successUrl;
  if (!PADDLE_CLIENT_TOKEN) return false;
  const paddle = window.Paddle;
  if (!paddle || typeof paddle.Initialize !== "function") return false;
  if (window.__aiankiPaddleInitialized) return true;
  if (PADDLE_ENV === "sandbox" && paddle.Environment?.set) {
    paddle.Environment.set("sandbox");
  }
  paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN,
    eventCallback(event) {
      if (event?.name === "checkout.completed") {
        const sessionId = window.__aiankiPaddleCheckoutSessionId;
        const transactionId = event.data?.transaction_id;
        const target = (() => {
          const base = window.__aiankiPaddleCheckoutSuccessUrl ?? successUrl;
          if (!sessionId && !transactionId) return base;
          try {
            const url = new URL(base, window.location.origin);
            if (sessionId) {
              url.searchParams.set("checkoutSessionId", sessionId);
            }
            if (transactionId) {
              url.searchParams.set("transactionId", transactionId);
            }
            return url.toString();
          } catch {
            return base;
          }
        })();
        clearActiveCheckoutSession();
        if (sessionId && transactionId) {
          persistPendingCheckoutCompletion(sessionId, transactionId);
          if (!sendCompletionBeacon(sessionId, transactionId)) {
            void postJson("/api/paddle/checkout/complete", { sessionId, transactionId }).catch(
              () => {
                // Best effort: next app load retries from durable local state.
              },
            );
          }
        }
        window.location.replace(target);
        return;
      }
      if (event?.name === "checkout.closed") {
        const sessionId = window.__aiankiPaddleCheckoutSessionId;
        clearActiveCheckoutSession();
        if (sessionId) {
          void abandonCheckoutSession(sessionId);
        }
      }
    },
    checkout: {
      settings: {
        displayMode: "overlay",
      },
    },
  });
  window.__aiankiPaddleInitialized = true;
  return true;
}
