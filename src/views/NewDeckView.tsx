"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";

const api = anyApi;

type Deck = { _id: string; name: string; description?: string };

export default function NewDeckView() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const { searchParams, navigate, back } = useAppRouter();
  const editId = searchParams.get("edit");

  const allDecks = useQuery(api.decks.list) as Deck[] | undefined;
  const createDeck = useMutation(api.decks.create);
  const updateDeck = useMutation(api.decks.update);

  const editingDeck = editId ? allDecks?.find((d) => d._id === editId) ?? null : null;

  const [name, setName] = useState(editingDeck?.name ?? "");
  const [description, setDescription] = useState(editingDeck?.description ?? "");
  const [saving, setSaving] = useState(false);

  const isEdit = !!editingDeck;

  if (editingDeck && !name) {
    setName(editingDeck.name);
    setDescription(editingDeck.description ?? "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit) await updateDeck({ id: editingDeck._id, name, description });
      else await createDeck({ name, description });
      navigate("/decks");
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
        <h1 className="text-xl font-bold tracking-tight"><span className="gradient-text">{isEdit ? (zh ? "编辑牌组" : "Edit deck") : (zh ? "新建牌组" : "New deck")}</span></h1>
      </div>

      <form onSubmit={handleSubmit} className="card-surface max-w-lg space-y-4 p-5">
        <label>{zh ? "名称" : "Name"}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={zh ? "算法、系统设计..." : "Algorithms, Systems Design..."} autoFocus /></label>
        <label>{zh ? "描述" : "Description"}<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={zh ? "可选：为此牌组添加简要说明。" : "Optional summary for this deck."} rows={4} /></label>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary">{saving ? (zh ? "保存中..." : "Saving...") : isEdit ? (zh ? "保存修改" : "Save changes") : (zh ? "创建牌组" : "Create deck")}</button>
          <button type="button" onClick={() => navigate("/decks")} className="btn-secondary">{zh ? "取消" : "Cancel"}</button>
        </div>
      </form>
    </div>
  );
}
