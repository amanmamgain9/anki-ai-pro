"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { AppLink } from "@/lib/app-router";

const api = anyApi;

type Deck = { _id: string; name: string; description?: string };

export default function DecksView() {
  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const removeDeck = useMutation(api.decks.remove);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deckList: Deck[] = decks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight"><span className="gradient-text">Decks</span></h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {decks ? `${deckList.length} deck${deckList.length !== 1 ? "s" : ""}` : "Loading..."}
          </p>
        </div>
        <AppLink href="/decks/new" className="btn-primary self-start">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New deck
        </AppLink>
      </div>

      {decks && deckList.length === 0 && (
        <div className="card-surface flex flex-col items-center justify-center border-dashed px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 6H3v13a2 2 0 0 0 2 2h11z" /><path d="M8 3h13v13a2 2 0 0 1-2 2H8z" /></svg>
          </div>
          <h3 className="text-base font-bold">No decks yet</h3>
          <p className="mt-1 max-w-xs text-sm text-[var(--color-text-secondary)]">Group your flashcards into decks for focused study sessions.</p>
          <AppLink href="/decks/new" className="btn-primary mt-5">Create deck</AppLink>
        </div>
      )}

      {deckList.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deckList.map((deck) => (
            <div key={deck._id} className="card-surface glow-hover group flex flex-col gap-3 p-5">
              <div className="flex-1">
                <h3 className="text-sm font-bold">{deck.name}</h3>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{deck.description || "No description"}</p>
              </div>
              <div className="flex items-center gap-2">
                <AppLink href={`/decks/new?edit=${deck._id}`} className="btn-secondary !px-3 !py-1.5 !text-xs">Edit</AppLink>
                <button type="button" disabled={deletingId === deck._id}
                  onClick={async () => { setDeletingId(deck._id); await removeDeck({ id: deck._id }); setDeletingId(null); }}
                  className="btn-danger !px-3 !py-1.5 !text-xs disabled:opacity-50">Delete</button>
                <div className="ml-auto flex items-center gap-3">
                  <AppLink href={`/study?deck=${deck._id}`} className="btn-primary !px-3 !py-1.5 !text-xs">Study</AppLink>
                  <AppLink href={`/cards?deck=${deck._id}`} className="text-xs font-bold text-[var(--color-accent)] transition hover:underline">Cards →</AppLink>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
