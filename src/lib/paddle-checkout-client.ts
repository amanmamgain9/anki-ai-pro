import { getPublicPaddleClientToken, getPublicPaddleEnvironment } from "@/lib/paddle-client";

const PADDLE_CLIENT_TOKEN = getPublicPaddleClientToken();
const PADDLE_ENV = getPublicPaddleEnvironment();

async function postJson(url: string, body: Record<string, string>) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
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
        const target = window.__aiankiPaddleCheckoutSuccessUrl ?? successUrl;
        const sessionId = window.__aiankiPaddleCheckoutSessionId;
        clearActiveCheckoutSession();
        void (async () => {
          if (sessionId) {
            try {
              await postJson("/api/paddle/checkout/complete", { sessionId });
            } catch {
              // Best effort: server-side reconciliation still relies on webhook or support.
            }
          }
          window.location.replace(target);
        })();
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

