"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import { useSession } from "next-auth/react";

type ConvexClientProviderProps = {
  children: ReactNode;
};

export default function ConvexClientProvider({
  children,
}: ConvexClientProviderProps) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  const client = useMemo(() => {
    if (!convexUrl) {
      return null;
    }
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!client) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-surface)] p-6">
          <h1 className="text-lg font-semibold">
            Missing NEXT_PUBLIC_CONVEX_URL
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Run{" "}
            <code className="rounded-md bg-[var(--color-surface-alt)] px-1.5 py-0.5 font-mono text-xs">
              npx convex dev
            </code>{" "}
            to create a Convex deployment, then add the URL to{" "}
            <code className="rounded-md bg-[var(--color-surface-alt)] px-1.5 py-0.5 font-mono text-xs">
              .env.local
            </code>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConvexProviderWithAuth client={client} useAuth={useConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

function decodeJwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function fetchSessionConvexToken(): Promise<string | null> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const session = (await response.json()) as { convexToken?: unknown };
  return typeof session?.convexToken === "string" ? session.convexToken : null;
}

function useConvexAuth() {
  const { data: session, status } = useSession();
  const sessionToken = session?.convexToken ?? null;
  const tokenCache = useRef<{ token: string | null; expMs: number }>({
    token: null,
    expMs: 0,
  });

  return useMemo(
    () => ({
      isLoading: status === "loading",
      // Let Convex ask for a token when NextAuth says the user is signed in.
      isAuthenticated: status === "authenticated",
      fetchAccessToken: async ({
        forceRefreshToken,
      }: {
        forceRefreshToken: boolean;
      }) => {
        if (status !== "authenticated") {
          tokenCache.current = { token: null, expMs: 0 };
          return null;
        }

        const now = Date.now();
        if (!forceRefreshToken) {
          if (
            tokenCache.current.token &&
            tokenCache.current.expMs > now + 30_000
          ) {
            return tokenCache.current.token;
          }
          if (sessionToken) {
            tokenCache.current = {
              token: sessionToken,
              expMs: decodeJwtExpMs(sessionToken) ?? now + 5 * 60_000,
            };
            return sessionToken;
          }
        }

        const refreshedToken = await fetchSessionConvexToken();
        if (refreshedToken) {
          tokenCache.current = {
            token: refreshedToken,
            expMs: decodeJwtExpMs(refreshedToken) ?? now + 5 * 60_000,
          };
          return refreshedToken;
        }

        return sessionToken;
      },
    }),
    [status, sessionToken],
  );
}
