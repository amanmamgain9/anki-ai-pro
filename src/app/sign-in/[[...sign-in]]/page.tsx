"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { useI18n } from "@/i18n/client";

export default function SignInPage() {
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/cards/generate";
  const e2eUserId = search.get("e2eUserId") || "e2e-user";
  const magicToken = search.get("magicToken");
  const { t, locale } = useI18n();
  const zh = locale === "zh";
  const showE2ELogin = process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED === "1";
  const [email, setEmail] = useState("");
  const [magicStatus, setMagicStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [magicMessage, setMagicMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!magicToken) return;
    let cancelled = false;
    void (async () => {
      setMagicStatus("sending");
      setMagicMessage(
        zh ? "正在完成邮箱登录..." : "Completing email sign-in...",
      );
      const result = await signIn("magic-link", {
        redirect: false,
        token: magicToken,
        callbackUrl,
      });
      if (cancelled) return;
      if (!result || result.error) {
        setMagicStatus("error");
        setMagicMessage(
          zh
            ? "邮箱登录链接无效或已过期。请重新获取。"
            : "Magic link is invalid or expired. Request a new one.",
        );
        return;
      }
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setMagicStatus("error");
      setMagicMessage(
        zh
          ? "邮箱登录失败，请重试。"
          : "Email sign-in failed. Please try again.",
      );
    })().catch(() => {
      if (!cancelled) {
        setMagicStatus("error");
        setMagicMessage(
          zh
            ? "邮箱登录链接无效或已过期。请重新获取。"
            : "Magic link is invalid or expired. Request a new one.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [callbackUrl, magicToken, zh]);

  async function requestMagicLink() {
    setMagicStatus("sending");
    setMagicMessage(null);
    try {
      const response = await fetch("/api/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, callbackUrl }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to send magic link");
      }
      setMagicStatus("sent");
      setMagicMessage(
        zh
          ? "登录链接已发送，请检查邮箱。"
          : "Magic sign-in link sent. Check your email.",
      );
    } catch (error) {
      setMagicStatus("error");
      setMagicMessage(
        error instanceof Error
          ? error.message
          : zh
            ? "发送失败，请稍后重试。"
            : "Failed to send link. Try again.",
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="mb-4 w-full max-w-md text-right">
        <LocaleSwitcher />
      </div>
      <BrandLogo className="mb-8" iconSize={30} priority />
      <div className="card-surface w-full max-w-md p-6">
        <h1 className="text-xl font-bold">{t("auth.signInTitle")}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t("auth.signInDesc")}
        </p>
        <button
          type="button"
          className="btn-primary mt-5 w-full justify-center"
          onClick={() => signIn("google", { callbackUrl })}
        >
          {t("common.continueWithGoogle")}
        </button>
        <div className="mt-4 rounded-xl border border-[var(--color-border)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {zh ? "邮箱登录（免 Google）" : "Email magic link (no Google)"}
          </p>
          <label className="mt-2 block text-xs text-[var(--color-text-secondary)]">
            {zh ? "邮箱" : "Email"}
          </label>
          <input
            data-testid="magic-link-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            placeholder={zh ? "you@example.com" : "you@example.com"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            data-testid="magic-link-request"
            type="button"
            disabled={magicStatus === "sending" || !email}
            className="btn-secondary mt-3 w-full justify-center disabled:opacity-60"
            onClick={requestMagicLink}
          >
            {magicStatus === "sending"
              ? (zh ? "发送中..." : "Sending...")
              : (zh ? "发送登录链接" : "Send magic link")}
          </button>
          {magicMessage && (
            <p
              className={`mt-2 text-xs ${
                magicStatus === "error"
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-text-secondary)]"
              }`}
            >
              {magicMessage}
            </p>
          )}
        </div>
        {showE2ELogin && (
          <button
            type="button"
            data-testid="e2e-sign-in"
            className="btn-secondary mt-3 w-full justify-center"
            onClick={() =>
              signIn("credentials", {
                callbackUrl,
                email: `${e2eUserId}@aiankipro.com`,
                name: "E2E Test User",
                userId: e2eUserId,
              })
            }
          >
            E2E test sign in
          </button>
        )}
      </div>
    </div>
  );
}
