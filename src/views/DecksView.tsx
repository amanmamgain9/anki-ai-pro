"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { AppLink } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";

const api = anyApi;

type Deck = { _id: string; name: string; description?: string };
type LinearStudyState = { deckId: string };

export default function DecksView() {
  const { t } = useI18n();
  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const linearStudyStates = useQuery(api.study.listLinearStudyStates, {}) as LinearStudyState[] | undefined;
  const removeDeck = useMutation(api.decks.remove);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeck, setConfirmDeck] = useState<Deck | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deckList: Deck[] = decks ?? [];
  const activeStudyDecks = new Set((linearStudyStates ?? []).map((state) => String(state.deckId)));

  async function confirmDeleteDeck() {
    if (!confirmDeck) return;
    setDeletingId(confirmDeck._id);
    setDeleteError(null);
    try {
      await removeDeck({ id: confirmDeck._id });
      setConfirmDeck(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("app.decks.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight"><span className="gradient-text">{t("app.decks.title")}</span></h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {decks
              ? t(deckList.length === 1 ? "app.decks.countSingular" : "app.decks.countPlural", { count: deckList.length })
              : t("app.cards.loading")}
          </p>
        </div>
        <AppLink href="/decks/new" className="btn-primary self-start">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {t("app.decks.newDeck")}
        </AppLink>
      </div>

      {decks && deckList.length === 0 && (
        <div className="card-surface flex flex-col items-center justify-center border-dashed px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 6H3v13a2 2 0 0 0 2 2h11z" /><path d="M8 3h13v13a2 2 0 0 1-2 2H8z" /></svg>
          </div>
          <h3 className="text-base font-bold">{t("app.decks.noDecks")}</h3>
          <p className="mt-1 max-w-xs text-sm text-[var(--color-text-secondary)]">
            {t("app.decks.noDecksDesc")}
          </p>
          <AppLink href="/decks/new" className="btn-primary mt-5">{t("app.decks.createDeck")}</AppLink>
        </div>
      )}

      {deckList.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deckList.map((deck) => (
            <div key={deck._id} className="card-surface glow-hover group flex flex-col gap-3 p-5">
              <div className="flex-1">
                <h3 className="text-sm font-bold">{deck.name}</h3>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{deck.description || t("app.decks.noDescription")}</p>
              </div>
              <div className="flex items-center gap-2">
                <AppLink href={`/decks/new?edit=${deck._id}`} className="btn-secondary !px-3 !py-1.5 !text-xs">{t("app.decks.edit")}</AppLink>
                <button type="button" disabled={deletingId === deck._id}
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmDeck(deck);
                  }}
                  className="btn-danger !px-3 !py-1.5 !text-xs disabled:opacity-50">{t("app.decks.delete")}</button>
                <div className="ml-auto flex items-center gap-3">
                  <AppLink href={`/study?deck=${deck._id}`} className="btn-primary !px-3 !py-1.5 !text-xs">
                    {activeStudyDecks.has(String(deck._id))
                      ? t("app.study.resumeLearning")
                      : t("app.study.studyDeck")}
                  </AppLink>
                  <AppLink href={`/cards?deck=${deck._id}`} className="text-xs font-bold text-[var(--color-accent)] transition hover:underline">{t("app.decks.cards")}</AppLink>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDeck && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="card-surface w-full max-w-md p-5">
            <h2 className="text-lg font-bold tracking-tight">
              {t("app.decks.deleteTitle")}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t("app.decks.deleteBody", { name: confirmDeck.name })}
            </p>
            {deleteError && (
              <p className="mt-3 text-sm text-[var(--color-danger)]">{deleteError}</p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-secondary !px-3 !py-1.5 !text-xs"
                onClick={() => setConfirmDeck(null)}
                disabled={deletingId === confirmDeck._id}
              >
                {t("app.decks.cancel")}
              </button>
              <button
                type="button"
                className="btn-danger !px-3 !py-1.5 !text-xs disabled:opacity-50"
                onClick={() => void confirmDeleteDeck()}
                disabled={deletingId === confirmDeck._id}
              >
                {deletingId === confirmDeck._id
                  ? t("app.decks.deleting")
                  : t("app.decks.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
