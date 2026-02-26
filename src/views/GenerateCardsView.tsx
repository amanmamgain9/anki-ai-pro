"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState, type FormEvent } from "react";
import { useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";

const api = anyApi;

type Deck = { _id: string; name: string };
type Level = "beginner" | "intermediate" | "advanced";

type GeneratedCard = {
  front: string;
  back: string;
  tags: string[];
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const starterTopics = [
  "JavaScript closures",
  "Operating systems memory management",
  "Probability for machine learning",
  "Indian polity basics",
];

const levelOptions: Array<{ value: Level; label: string; hint: string }> = [
  {
    value: "beginner",
    label: "Beginner",
    hint: "Simple language and fundamentals",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    hint: "Concept + application questions",
  },
  {
    value: "advanced",
    label: "Advanced",
    hint: "Exam-level and edge cases",
  },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function GenerateCardsView() {
  const { navigate, back } = useAppRouter();
  const { t } = useI18n();
  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const bulkCreate = useMutation(api.flashcards.bulkCreate);

  const [topicInput, setTopicInput] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level | null>(null);
  const [count, setCount] = useState(12);
  const [deckId, setDeckId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [tips, setTips] = useState<string[]>([]);
  const [cards, setCards] = useState<GeneratedCard[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      text: "Tell me your topic. I will ask only one question after that: your level.",
    },
  ]);

  const canAskLevel = topic.trim().length > 0 && !level;
  const readyToGenerate = topic.trim().length > 0 && !!level;
  const deckList = decks ?? [];

  function addMessage(role: ChatMessage["role"], text: string) {
    setMessages((prev) => [...prev, { id: uid(), role, text }]);
  }

  function applyTopic(nextTopic: string) {
    const clean = nextTopic.trim();
    if (!clean) return;
    setTopic(clean);
    setTopicInput("");
    setSavedCount(0);
    setTips([]);
    setCards([]);
    setError(null);
    setLevel(null);
    setMessages([
      {
        id: uid(),
        role: "assistant",
        text: "Tell me your topic. I will ask only one question after that: your level.",
      },
      { id: uid(), role: "user", text: clean },
      {
        id: uid(),
        role: "assistant",
        text: "What is your level for this topic?",
      },
    ]);
  }

  async function generateAndSave(chosenLevel: Level, topicText: string) {
    setBusy(true);
    setError(null);
    setSavedCount(0);
    setTips([]);
    setCards([]);
    addMessage(
      "assistant",
      `Generating ${count} cards for "${topicText}" (${chosenLevel})...`,
    );

    try {
      const response = await fetch("/api/ai/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicText,
          level: chosenLevel,
          count,
        }),
      });

      const payload = (await response.json()) as {
        cards?: GeneratedCard[];
        tips?: string[];
        error?: string;
      };

      if (!response.ok || !payload.cards || payload.cards.length === 0) {
        throw new Error(payload.error ?? "Generation failed");
      }

      const preparedCards = payload.cards
        .map((card) => ({
          front: card.front.trim(),
          back: card.back.trim(),
          tags: (card.tags ?? []).map((t) => t.trim()).filter(Boolean),
        }))
        .filter((card) => card.front && card.back);

      if (preparedCards.length === 0) {
        throw new Error("Model returned empty cards");
      }

      const created = (await bulkCreate({
        deckId: deckId || undefined,
        cards: preparedCards.map((card) => ({
          front: card.front,
          back: card.back,
          tags: card.tags.length > 0 ? card.tags : undefined,
        })),
      })) as number;

      setCards(preparedCards);
      setTips(payload.tips ?? []);
      setSavedCount(created);
      addMessage(
        "assistant",
        `Done. Generated and saved ${created} cards. You can regenerate or open Cards.`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate cards";
      setError(message);
      addMessage("assistant", `Generation failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function chooseLevel(chosen: Level) {
    if (!topic || busy) return;
    setLevel(chosen);
    addMessage("user", levelOptions.find((opt) => opt.value === chosen)?.label ?? chosen);
    void generateAndSave(chosen, topic);
  }

  function onSubmitTopic(e: FormEvent) {
    e.preventDefault();
    applyTopic(topicInput);
  }

  const statusText = useMemo(() => {
    if (busy) return "Generating cards...";
    if (savedCount > 0) return `${savedCount} cards saved`;
    if (readyToGenerate) return "Ready";
    if (canAskLevel) return "Choose your level";
    return "Waiting for topic";
  }, [busy, savedCount, readyToGenerate, canAskLevel]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-border-strong)]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">{t("app.generate.title")}</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t("app.generate.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="card-surface flex min-h-[30rem] flex-col overflow-hidden">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-3 text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
            Chat
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === "assistant"
                    ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]"
                    : "ml-auto bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-[var(--color-border)] p-4">
            {!topic && (
              <>
                <div className="flex flex-wrap gap-2">
                  {starterTopics.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyTopic(preset)}
                      className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <form onSubmit={onSubmitTopic} className="flex gap-2">
                  <input
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="Topic (example: SQL joins, React hooks, electrochemistry)"
                    className="flex-1"
                    disabled={busy}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={busy || topicInput.trim().length < 2}
                  >
                    Send
                  </button>
                </form>
              </>
            )}

            {canAskLevel && (
              <div className="flex flex-wrap gap-2">
                {levelOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => chooseLevel(opt.value)}
                    disabled={busy}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-left transition hover:border-[var(--color-border-strong)]"
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {opt.hint}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
              Options
            </p>
            <div className="mt-3 space-y-3">
              <label>
                Deck
                <select
                  value={deckId}
                  onChange={(e) => setDeckId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">No deck</option>
                  {deckList.map((deck) => (
                    <option key={deck._id} value={deck._id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="mb-1 text-sm font-medium">Card count</p>
                <div className="flex flex-wrap gap-2">
                  {[8, 12, 16, 20].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      disabled={busy}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                        count === n
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
              Status: <span className="font-semibold text-[var(--color-text)]">{statusText}</span>
            </p>
            {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
            {readyToGenerate && !busy && (
              <button
                type="button"
                onClick={() => level && void generateAndSave(level, topic)}
                className="btn-secondary mt-3 w-full justify-center"
              >
                Regenerate
              </button>
            )}
            {savedCount > 0 && (
              <button
                type="button"
                onClick={() => navigate("/cards")}
                className="btn-primary mt-2 w-full justify-center"
              >
                Open cards
              </button>
            )}
          </div>

          <div className="card-surface p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
              Output preview
            </p>
            {cards.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                Generated cards will appear here before/after save.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {cards.slice(0, 4).map((card, idx) => (
                  <div
                    key={`${card.front}-${idx}`}
                    className="rounded-lg border border-[var(--color-border)] p-3"
                  >
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                      Card {idx + 1}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{card.front}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-[var(--color-text-secondary)]">
                      {card.back}
                    </p>
                  </div>
                ))}
                {tips.length > 0 && (
                  <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                      Study tips
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--color-text-secondary)]">
                      {tips.map((tip, idx) => (
                        <li key={`${tip}-${idx}`}>- {tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
