"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { toMarkdown } from "mdast-util-to-markdown";
import { toString } from "mdast-util-to-string";
import type { RootContent } from "mdast";
import { useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const api = anyApi;

type Deck = { _id: string; name: string };
type ParsedCard = { front: string; back: string; tags: string[] };
type Format = "auto" | "markdown" | "tsv";

const SAMPLE_MD = `## What is a closure?

A function that captures variables from its enclosing scope.

## What is Big O notation?

A way to describe the upper bound of an algorithm's time/space complexity.

Common classes: O(1), O(log n), O(n), O(n²)
`;

const SAMPLE_TSV = `What is a closure?\tA function that captures variables from its enclosing scope.\tconcepts
What is Big O?\tDescribes upper bound of algorithm complexity.\talgorithms`;

const PROMPT_RULES = `Generate Anki flashcards in this format:

Each card starts with ## as the front (question). Everything below until the next ## is the back (answer). Optionally end a card with tags: tag1, tag2.

Rules:
- Only use ## for card fronts, not #
- Keep fronts to one line
- Backs can be as long as needed with full Markdown
- tags: line is optional, comma-separated, must be the last line of a card's back
- Use $...$ for inline math and $$...$$ for block math with proper LaTeX syntax (e.g. $\\sum_t \\log p(x_t \\mid x_{<t})$). Never use backticks for math.

Example:

## What is a closure?

A function that captures variables from its enclosing scope.

tags: javascript, functions

## What is Big O notation?

Describes the upper bound of an algorithm's time or space complexity. Common classes: $O(1)$, $O(\\log n)$, $O(n)$, $O(n^2)$.

tags: algorithms

Generate flashcards about: [YOUR TOPIC]`;

function detectFormat(text: string): "markdown" | "tsv" {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("##") || trimmed.startsWith("# ")) return "markdown";
  const lines = trimmed.split("\n").filter((l) => l.trim());
  if (lines.length > 0 && lines[0].includes("\t")) return "tsv";
  return "markdown";
}

function parseMarkdown(text: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  const tree = unified().use(remarkParse).parse(text) as { children?: RootContent[] };
  const nodes = tree.children ?? [];

  let currentFront = "";
  let currentBackNodes: RootContent[] = [];

  const flush = () => {
    const front = currentFront.trim();
    if (!front) return;

    const backRaw = toMarkdown({
      type: "root",
      children: currentBackNodes,
    }).trim();
    if (!backRaw) return;

    const lines = backRaw.split("\n");
    const tagLineIdx = lines.findIndex((l) => /^tags:\s*/i.test(l.trim()));
    let tags: string[] = [];
    if (tagLineIdx >= 0) {
      tags = lines[tagLineIdx]
        .replace(/^tags:\s*/i, "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      lines.splice(tagLineIdx, 1);
    }

    const back = lines.join("\n").trim();
    if (!back) return;

    cards.push({ front, back, tags });
  };

  for (const node of nodes) {
    if (node.type === "heading" && node.depth === 2) {
      flush();
      currentFront = toString(node).trim();
      currentBackNodes = [];
      continue;
    }

    // Ignore content before the first H2 card heading.
    if (!currentFront) continue;
    currentBackNodes.push(node);
  }

  flush();
  return cards;
}

function parseTsv(text: string): ParsedCard[] {
  const cards: ParsedCard[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const front = (parts[0] ?? "").trim();
    const back = (parts[1] ?? "").trim();
    const tags = (parts[2] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (front && back) cards.push({ front, back, tags });
  }
  return cards;
}

function parseInput(text: string, format: Format): ParsedCard[] {
  if (!text.trim()) return [];
  const resolved = format === "auto" ? detectFormat(text) : format;
  return resolved === "tsv" ? parseTsv(text) : parseMarkdown(text);
}

export default function BulkUploadView() {
  const { navigate, back } = useAppRouter();
  const { t } = useI18n();
  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const bulkCreate = useMutation(api.flashcards.bulkCreate);
  const createDeck = useMutation(api.decks.create);

  const [input, setInput] = useState("");
  const [format, setFormat] = useState<Format>("auto");
  const [deckId, setDeckId] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [newDeckName, setNewDeckName] = useState("");
  const [creatingDeck, setCreatingDeck] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = parseInput(input, format);
  const detected = input.trim() ? detectFormat(input) : null;

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setInput(reader.result);
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  async function handleSubmit() {
    if (parsed.length === 0 || saving) return;
    setSaving(true);
    try {
      const created = await bulkCreate({
        deckId: (deckId && deckId !== "__new__") ? deckId : undefined,
        cards: parsed.map((c) => ({
          front: c.front,
          back: c.back,
          tags: c.tags.length > 0 ? c.tags : undefined,
        })),
      });
      navigate(`/cards`);
      alert(
        t(created === 1 ? "app.bulkUpload.createdAlertSingular" : "app.bulkUpload.createdAlertPlural", {
          count: created,
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  const previewCard = previewIdx !== null ? parsed[previewIdx] : null;
  const [promptCopied, setPromptCopied] = useState(false);
  const [showPromptToast, setShowPromptToast] = useState(false);

  useEffect(() => {
    if (previewIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && previewIdx! > 0) setPreviewIdx((i) => i! - 1);
      if (e.key === "ArrowRight" && previewIdx! < parsed.length - 1) setPreviewIdx((i) => i! + 1);
      if (e.key === "Escape") setPreviewIdx(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewIdx, parsed.length]);

  function copyPrompt() {
    navigator.clipboard.writeText(PROMPT_RULES).then(() => {
      setPromptCopied(true);
      setShowPromptToast(true);
      setTimeout(() => setPromptCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-border-strong)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="gradient-text">{t("app.bulkUpload.title")}</span>
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t("app.bulkUpload.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: editor */}
        <div className="space-y-4 lg:col-span-3">
          {/* Controls row */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{t("app.bulkUpload.deck")}</span>
              {deckId !== "__new__" ? (
                <select value={deckId} onChange={(e) => {
                  if (e.target.value === "__new__") { setDeckId("__new__"); setNewDeckName(""); }
                  else setDeckId(e.target.value);
                }}>
                  <option value="">{t("app.bulkUpload.noDeck")}</option>
                  {(decks ?? []).map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                  <option value="__new__">{t("app.bulkUpload.newDeck")}</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder={t("app.bulkUpload.deckNamePlaceholder")}
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setDeckId(""); setNewDeckName(""); }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!newDeckName.trim() || creatingDeck}
                    onClick={async () => {
                      if (!newDeckName.trim()) return;
                      setCreatingDeck(true);
                      try {
                        const id = await createDeck({ name: newDeckName.trim() });
                        setDeckId(id as string);
                        setNewDeckName("");
                      } finally {
                        setCreatingDeck(false);
                      }
                    }}
                    className="btn-primary whitespace-nowrap"
                  >
                    {creatingDeck ? "..." : t("app.bulkUpload.create")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeckId(""); setNewDeckName(""); }}
                    className="btn-secondary"
                  >
                    {t("app.bulkUpload.cancel")}
                  </button>
                </div>
              )}
            </label>

            <label className="w-36">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{t("app.bulkUpload.format")}</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                <option value="auto">{t("app.bulkUpload.autoDetect")}</option>
                <option value="markdown">Markdown</option>
                <option value="tsv">TSV</option>
              </select>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn-secondary"
              >
                {t("app.bulkUpload.loadFile")}
              </button>
              <button
                type="button"
                onClick={copyPrompt}
                className="btn-secondary"
              >
                {promptCopied ? t("app.bulkUpload.copied") : t("app.bulkUpload.copyPrompt")}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".md,.txt,.tsv,.csv"
                onChange={handleFile}
                className="hidden"
              />
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("app.bulkUpload.textareaPlaceholder")}
            rows={16}
            className="w-full font-mono text-sm"
          />

          {/* Format hint */}
          {!input.trim() && (
            <div className="card-surface space-y-3 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{t("app.bulkUpload.supportedFormats")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setInput(SAMPLE_MD)}
                  className="rounded-lg border border-[var(--color-border)] p-3 text-left transition hover:border-[var(--color-border-strong)]"
                >
                  <p className="text-sm font-bold">Markdown</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {t("app.bulkUpload.markdownDesc")}
                  </p>
                  <code className="mt-2 block text-xs text-[var(--color-text-tertiary)]">{t("app.bulkUpload.loadExample")}</code>
                </button>
                <button
                  type="button"
                  onClick={() => { setInput(SAMPLE_TSV); setFormat("tsv"); }}
                  className="rounded-lg border border-[var(--color-border)] p-3 text-left transition hover:border-[var(--color-border-strong)]"
                >
                  <p className="text-sm font-bold">TSV (tab-separated)</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {t("app.bulkUpload.tsvDesc")}
                  </p>
                  <code className="mt-2 block text-xs text-[var(--color-text-tertiary)]">{t("app.bulkUpload.loadExample")}</code>
                </button>
              </div>
            </div>
          )}

          {/* Status bar + submit */}
          {input.trim() && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-bold text-[var(--color-accent)]">
                  {t(parsed.length === 1 ? "app.bulkUpload.foundSingular" : "app.bulkUpload.foundPlural", {
                    count: parsed.length,
                  })}
                </span>
                {detected && format === "auto" && (
                  <span className="text-[var(--color-text-tertiary)]">
                    {t("app.bulkUpload.detected", { format: detected })}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={parsed.length === 0 || saving}
                className="btn-primary"
              >
                {saving
                  ? t("app.bulkUpload.creating")
                  : t(
                      parsed.length === 1
                        ? "app.bulkUpload.createCardsSingular"
                        : "app.bulkUpload.createCardsPlural",
                      { count: parsed.length },
                    )}
              </button>
            </div>
          )}
        </div>

        {/* Right: preview */}
        <div className="space-y-3 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
            {t("app.bulkUpload.preview")} {parsed.length > 0 ? `(${parsed.length})` : ""}
          </p>

          {parsed.length === 0 && input.trim() && (
            <div className="card-surface p-6 text-center text-sm text-[var(--color-text-secondary)]">
              {t("app.bulkUpload.invalid")}
            </div>
          )}

          {parsed.length === 0 && !input.trim() && (
            <div className="card-surface p-6 text-center text-sm text-[var(--color-text-secondary)]">
              {t("app.bulkUpload.emptyPreview")}
            </div>
          )}

          {/* Card list */}
          {parsed.length > 0 && (
            <div className="max-h-[calc(100dvh-16rem)] space-y-2 overflow-y-auto pr-1">
              {parsed.map((card, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPreviewIdx(previewIdx === i ? null : i)}
                  className={`card-surface w-full cursor-pointer p-3 text-left transition ${
                    previewIdx === i
                      ? "ring-2 ring-[var(--color-accent)]"
                      : "hover:border-[var(--color-border-strong)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{card.front}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">
                        {card.back.slice(0, 80)}{card.back.length > 80 ? "..." : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">#{i + 1}</span>
                  </div>
                  {card.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {card.tags.map((t) => (
                        <span key={t} className="rounded bg-[var(--color-surface-alt)] px-1.5 py-0.5 text-[0.625rem] font-semibold text-[var(--color-text-secondary)]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Modal preview */}
      {previewCard && previewIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPreviewIdx(null)}
        >
          <div
            className="card-surface scanline relative max-h-[80dvh] w-full max-w-xl overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setPreviewIdx(null)}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Card number + nav */}
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                disabled={previewIdx === 0}
                onClick={() => setPreviewIdx(previewIdx - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-border)] transition hover:border-[var(--color-border-strong)] disabled:opacity-30"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="text-xs font-bold text-[var(--color-text-tertiary)]">
                {previewIdx + 1} / {parsed.length}
              </span>
              <button
                type="button"
                disabled={previewIdx === parsed.length - 1}
                onClick={() => setPreviewIdx(previewIdx + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-border)] transition hover:border-[var(--color-border-strong)] disabled:opacity-30"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>

            {/* Front */}
            <div className="mb-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{t("app.bulkUpload.front")}</p>
              <div className="prose-sm">
                <MarkdownRenderer content={previewCard.front} />
              </div>
            </div>

            <hr className="border-[var(--color-border)]" />

            {/* Back */}
            <div className="mt-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{t("app.bulkUpload.back")}</p>
              <div className="prose-sm">
                <MarkdownRenderer content={previewCard.back} />
              </div>
            </div>

            {/* Tags */}
            {previewCard.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {previewCard.tags.map((t) => (
                  <span key={t} className="rounded bg-[var(--color-surface-alt)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prompt toast */}
      {showPromptToast && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" onClick={() => setShowPromptToast(false)}>
          <div
            className="card-surface relative max-h-[70dvh] w-full max-w-lg overflow-y-auto p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">
                <span className="gradient-text">{t("app.bulkUpload.promptCopied")}</span>
              </p>
              <button
                type="button"
                onClick={() => setShowPromptToast(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-[var(--color-surface-alt)] p-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">{PROMPT_RULES}</pre>
            <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
              {t("app.bulkUpload.promptHelp")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
