"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { AppLink, useAppRouter } from "@/lib/app-router";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const api = anyApi;

type Deck = { _id: string; name: string };

const RATINGS = [
  { label: "Again", quality: 0, color: "#ef4444", border: "rgba(239,68,68,0.45)", desc: "Forgot it" },
  { label: "Hard", quality: 1, color: "#f59e0b", border: "rgba(245,158,11,0.45)", desc: "Struggled" },
  { label: "Good", quality: 2, color: "#10b981", border: "rgba(16,185,129,0.45)", desc: "Got it" },
  { label: "Easy", quality: 3, color: "#8b5cf6", border: "rgba(139,92,246,0.45)", desc: "Instant" },
] as const;

export default function StudyView() {
  const { searchParams, navigate } = useAppRouter();
  const deckId = searchParams.get("deck") || undefined;

  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const [studyAll, setStudyAll] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);

  // Only fetch card data when a deck is selected
  const dueData = useQuery(
    api.study.getDueCards,
    deckId ? { deckId, all: studyAll || undefined } : "skip",
  ) as { due: any[]; total: number; reviewed: number } | undefined;
  const statsAllDecks = useQuery(api.study.getSessionStats, {}) as
    | { total: number; newCount: number; dueCount: number; reviewedToday: number }
    | undefined;
  const recordReview = useMutation(api.study.recordReview);

  const currentCard = dueData?.due[0] ?? null;
  const remaining = dueData ? dueData.due.length : 0;
  const deckName = deckId ? decks?.find((d) => d._id === deckId)?.name ?? "Deck" : "All cards";

  const handleRate = useCallback(async (quality: number) => {
    if (!currentCard || animating) return;
    setAnimating(true);
    await recordReview({ cardId: currentCard._id, quality });
    setSessionDone((n) => n + 1);
    setFlipped(false);
    setTimeout(() => setAnimating(false), 200);
  }, [currentCard, animating, recordReview]);

  const handleFlip = useCallback(() => {
    if (!animating) setFlipped((f) => !f);
  }, [animating]);

  // ── Deck picker (no deck selected) ───────────────
  if (!deckId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Study</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Pick a deck to start a study session.
          </p>
        </div>

        {/* Quick stats */}
        {statsAllDecks && (
          <div className="grid grid-cols-3 gap-3">
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-[var(--color-accent)]">{statsAllDecks.newCount}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">New</p>
            </div>
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{statsAllDecks.dueCount}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Due</p>
            </div>
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-[var(--color-success)]">{statsAllDecks.reviewedToday}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">Today</p>
            </div>
          </div>
        )}

        {/* Deck list */}
        {!decks && <p className="text-sm text-[var(--color-text-secondary)]">Loading decks...</p>}

        {decks && decks.length === 0 && (
          <div className="card-surface flex flex-col items-center px-6 py-16 text-center">
            <h3 className="text-base font-bold">No decks yet</h3>
            <p className="mt-1 max-w-xs text-sm text-[var(--color-text-secondary)]">
              Create a deck and add some cards before you can study.
            </p>
            <AppLink href="/decks/new" className="btn-primary mt-5">Create deck</AppLink>
          </div>
        )}

        {decks && decks.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(decks as Deck[]).map((deck) => (
              <button
                key={deck._id}
                type="button"
                onClick={() => navigate(`/study?deck=${deck._id}`)}
                className="card-surface glow-hover group flex items-center gap-4 p-5 text-left transition"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{deck.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">Tap to study</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className="shrink-0 text-[var(--color-text-tertiary)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Active study session ─────────────────────────
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col lg:min-h-[calc(100dvh-5rem)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AppLink href="/study"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-border-strong)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </AppLink>
          <div>
            <h1 className="text-lg font-bold tracking-tight"><span className="gradient-text">Study</span></h1>
            <p className="text-xs text-[var(--color-text-secondary)]">{deckName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold text-[var(--color-success)]">{sessionDone} done</span>
          <span className="text-[var(--color-text-secondary)]">{remaining} remaining</span>
        </div>
      </div>

      {dueData && dueData.total > 0 && (
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, ((dueData.reviewed + sessionDone) / dueData.total) * 100)}%`, background: "linear-gradient(90deg, var(--color-gradient-from), var(--color-gradient-to))" }} />
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center">
        {!dueData && <p className="text-[var(--color-text-secondary)]">Loading cards...</p>}

        {dueData && remaining === 0 && (
          <div className="card-surface mx-auto flex w-full max-w-lg flex-col items-center px-6 py-16 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-success-soft)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <h2 className="text-xl font-bold">Session complete!</h2>
            <p className="mt-2 text-[var(--color-text-secondary)]">
              You reviewed <strong className="text-[var(--color-text)]">{sessionDone}</strong> card{sessionDone !== 1 ? "s" : ""} this session.
              {dueData.total > 0 && ` ${dueData.reviewed + sessionDone} of ${dueData.total} mastered.`}
            </p>
            <div className="mt-6 flex gap-2">
              <AppLink href="/study" className="btn-secondary">Pick another deck</AppLink>
              <button type="button" onClick={() => { setStudyAll(true); setSessionDone(0); setFlipped(false); }} className="btn-primary">Study again</button>
            </div>
          </div>
        )}

        {currentCard && (
          <div className="w-full max-w-2xl">
            <button type="button" onClick={handleFlip}
              className="card-surface glow-hover scanline group w-full cursor-pointer px-6 py-10 text-left transition-all sm:px-10 sm:py-14"
              style={{ minHeight: "16rem", boxShadow: flipped ? "0 0 30px var(--color-accent-glow)" : undefined }}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{flipped ? "Back" : "Front"}</span>
                <span className="text-xs text-[var(--color-text-secondary)]">Tap to flip</span>
              </div>
              <div className="prose-lg"><MarkdownRenderer content={flipped ? currentCard.back : currentCard.front} /></div>
            </button>

            {flipped && (
              <div className="mt-5 space-y-3">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">How well did you know it?</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {RATINGS.map((r) => (
                    <button key={r.quality} type="button" disabled={animating} onClick={() => handleRate(r.quality)}
                      className="card-surface flex flex-col items-center gap-1 px-4 py-3 transition hover:border-[var(--color-border-strong)] disabled:opacity-50"
                      style={{ borderColor: animating ? undefined : r.border }}>
                      <span className="text-sm font-bold" style={{ color: r.color }}>{r.label}</span>
                      <span className="text-xs text-[var(--color-text-secondary)]">{r.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!flipped && <p className="mt-4 text-center text-sm text-[var(--color-text-secondary)]">Think about the answer, then tap the card to reveal.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
