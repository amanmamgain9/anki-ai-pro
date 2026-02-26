"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { useI18n } from "@/i18n/client";

export default function SignInPage() {
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/cards";
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="mb-4 w-full max-w-md text-right">
        <LocaleSwitcher />
      </div>
      <Link href="/" className="gradient-text mb-8 text-lg font-bold tracking-tight">
        {t("common.appName")}
      </Link>
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
      </div>
    </div>
  );
}
