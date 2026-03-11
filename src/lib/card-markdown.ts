import { normalizeMermaidMarkdown } from "@/lib/mermaid";

const BREAK_TAG_REGEX = /<br\s*\/?>/gi;
const PARAGRAPH_BREAK_REGEX = /<\/p>\s*<p>/gi;
const OPEN_BLOCK_TAG_REGEX = /<(p|div)\b[^>]*>/gi;
const CLOSE_BLOCK_TAG_REGEX = /<\/(p|div)>/gi;

export const cardAuthoringRules = [
  "Use valid Markdown only. Never output raw HTML such as <br>, <p>, <div>, or HTML entities for layout.",
  "If math is needed, use KaTeX-compatible LaTeX only.",
  "Use inline math with $...$ and display math with $$...$$.",
  "Do not use low-level TeX layout hacks such as \\raise, \\mkern, \\kern, \\hspace, \\vspace, \\phantom, or \\smash.",
  "For transpose, prefer ^\\top instead of manually raised T notation.",
  "Keep card fronts concise and recall-oriented.",
  "Keep card backs clean and readable: prefer one main equation plus a short explanation over dense notation.",
].join(" ");

function normalizeHtmlMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(PARAGRAPH_BREAK_REGEX, "\n\n")
    .replace(BREAK_TAG_REGEX, "\n")
    .replace(OPEN_BLOCK_TAG_REGEX, "")
    .replace(CLOSE_BLOCK_TAG_REGEX, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function normalizeCardMarkdown(markdown: string) {
  return normalizeMermaidMarkdown(normalizeHtmlMarkdown(markdown).trim());
}
