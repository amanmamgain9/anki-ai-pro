import { cookies, headers } from "next/headers";
import { dictionaries, normalizeLocale, type Dictionary, type Locale } from "@/i18n/messages";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale) return normalizeLocale(cookieLocale);

  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language");
  return normalizeLocale(acceptLanguage);
}

export async function getServerDictionary(): Promise<{
  locale: Locale;
  dict: Dictionary;
}> {
  const locale = await getServerLocale();
  return {
    locale,
    dict: dictionaries[locale],
  };
}
