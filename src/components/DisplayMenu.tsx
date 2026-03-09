"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/messages";

type Theme = "light" | "dark";

export default function DisplayMenu() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const zh = locale === "zh";

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
        className="flex h-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 text-xs font-bold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      >
        {zh ? "显示" : "Display"}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
          <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {zh ? "语言" : "Language"}
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
            中文
          </button>

          <div className="my-2 h-px bg-[var(--color-border)]" />

          <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {zh ? "主题" : "Theme"}
          </p>
          <button
            type="button"
            onClick={() => applyTheme("light")}
            className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${theme === "light" ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"}`}
          >
            {zh ? "浅色" : "Light"}
          </button>
          <button
            type="button"
            onClick={() => applyTheme("dark")}
            className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${theme === "dark" ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"}`}
          >
            {zh ? "深色" : "Dark"}
          </button>
        </div>
      )}
    </div>
  );
}
