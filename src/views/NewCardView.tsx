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
  const { locale } = useI18n();
  const zh = locale === "zh";
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
        throw new Error(payload.error ?? (zh ? "AI 编辑失败" : "AI edit failed"));
      }

      setFront(payload.card.front.trim());
      setBackText(payload.card.back.trim());
      setTags((payload.card.tags ?? []).join(", "));
      setAiSummary(
        payload.summary?.trim() || (zh ? "AI 已更新这张卡片。请检查后再保存。" : "AI updated this card. Review it, then save."),
      );
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : zh
            ? "AI 编辑失败"
            : "AI edit failed",
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
        <h1 className="text-xl font-bold tracking-tight"><span className="gradient-text">{isEdit ? (zh ? "编辑卡片" : "Edit card") : (zh ? "新建卡片" : "New card")}</span></h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="card-surface space-y-4 p-5">
          <label>
            {zh ? "牌组" : "Deck"}
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
              <option value="">{zh ? "无牌组" : "No deck"}</option>
              {deckList.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </label>
          <label>
            {zh ? "正面（Markdown）" : "Front (Markdown)"}
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder={zh ? "# 问题或概念" : "# Question or concept"}
              rows={5}
            />
          </label>
          <label>
            {zh ? "背面（Markdown + Mermaid）" : "Back (Markdown + Mermaid)"}
            <textarea
              value={backText}
              onChange={(e) => setBackText(e.target.value)}
              placeholder={zh ? "答案、解释或图示。" : "The answer, explanation, or diagram."}
              rows={6}
            />
          </label>
          <label>
            {zh ? "标签" : "Tags"}
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={zh ? "算法, 系统" : "algorithms, systems"}
            />
          </label>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {zh ? "单卡 AI 编辑" : "Single-card AI edit"}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {zh
                ? "描述你想怎么改这张卡。AI 只会返回这一张卡，结果不会自动保存。"
                : "Describe how you want this card improved. AI will return one revised card only and will not save it automatically."}
            </p>
            <textarea
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder={
                zh
                  ? "例如：让正面更适合回忆，背面更简洁，并补一个例子"
                  : "For example: make the front better for recall, shorten the back, and add one example"
              }
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
                {aiBusy ? (zh ? "AI 编辑中..." : "Editing with AI...") : (zh ? "用 AI 改这张卡" : "Edit this card with AI")}
              </button>
              <button
                type="button"
                onClick={() =>
                  setAiInstruction(
                    zh
                      ? "让这张卡更清晰、更适合主动回忆，并保留核心信息。"
                      : "Make this card clearer, more recall-friendly, and keep the core information.",
                  )
                }
                className="btn-secondary !bg-transparent"
              >
                {zh ? "使用默认提示" : "Use default prompt"}
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
                ? (zh ? "保存中..." : "Saving...")
                : isEdit
                  ? (zh ? "保存修改" : "Save changes")
                  : (zh ? "创建卡片" : "Create card")}
            </button>
            <button type="button" onClick={() => navigate("/cards")} className="btn-secondary">
              {zh ? "取消" : "Cancel"}
            </button>
          </div>
        </form>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{zh ? "预览" : "Preview"}</span>
            <div className="flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-0.5">
              {(["front", "back"] as const).map((side) => (
                <button key={side} type="button" onClick={() => setPreviewSide(side)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition ${previewSide === side ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-secondary)]"}`}>{zh ? (side === "front" ? "正面" : "背面") : side}</button>
              ))}
            </div>
          </div>
          <div className="card-surface scanline min-h-56 p-5">
            {(previewSide === "front" ? front : backText).trim()
              ? <MarkdownRenderer content={previewSide === "front" ? front : backText} />
              : <p className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">{zh ? "开始输入即可查看实时预览。" : "Start typing to see a live preview."}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
