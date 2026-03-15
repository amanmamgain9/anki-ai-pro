"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/messages";

type Theme = "light" | "dark";

export default function DisplayMenu() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const settingsLabel = t("app.displayMenu.settings");

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function applyLocale(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    router.refresh();
    setOpen(false);
  }

  function applyTheme(next: Theme) {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setOpen(false);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={settingsLabel}
        title={settingsLabel}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82L4.21 7.2a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
          <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {t("app.displayMenu.language")}
          </p>
          <button
            type="button"
            onClick={() => applyLocale("en")}
            className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${locale === "en" ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"}`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => applyLocale("zh")}
            className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${locale === "zh" ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"}`}
          >
            {t("locale.chinese")}
          </button>

          <div className="my-2 h-px bg-[var(--color-border)]" />

          <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {t("app.displayMenu.theme")}
          </p>
          <button
            type="button"
            onClick={() => applyTheme("light")}
            className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${theme === "light" ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"}`}
          >
            {t("app.displayMenu.light")}
          </button>
          <button
            type="button"
            onClick={() => applyTheme("dark")}
            className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${theme === "dark" ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"}`}
          >
            {t("app.displayMenu.dark")}
          </button>
        </div>
      )}
    </div>
  );
}
