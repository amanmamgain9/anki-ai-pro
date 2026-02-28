"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { dictionaries, normalizeLocale, type Locale } from "@/i18n/messages";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (path: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (path) => path,
});

function readPathValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale?: string;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(normalizeLocale(initialLocale));

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  }, []);

  const t = useCallback(
    (path: string, params?: Record<string, string | number>) => {
      const current = readPathValue(dictionaries[locale], path);
      if (typeof current === "string") {
        if (!params) return current;
        return current.replace(/\{(\w+)\}/g, (_match, key: string) => {
          const value = params[key];
          return value === undefined ? `{${key}}` : String(value);
        });
      }
      const fallback = readPathValue(dictionaries.en, path);
      if (typeof fallback === "string") {
        if (!params) return fallback;
        return fallback.replace(/\{(\w+)\}/g, (_match, key: string) => {
          const value = params[key];
          return value === undefined ? `{${key}}` : String(value);
        });
      }
      return path;
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  return useContext(LocaleContext);
}
