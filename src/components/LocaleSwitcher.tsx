"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";

export default function LocaleSwitcher() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === "en" ? "zh" : "en";

  return (
    <button
      type="button"
      onClick={() => {
        setLocale(nextLocale);
        router.refresh();
      }}
      aria-label={t("locale.switchLabel")}
      title={t("locale.switchLabel")}
      className="flex h-8 min-w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2 text-xs font-bold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
    >
      {t("locale.toggleShort")}
    </button>
  );
}
