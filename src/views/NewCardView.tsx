"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { useAppRouter } from "@/lib/app-router";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const api = anyApi;

type Deck = { _id: string; name: string };
type Card = { _id: string; deckId?: string; front: string; back: string; tags: string[] };

function parseTags(raw: string) {
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

export default function NewCardView() {
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

  const isEdit = !!editingCard;
  const deckList: Deck[] = decks ?? [];

  if (editingCard && !front && !backText) {
    setFront(editingCard.front);
    setBackText(editingCard.back);
    setTags(editingCard.tags.join(", "));
    setDeckId(editingCard.deckId ?? "");
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={back}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-border-strong)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-xl font-bold tracking-tight"><span className="gradient-text">{isEdit ? "Edit card" : "New card"}</span></h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="card-surface space-y-4 p-5">
          <label>Deck
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
              <option value="">No deck</option>
              {deckList.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </label>
          <label>Front (Markdown)<textarea value={front} onChange={(e) => setFront(e.target.value)} placeholder="# Question or concept" rows={5} /></label>
          <label>Back (Markdown + Mermaid)<textarea value={backText} onChange={(e) => setBackText(e.target.value)} placeholder="The answer, explanation, or diagram." rows={6} /></label>
          <label>Tags<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="algorithms, systems" /></label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving || !front.trim() || !backText.trim()} className="btn-primary">{saving ? "Saving..." : isEdit ? "Save changes" : "Create card"}</button>
            <button type="button" onClick={() => navigate("/cards")} className="btn-secondary">Cancel</button>
          </div>
        </form>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Preview</span>
            <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-0.5">
              {(["front", "back"] as const).map((side) => (
                <button key={side} type="button" onClick={() => setPreviewSide(side)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition ${previewSide === side ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-secondary)]"}`}>{side}</button>
              ))}
            </div>
          </div>
          <div className="card-surface scanline min-h-56 p-5">
            {(previewSide === "front" ? front : backText).trim()
              ? <MarkdownRenderer content={previewSide === "front" ? front : backText} />
              : <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">Start typing to see a live preview.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
