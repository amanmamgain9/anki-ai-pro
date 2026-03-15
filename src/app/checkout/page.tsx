import type { Metadata } from "next";
import Link from "next/link";
import PaddleCheckoutLoader from "@/components/PaddleCheckoutLoader";

export const metadata: Metadata = {
  title: "Checkout",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CheckoutPage() {
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const paddleEnv = process.env.NEXT_PUBLIC_PADDLE_ENV ?? "production";

  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-16 text-[var(--color-text)]">
      <div className="mx-auto max-w-lg rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
          AIANKIPRO Checkout
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Opening secure checkout</h1>
        <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
          This page loads Paddle checkout for your transaction and returns you to settings
          after payment completes.
        </p>

        {!clientToken && (
          <div className="mt-6 rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-4 text-sm text-[var(--color-danger)]">
            Missing <code>NEXT_PUBLIC_PADDLE_CLIENT_TOKEN</code>. Checkout cannot open until
            that client-side token is configured.
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm text-[var(--color-text-secondary)]">
          If the checkout does not open automatically, go back to{" "}
          <Link className="font-semibold text-[var(--color-accent)]" href="/settings">
            settings
          </Link>{" "}
          and start the plan again.
        </div>
      </div>

      {clientToken && (
        <PaddleCheckoutLoader clientToken={clientToken} paddleEnv={paddleEnv} />
      )}
    </main>
  );
}
