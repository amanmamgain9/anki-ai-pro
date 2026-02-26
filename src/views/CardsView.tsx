"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { AppLink } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const api = anyApi;

type Deck = { _id: string; name: string; description?: string };
type Card = { _id: string; deckId?: string; front: string; back: string; tags: string[] };

export default function CardsView() {
  const { t } = useI18n();
  const [deckFilter, setDeckFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);

  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const cards = useQuery(api.flashcards.list, { deckId: deckFilter || undefined }) as Card[] | undefined;
  const removeCard = useMutation(api.flashcards.remove);
  const seedCards = useMutation(api.flashcards.seed);

  const cardsList: Card[] = cards ?? [];
  const deckList = useMemo<Deck[]>(() => decks ?? [], [decks]);

  const deckNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of deckList) map.set(d._id, d.name);
    return map;
  }, [deckList]);

  const expandedCard = cardsList.find((c) => c._id === expandedId) ?? null;

  function toggleExpand(id: string) {
    if (expandedId === id) setExpandedId(null);
    else { setExpandedId(id); setShowBack(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight"><span className="gradient-text">{t("app.cards.title")}</span></h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {cards ? `${cardsList.length} card${cardsList.length !== 1 ? "s" : ""}` : t("app.cards.loading")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={deckFilter} onChange={(e) => { setDeckFilter(e.target.value); setExpandedId(null); }} className="!w-auto !py-2 !text-xs">
            <option value="">{t("app.cards.allDecks")}</option>
            {deckList.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <AppLink href={deckFilter ? `/study?deck=${deckFilter}` : "/study"} className="btn-primary !text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            {t("app.cards.study")}
          </AppLink>
          <button type="button" onClick={() => seedCards()} className="btn-secondary !text-xs">{t("app.cards.seedSamples")}</button>
          <AppLink href="/cards/generate" className="btn-secondary !text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.4 3.8L17 8.2l-3.6 1.4L12 13.5l-1.4-3.9L7 8.2l3.6-1.4L12 3z" />
              <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
            </svg>
            {t("app.cards.generateAi")}
          </AppLink>
          <AppLink href="/cards/bulk" className="btn-secondary !text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            {t("app.cards.bulkUpload")}
          </AppLink>
          <AppLink href="/cards/new" className="btn-primary !text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {t("app.cards.newCard")}
          </AppLink>
        </div>
      </div>

      {cards && cardsList.length === 0 && (
        <div className="card-surface flex flex-col items-center justify-center border-dashed px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          </div>
          <h3 className="text-base font-bold">{t("app.cards.noCards")}</h3>
          <p className="mt-1 max-w-xs text-sm text-[var(--color-text-secondary)]">{t("app.cards.noCardsDesc")}</p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => seedCards()} className="btn-secondary">{t("app.cards.seedSamples")}</button>
            <AppLink href="/cards/new" className="btn-primary">{t("app.cards.createCard")}</AppLink>
          </div>
        </div>
      )}

      {cardsList.length > 0 && (
        <div className="card-surface divide-y divide-[var(--color-border)] overflow-hidden">
          {cardsList.map((card) => {
            const isExpanded = expandedId === card._id;
            return (
              <div key={card._id}>
                <button type="button" onClick={() => toggleExpand(card._id)}
                  className={`flex w-full items-center gap-4 px-4 py-3.5 text-left transition sm:px-5 ${isExpanded ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-surface-alt)]"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9375rem] font-semibold leading-snug">{card.front.split("\n")[0].replace(/^#+\s*/, "") || t("app.cards.untitled")}</p>
                    <p className="mt-0.5 truncate text-sm text-[var(--color-text-secondary)]">
                      {card.deckId ? deckNameById.get(card.deckId) ?? t("app.cards.unknownDeck") : t("app.cards.noDeck")}
                      {card.tags.length > 0 && ` · ${card.tags.join(", ")}`}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    className={`shrink-0 text-[var(--color-text-tertiary)] transition-transform ${isExpanded ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {isExpanded && expandedCard && (
                  <div className="border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-alt)_50%,transparent)] px-4 py-5 sm:px-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setShowBack(!showBack)} className="btn-primary !text-xs">{showBack ? t("app.cards.showFront") : t("app.cards.flipToBack")}</button>
                      <AppLink href={`/cards/new?edit=${expandedCard._id}`} className="btn-secondary !text-xs">{t("app.cards.edit")}</AppLink>
                      <button type="button" onClick={async () => { await removeCard({ id: expandedCard._id }); setExpandedId(null); }} className="btn-danger !text-xs">{t("app.cards.delete")}</button>
                    </div>
                    <div className="card-surface p-4 sm:p-5">
                      <MarkdownRenderer content={showBack ? expandedCard.back : expandedCard.front} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
