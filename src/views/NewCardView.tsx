"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const api = anyApi;

type Deck = { _id: string; name: string };
type Card = { _id: string; deckId?: string; front: string; back: string; tags: string[] };

function parseTags(raw: string) {
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

export default function NewCardView() {
  const { t } = useI18n();
  const { searchParams, navigate, back } = useAppRouter();
  const editId = searchParams.get("edit");

  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const allCards = useQuery(api.flashcards.list, {}) as Card[] | undefined;
  const createCard = useMutation(api.flashcards.create);
  const updateCard = useMutation(api.flashcards.update);

  const editingCard = editId ? allCards?.find((c) => c._id === editId) ?? null : null;

  const [deckId, setDeckId] = useState(editingCard?.deckId ?? "");
  const [front, setFront] = useState(editingCard?.front ?? "");
  const [backText, setBackText] = useState(editingCard?.back ?? "");
  const [tags, setTags] = useState(editingCard?.tags.join(", ") ?? "");
  const [previewSide, setPreviewSide] = useState<"front" | "back">("front");
  const [saving, setSaving] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const isEdit = !!editingCard;
  const deckList: Deck[] = decks ?? [];

  useEffect(() => {
    if (!editingCard) return;
    setFront(editingCard.front);
    setBackText(editingCard.back);
    setTags(editingCard.tags.join(", "));
    setDeckId(editingCard.deckId ?? "");
  }, [editId, editingCard?._id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!front.trim() || !backText.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateCard({ id: editingCard._id, deckId: deckId || undefined, front, back: backText, tags: parseTags(tags) });
      } else {
        await createCard({ deckId: deckId || undefined, front, back: backText, tags: parseTags(tags) });
      }
      navigate("/cards");
    } finally {
      setSaving(false);
    }
  }

  async function handleAiEdit() {
    if (!front.trim() || !backText.trim() || !aiInstruction.trim() || aiBusy) return;

    setAiBusy(true);
    setAiError(null);
    setAiSummary(null);

    try {
      const response = await fetch("/api/ai/edit-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: aiInstruction.trim(),
          card: {
            front,
            back: backText,
            tags: parseTags(tags),
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        card?: { front: string; back: string; tags?: string[] };
        summary?: string;
        error?: string;
      };

      if (!response.ok || !payload.card) {
        throw new Error(payload.error ?? t("app.newCard.aiEditFailed"));
      }

      setFront(payload.card.front.trim());
      setBackText(payload.card.back.trim());
      setTags((payload.card.tags ?? []).join(", "));
      setAiSummary(
        payload.summary?.trim() || t("app.newCard.aiEditSummary"),
      );
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : t("app.newCard.aiEditFailed"),
      );
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={back}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-border-strong)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-xl font-bold tracking-tight"><span className="gradient-text">{isEdit ? t("app.newCard.editTitle") : t("app.newCard.createTitle")}</span></h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="card-surface space-y-4 p-5">
          <label>
            {t("app.newCard.deck")}
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
              <option value="">{t("app.newCard.noDeck")}</option>
              {deckList.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </label>
          <label>
            {t("app.newCard.front")}
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder={t("app.newCard.frontPlaceholder")}
              rows={5}
            />
          </label>
          <label>
            {t("app.newCard.back")}
            <textarea
              value={backText}
              onChange={(e) => setBackText(e.target.value)}
              placeholder={t("app.newCard.backPlaceholder")}
              rows={6}
            />
          </label>
          <label>
            {t("app.newCard.tags")}
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("app.newCard.tagsPlaceholder")}
            />
          </label>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {t("app.newCard.aiEditTitle")}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {t("app.newCard.aiEditDesc")}
            </p>
            <textarea
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder={t("app.newCard.aiEditPlaceholder")}
              rows={3}
              className="mt-3"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleAiEdit()}
                disabled={aiBusy || !front.trim() || !backText.trim() || !aiInstruction.trim()}
                className="btn-secondary"
              >
                {aiBusy ? t("app.newCard.aiEditBusy") : t("app.newCard.aiEditAction")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setAiInstruction(
                    t("app.newCard.aiEditDefaultPrompt"),
                  )
                }
                className="btn-secondary !bg-transparent"
              >
                {t("app.newCard.aiEditDefault")}
              </button>
            </div>
            {aiError && (
              <p className="mt-3 text-sm text-[var(--color-danger)]">{aiError}</p>
            )}
            {aiSummary && !aiError && (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{aiSummary}</p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !front.trim() || !backText.trim()}
              className="btn-primary"
            >
              {saving
                ? t("app.newCard.saving")
                : isEdit
                  ? t("app.newCard.saveChanges")
                  : t("app.newCard.create")}
            </button>
            <button type="button" onClick={() => navigate("/cards")} className="btn-secondary">
              {t("app.newCard.cancel")}
            </button>
          </div>
        </form>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{t("app.newCard.preview")}</span>
            <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-0.5">
              {(["front", "back"] as const).map((side) => (
                <button key={side} type="button" onClick={() => setPreviewSide(side)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition ${previewSide === side ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-secondary)]"}`}>{side === "front" ? t("app.study.front") : t("app.study.back")}</button>
              ))}
            </div>
          </div>
          <div className="card-surface scanline min-h-56 p-5">
            {(previewSide === "front" ? front : backText).trim()
              ? <MarkdownRenderer content={previewSide === "front" ? front : backText} />
              : <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">{t("app.newCard.livePreviewEmpty")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
