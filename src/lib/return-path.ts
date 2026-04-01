const INTERNAL_RETURN_PATH_ORIGIN = "https://aiankipro.local";

export function sanitizeInternalReturnPath(input: string | null | undefined) {
  if (!input) return "/cards";
  try {
    const url = new URL(input, INTERNAL_RETURN_PATH_ORIGIN);
    if (url.origin !== INTERNAL_RETURN_PATH_ORIGIN) {
      return "/cards";
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (!next.startsWith("/") || next.startsWith("//")) {
      return "/cards";
    }
    return next;
  } catch {
    return "/cards";
  }
}
