"use client";

import { signIn } from "next-auth/react";
import BrandLogo from "@/components/BrandLogo";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { useI18n } from "@/i18n/client";

export default function SignUpPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="mb-4 w-full max-w-md text-right">
        <LocaleSwitcher />
      </div>
      <BrandLogo className="mb-8" iconSize={30} priority />
      <div className="card-surface w-full max-w-md p-6">
        <h1 className="text-xl font-bold">{t("auth.signUpTitle")}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t("auth.signUpDesc")}
        </p>
        <button
          type="button"
          className="btn-primary mt-5 w-full justify-center"
          onClick={() => signIn("google", { callbackUrl: "/cards/generate" })}
        >
          {t("common.continueWithGoogle")}
        </button>
      </div>
    </div>
  );
}
