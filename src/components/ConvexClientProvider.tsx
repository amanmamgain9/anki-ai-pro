"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { useMemo } from "react";

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

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
