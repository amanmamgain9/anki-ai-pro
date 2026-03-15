"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";
import { dictionaries, type Locale } from "@/i18n/messages";
import { generateChatKeywords } from "@/i18n/non-ui-text";

const api = anyApi;
const DEFAULT_COUNT = 20;
const DEFAULT_LEVEL: Level = "intermediate";

type Deck = { _id: string; name: string };
type Level = "beginner" | "intermediate" | "advanced";
type SaveMode = "auto" | "existing";
type Workspace = "coach" | "editor";
type GenerationPhase = "idle" | "thinking" | "generating" | "saving" | "done";

type GeneratedCard = {
  front: string;
  back: string;
  tags: string[];
  manuallyModified: boolean;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type SnapshotCard = {
  front: string;
  back: string;
  tags: string[];
  manuallyModified: boolean;
};

type SnapshotPayload = {
  topic: string;
  level?: Level;
  count: number;
  saveMode: SaveMode;
  deckId?: any;
  autoDeckName?: string;
  cards: SnapshotCard[];
  messages: Array<{ role: "assistant" | "user"; text: string }>;
  workspace: Workspace;
};

type ChatAction =
  | { kind: "setCount"; value: number }
  | { kind: "setSaveAuto"; name?: string }
  | { kind: "setSaveExisting"; deckId: string; deckName: string }
  | { kind: "saveNow" }
  | { kind: "openEditor" };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function levelLabel(level: Level, t: (path: string, params?: Record<string, string | number>) => string) {
  return t(`app.generate.level.${level}`);
}

function introText(t: (path: string, params?: Record<string, string | number>) => string) {
  return t("app.generate.intro");
}

function defaultDeckName(topic: string, t: (path: string, params?: Record<string, string | number>) => string) {
  return `${topic}${t("app.generate.deckSuffix")}`;
}

function parseLevelFromText(raw: string): Level | null {
  const txt = raw.trim().toLowerCase();
  if (!txt) return null;
  if (generateChatKeywords.beginnerLevel.some((term) => txt.includes(term))) return "beginner";
  if (generateChatKeywords.intermediateLevel.some((term) => txt.includes(term))) return "intermediate";
  if (generateChatKeywords.advancedLevel.some((term) => txt.includes(term))) return "advanced";
  return null;
}

function parseCountFromText(raw: string): number | null {
  const match = raw.match(generateChatKeywords.cardCountUnits);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(4, Math.min(30, value));
}

function hasGenerateIntent(raw: string) {
  return generateChatKeywords.generateIntent.test(raw);
}

function hasRegenerateIntent(raw: string) {
  return generateChatKeywords.regenerateIntent.test(raw);
}

function parseChatAction(raw: string, decks: Deck[]): ChatAction | null {
  const txt = raw.trim();
  if (!txt) return null;
  const lower = txt.toLowerCase();

  if (generateChatKeywords.saveNowIntent.test(txt)) {
    return { kind: "saveNow" };
  }

  if (generateChatKeywords.openEditorIntent.test(txt)) {
    return { kind: "openEditor" };
  }

  const count = parseCountFromText(txt);
  if (count && generateChatKeywords.countIntent.test(txt)) {
    return { kind: "setCount", value: count };
  }

  if (generateChatKeywords.autoDeckIntent.test(txt)) {
    const nameByColon = txt.match(/[:：]\s*(.+)$/)?.[1]?.trim();
    const nameByQuote = txt.match(/["“”']([^"“”']+)["“”']/)?.[1]?.trim();
    return { kind: "setSaveAuto", name: nameByColon || nameByQuote || undefined };
  }

  if (generateChatKeywords.existingDeckIntent.test(txt)) {
    const sortedDecks = [...decks].sort((a, b) => b.name.length - a.name.length);
    const match = sortedDecks.find((deck) => lower.includes(deck.name.toLowerCase()));
    if (match) return { kind: "setSaveExisting", deckId: match._id, deckName: match.name };
  }

  return null;
}

function IconChat({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function IconEdit({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" />
    </svg>
  );
}

function IconZap({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
    </svg>
  );
}

function IconTune({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M2 10h4" />
      <path d="M10 8h4" />
      <path d="M18 12h4" />
    </svg>
  );
}

function GenerationDeckAnimation({
  phase,
  t,
}: {
  phase: GenerationPhase;
  t: (path: string, params?: Record<string, string | number>) => string;
}) {
  const title =
    phase === "saving"
      ? t("app.generate.animation.almostReady")
      : t("app.generate.animation.crafting");
  const subtitle =
    phase === "saving"
      ? t("app.generate.animation.saving")
      : t("app.generate.animation.building");

  return (
    <div className="onboarding-overlay pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <div className="onboarding-deck relative h-56 w-72">
        <div className="onboarding-deck-card onboarding-deck-card-1" />
        <div className="onboarding-deck-card onboarding-deck-card-2" />
        <div className="onboarding-deck-card onboarding-deck-card-3" />
        <div className="onboarding-deck-card onboarding-deck-card-4" />
        <div className="onboarding-deck-card onboarding-deck-card-5" />
      </div>
      <div className="absolute bottom-[18vh] text-center">
        <p className="text-lg font-bold tracking-tight text-[var(--color-text)]">{title}</p>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
      </div>
    </div>
  );
}

export default function GenerateCardsView() {
  const { navigate, searchParams } = useAppRouter();
  const { t, locale } = useI18n();
  const localeDict = dictionaries[locale as Locale];
  const starterTopics = localeDict.app.generate.landing.starterTopics as readonly string[];

  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const onboardingState = useQuery(api.billing.getMyOnboardingState) as
    | { hasCompletedOnboarding: boolean }
    | undefined;
  const upsertDraft = useMutation(api.chats.upsertDraft);
  const commitChat = useMutation(api.chats.commit);
  const discardChat = useMutation(api.chats.discard);
  const markOnboardingComplete = useMutation(api.billing.markOnboardingComplete);

  const requestedChatId = searchParams.get("chat");
  const wantsNew = searchParams.get("new") === "1";
  const forceOnboarding = searchParams.get("onboarding") === "1";
  const isOnboardingFlow =
    forceOnboarding || onboardingState?.hasCompletedOnboarding === false;

  const buildGenerateRoute = useCallback(
    (options?: { chatId?: string; wantsNew?: boolean }) => {
      const query = new URLSearchParams();
      if (options?.chatId) query.set("chat", options.chatId);
      if (options?.wantsNew) query.set("new", "1");
      if (forceOnboarding) query.set("onboarding", "1");
      const next = query.toString();
      return next ? `/cards/generate?${next}` : "/cards/generate";
    },
    [forceOnboarding],
  );

  const chatDoc = useQuery(
    api.chats.get,
    requestedChatId ? ({ id: requestedChatId } as any) : "skip",
  ) as
    | {
        _id: string;
        status: string;
        topic: string;
        level?: Level;
        count: number;
        saveMode: SaveMode;
        deckId?: string;
        autoDeckName: string;
        workspace: Workspace;
        messages: ChatMessage[];
        cards: GeneratedCard[];
      }
    | null
    | undefined;

  const [workspace, setWorkspace] = useState<Workspace>("coach");
  const [topic, setTopic] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [level, setLevel] = useState<Level | null>(null);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [saveMode, setSaveMode] = useState<SaveMode>("auto");
  const [deckId, setDeckId] = useState("");
  const [autoDeckName, setAutoDeckName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [commitBusy, setCommitBusy] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: uid(), role: "assistant", text: introText(t) },
  ]);

  const deckList = useMemo(() => decks ?? [], [decks]);
  const selectedDeckName = useMemo(
    () => deckList.find((deck) => deck._id === deckId)?.name ?? "",
    [deckId, deckList],
  );

  const canAskLevel = topic.trim().length > 0 && !level;
  const canRefine = topic.trim().length > 0 && !!level && cards.length > 0;

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const loadedChatIdRef = useRef<string | null>(null);
  const pendingChatIdRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetLocal = useCallback(() => {
    setWorkspace("coach");
    setTopic("");
    setChatInput("");
    setLevel(null);
    setCount(DEFAULT_COUNT);
    setSaveMode("auto");
    setDeckId("");
    setAutoDeckName("");
    setShowAdvanced(false);
    setBusy(false);
    setPhase("idle");
    setError(null);
    setCards([]);
    setSavedCount(0);
    setCommitBusy(false);
    setDraftDirty(false);
    pendingChatIdRef.current = null;
    setMessages([{ id: uid(), role: "assistant", text: introText(t) }]);
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, phase]);

  useEffect(() => {
    if (!mountedRef.current) return;

    if (wantsNew) {
      loadedChatIdRef.current = null;
      resetLocal();
      navigate(buildGenerateRoute());
      return;
    }

    if (!requestedChatId) {
      loadedChatIdRef.current = null;
      resetLocal();
      return;
    }

    if (!chatDoc) return;
    if (loadedChatIdRef.current === requestedChatId) return;

    setWorkspace(chatDoc.workspace === "editor" ? "editor" : "coach");
    setTopic(chatDoc.topic ?? "");
    setLevel(chatDoc.level ?? null);
    setCount(chatDoc.count ?? DEFAULT_COUNT);
    setSaveMode(chatDoc.saveMode === "existing" ? "existing" : "auto");
    setDeckId(chatDoc.deckId ?? "");
    setAutoDeckName(chatDoc.autoDeckName ?? "");
    setShowAdvanced(false);
    setCards(
      (chatDoc.cards ?? []).map((card) => ({
        front: card.front,
        back: card.back,
        tags: card.tags ?? [],
        manuallyModified: Boolean(card.manuallyModified),
      })),
    );
    setMessages(
      (chatDoc.messages ?? []).length
            ? (chatDoc.messages ?? [])
            : [{ id: uid(), role: "assistant", text: introText(t) }],
    );
    setSavedCount(0);
    setCommitBusy(false);
    setBusy(false);
    setPhase("idle");
    setError(null);
    setDraftDirty(true);
    pendingChatIdRef.current = requestedChatId;

    loadedChatIdRef.current = requestedChatId;
  }, [requestedChatId, wantsNew, chatDoc, navigate, resetLocal, t, buildGenerateRoute]);

  function addMessage(role: ChatMessage["role"], text: string) {
    setMessages((prev) => [...prev, { id: uid(), role, text }]);
  }

  const buildSnapshotPayload = useCallback(
    (overrides: Partial<SnapshotPayload> = {}): SnapshotPayload => {
      const baseSnapshot: SnapshotPayload = {
        topic,
        level: level ?? undefined,
        count,
        saveMode,
        deckId: saveMode === "existing" && deckId ? (deckId as any) : undefined,
        autoDeckName: autoDeckName.trim() || undefined,
        cards: cards.map((card) => ({
          front: card.front.trim(),
          back: card.back.trim(),
          tags: card.tags,
          manuallyModified: Boolean(card.manuallyModified),
        })),
        messages: messages.map((msg) => ({ role: msg.role, text: msg.text })),
        workspace,
      };
      return {
        ...baseSnapshot,
        ...overrides,
        cards: overrides.cards ?? baseSnapshot.cards,
        messages: overrides.messages ?? baseSnapshot.messages,
      };
    },
    [topic, level, count, saveMode, deckId, autoDeckName, cards, messages, workspace],
  );

  useEffect(() => {
    if (!mountedRef.current) return;
    if (savedCount > 0 && !draftDirty) return;

    const shouldPersist =
      topic.trim().length > 0 || cards.length > 0 || messages.length > 1;
    if (!shouldPersist) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const nextId = (await upsertDraft({
            chatId: requestedChatId ? (requestedChatId as any) : undefined,
            snapshot: buildSnapshotPayload(),
          })) as string;

          const nextChatId = String(nextId);
          pendingChatIdRef.current = nextChatId;
          if (!requestedChatId || nextChatId !== requestedChatId) {
            if (!isOnboardingFlow || nextChatId !== requestedChatId) {
              navigate(buildGenerateRoute({ chatId: String(nextId) }));
            }
          }
        } catch (err) {
          console.error("Failed to autosave chat draft", err);
        }
      })();
    }, 650);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    topic,
    level,
    count,
    saveMode,
    deckId,
    autoDeckName,
    cards,
    messages,
    workspace,
    requestedChatId,
    upsertDraft,
    navigate,
    buildGenerateRoute,
    buildSnapshotPayload,
    isOnboardingFlow,
    savedCount,
    draftDirty,
  ]);

  function startTopic(nextTopic: string) {
    const clean = nextTopic.trim();
    if (!clean) return;

    setTopic(clean);
    setLevel(null);
    setCards([]);
    setError(null);
    setSavedCount(0);
    setPhase("idle");
    setDraftDirty(true);
    setWorkspace("coach");

    if (saveMode === "auto" && !autoDeckName.trim()) {
      setAutoDeckName(defaultDeckName(clean, t));
    }

    addMessage("user", clean);
    addMessage(
      "assistant",
      t("app.generate.topicLevelQuestion"),
    );
  }

  async function generateDraft(
    chosenLevel: Level,
    options?: { nextCount?: number; guidance?: string; reason?: string },
  ) {
    if (!topic.trim()) return;

    const targetCount = options?.nextCount ?? count;
    const modelTopic = options?.guidance
      ? `${topic}\n\nSpecial instruction: ${options.guidance}`
      : topic;

    setBusy(true);
    setPhase("thinking");
    setError(null);
    setSavedCount(0);

    addMessage(
      "assistant",
      t("app.generate.generatingDraft", {
        reason: options?.reason ? t("app.generate.reasonPrefix", { reason: options.reason }) : "",
        count: targetCount,
      }),
    );

    try {
      setPhase("generating");
      const response = await fetch("/api/ai/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: modelTopic,
          level: chosenLevel,
          count: targetCount,
        }),
      });

      const payload = (await response.json()) as {
        cards?: Array<{ front: string; back: string; tags?: string[] }>;
        error?: string;
      };

      if (!response.ok || !payload.cards || payload.cards.length === 0) {
        throw new Error(payload.error ?? t("app.generate.generationFailed"));
      }

      const preparedCards = payload.cards
        .map((card) => ({
          front: card.front.trim(),
          back: card.back.trim(),
          tags: (card.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
          manuallyModified: false,
        }))
        .filter((card) => card.front && card.back);

      if (preparedCards.length === 0) {
        throw new Error(t("app.generate.modelReturnedEmpty"));
      }

      setPhase("done");
      setCards(preparedCards);
      setCount(targetCount);
      setDraftDirty(true);
      setWorkspace("editor");

      addMessage(
        "assistant",
        t("app.generate.draftReadyAndSaving", { count: preparedCards.length }),
      );

      const generationSnapshot = buildSnapshotPayload({
        level: chosenLevel,
        count: targetCount,
        autoDeckName:
          saveMode === "auto"
            ? autoDeckName.trim() || defaultDeckName(topic.trim(), t)
            : undefined,
        cards: preparedCards.map((card) => ({
          front: card.front.trim(),
          back: card.back.trim(),
          tags: card.tags,
          manuallyModified: Boolean(card.manuallyModified),
        })),
        workspace: "editor",
      });
      await commitDraft({
        snapshot: generationSnapshot,
        redirectToStudy: true,
        suppressSavedMessage: true,
        markOnboardingComplete: isOnboardingFlow,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("app.generate.generationFailed");
      setError(message);
      setPhase("idle");
      addMessage("assistant", t("app.generate.failedPrefix", { message }));
    } finally {
      setBusy(false);
    }
  }

  async function refineDraft(instruction: string) {
    if (!cards.length || !level) return;

    setBusy(true);
    setPhase("generating");
    setError(null);

    addMessage(
      "assistant",
      t("app.generate.refineWorking"),
    );

    try {
      const response = await fetch("/api/ai/edit-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          level,
          instruction,
          cards: cards.map((card) => ({ front: card.front, back: card.back, tags: card.tags })),
        }),
      });

      const payload = (await response.json()) as {
        cards?: Array<{ front: string; back: string; tags?: string[] }>;
        summary?: string;
        error?: string;
      };

      if (!response.ok || !payload.cards || payload.cards.length === 0) {
        throw new Error(payload.error ?? t("app.generate.draftEditFailed"));
      }

      const nextCards = payload.cards
        .map((card) => ({
          front: card.front.trim(),
          back: card.back.trim(),
          tags: (card.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
          manuallyModified: false,
        }))
        .filter((card) => card.front && card.back);

      if (nextCards.length === 0) {
        throw new Error(t("app.generate.noValidCardsAfterEdit"));
      }

      setCards(nextCards);
      setDraftDirty(true);
      setPhase("done");
      setWorkspace("editor");

      addMessage(
        "assistant",
        payload.summary
          ? payload.summary
          : t("app.generate.draftUpdated"),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : t("app.generate.draftEditFailed");
      setError(message);
      setPhase("idle");
      addMessage("assistant", t("app.generate.failedPrefix", { message }));
    } finally {
      setBusy(false);
    }
  }

  async function onPickLevel(nextLevel: Level) {
    if (!topic.trim() || busy) return;
    setLevel(nextLevel);
    setDraftDirty(true);
    addMessage("user", levelLabel(nextLevel, t));
    await generateDraft(nextLevel);
  }

  async function quickGenerate(rawTopic?: string) {
    const incomingTopic = rawTopic?.trim() ?? "";
    const baseTopic = topic.trim() || incomingTopic;

    if (!baseTopic) {
      addMessage(
        "assistant",
        t("app.generate.quickNeedTopic"),
      );
      return;
    }

    if (!topic.trim()) {
      setTopic(baseTopic);
      setCards([]);
      setError(null);
      setSavedCount(0);
      setPhase("idle");
      setDraftDirty(true);
      if (saveMode === "auto" && !autoDeckName.trim()) {
        setAutoDeckName(defaultDeckName(baseTopic, t));
      }
      addMessage("user", baseTopic);
    }

    const chosen = level ?? DEFAULT_LEVEL;
    if (!level) {
      setLevel(chosen);
      setDraftDirty(true);
      addMessage(
        "assistant",
        t("app.generate.usingDefaultLevel", { level: levelLabel(chosen, t) }),
      );
    }

    await generateDraft(chosen, { reason: t("app.generate.quickModeReason") });
  }

  async function commitDraft(options?: {
    snapshot?: SnapshotPayload;
    redirectToStudy?: boolean;
    suppressSavedMessage?: boolean;
    markOnboardingComplete?: boolean;
  }) {
    const snapshot = options?.snapshot ?? buildSnapshotPayload();
    if (!snapshot.cards.length || commitBusy) return;
    if (snapshot.saveMode === "existing" && !snapshot.deckId) {
      const message = t("app.generate.chooseDestinationFirst");
      setError(message);
      addMessage("assistant", message);
      return;
    }

    setCommitBusy(true);
    setError(null);

    try {
      let chatId = pendingChatIdRef.current ?? requestedChatId;
      if (!chatId) {
        chatId = (await upsertDraft({
          snapshot,
        })) as string;
        pendingChatIdRef.current = String(chatId);
        if (!options?.redirectToStudy) {
          navigate(buildGenerateRoute({ chatId: String(chatId) }));
        }
      }

      setPhase("saving");
      const result = (await commitChat({
        id: chatId as any,
        snapshot,
      })) as { created: number; deckId?: string };

      setSavedCount(result.created);
      setDraftDirty(false);
      setPhase("done");
      if (options?.markOnboardingComplete) {
        await markOnboardingComplete({});
      }
      if (options?.redirectToStudy && result.deckId) {
        const query = new URLSearchParams();
        query.set("deck", String(result.deckId));
        query.set("chat", String(chatId));
        query.set("mode", "linear");
        navigate(`/study?${query.toString()}`);
        return;
      }
      if (!options?.suppressSavedMessage) {
        addMessage(
          "assistant",
          t("app.generate.savedToLibrary", { count: result.created }),
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("app.generate.saveFailed");
      setError(message);
      setPhase("idle");
      addMessage("assistant", t("app.generate.saveFailedPrefix", { message }));
    } finally {
      setCommitBusy(false);
    }
  }

  async function clearDraft() {
    if (requestedChatId) {
      try {
        await discardChat({ id: requestedChatId as any });
      } catch (err) {
        console.error("Failed to discard chat", err);
      }
      navigate(buildGenerateRoute({ wantsNew: true }));
      return;
    }
    resetLocal();
  }

  async function applyChatAction(action: ChatAction, rawText: string) {
    addMessage("user", rawText);

    if (action.kind === "setCount") {
      setCount(action.value);
      setDraftDirty(true);
      addMessage(
        "assistant",
        t("app.generate.countUpdated", { count: action.value }),
      );
      return;
    }

    if (action.kind === "setSaveAuto") {
      setSaveMode("auto");
      if (action.name?.trim()) {
        setAutoDeckName(action.name.trim());
      } else if (topic.trim()) {
        setAutoDeckName(defaultDeckName(topic, t));
      }
      setDraftDirty(true);
      addMessage(
        "assistant",
        t("app.generate.autoCreateDeckSaved", {
          name: action.name?.trim()
            ? t("app.generate.autoCreateDeckName", { name: action.name.trim() })
            : "",
        }),
      );
      return;
    }

    if (action.kind === "setSaveExisting") {
      setSaveMode("existing");
      setDeckId(action.deckId);
      setDraftDirty(true);
      addMessage(
        "assistant",
        t("app.generate.existingDeckSaved", { name: action.deckName }),
      );
      return;
    }

    if (action.kind === "openEditor") {
      if (!cards.length) {
        addMessage(
          "assistant",
          t("app.generate.noDraftToEdit"),
        );
        return;
      }
      setWorkspace("editor");
      addMessage("assistant", t("app.generate.editorOpened"));
      return;
    }

    if (action.kind === "saveNow") {
      if (!cards.length) {
        addMessage(
          "assistant",
          t("app.generate.noDraftToSave"),
        );
        return;
      }
      await commitDraft();
    }
  }

  async function handleChatSubmit(e: FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || busy) return;
    setChatInput("");

    if (!topic.trim()) {
      startTopic(text);
      return;
    }

    if (!level) {
      const parsed = parseLevelFromText(text);
      if (parsed) {
        await onPickLevel(parsed);
        return;
      }

      if (hasGenerateIntent(text)) {
        addMessage("user", text);
        await quickGenerate();
        return;
      }

      addMessage("user", text);
      addMessage(
        "assistant",
        t("app.generate.levelHelp"),
      );
      return;
    }

    const action = parseChatAction(text, deckList);
    if (action) {
      await applyChatAction(action, text);
      return;
    }

    addMessage("user", text);

    if (!cards.length) {
      if (hasGenerateIntent(text)) {
        await generateDraft(level, {
          reason: t("app.generate.startWithDirectionReason"),
        });
        return;
      }
      await generateDraft(level, {
        guidance: text,
        reason: t("app.generate.applyGuidanceReason"),
      });
      return;
    }

    if (hasRegenerateIntent(text)) {
      await generateDraft(level, {
        guidance: text,
        reason: t("app.generate.regenerateReason"),
      });
      return;
    }

    await refineDraft(text);
  }

  function updateCardAt(index: number, patch: Partial<GeneratedCard>) {
    setCards((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = {
        ...current,
        ...patch,
        manuallyModified: patch.manuallyModified ?? true,
      };
      return next;
    });
    setDraftDirty(true);
  }

  function removeCardAt(index: number) {
    setCards((prev) => prev.filter((_, i) => i !== index));
    setDraftDirty(true);
  }

  function addManualCard() {
    setCards((prev) => [
      ...prev,
      {
        front: t("app.generate.newQuestion"),
        back: t("app.generate.newAnswer"),
        tags: [],
        manuallyModified: true,
      },
    ]);
    setDraftDirty(true);
  }

  const statusText = useMemo(() => {
    if (phase === "thinking") return t("app.generate.status.thinking");
    if (phase === "generating") return t("app.generate.status.generating");
    if (phase === "saving") return t("app.generate.status.saving");
    if (savedCount > 0) return t("app.generate.status.saved", { count: savedCount });
    if (draftDirty) return t("app.generate.status.draftSaved");
    if (canAskLevel) return t("app.generate.status.waitingLevel");
    return t("app.generate.status.ready");
  }, [phase, savedCount, draftDirty, canAskLevel, t]);

  const destinationPreview = useMemo(() => {
    if (saveMode === "existing") {
      return selectedDeckName || t("app.generate.noDeckSelected");
    }
    if (autoDeckName.trim()) return autoDeckName.trim();
    if (topic.trim()) return defaultDeckName(topic.trim(), t);
    return t("app.generate.autoCreateDeck");
  }, [saveMode, selectedDeckName, autoDeckName, topic, t]);

  const showCustomAutoName =
    saveMode === "auto" &&
    topic.trim().length > 0 &&
    autoDeckName.trim().length > 0 &&
    autoDeckName.trim() !== defaultDeckName(topic, t);

  const refineActions = useMemo(
    () => [
      {
        label: t("app.generate.refine.moreDetailLabel"),
        instruction: t("app.generate.refine.moreDetailInstruction"),
      },
      {
        label: t("app.generate.refine.conciseLabel"),
        instruction: t("app.generate.refine.conciseInstruction"),
      },
      {
        label: t("app.generate.refine.harderLabel"),
        instruction: t("app.generate.refine.harderInstruction"),
      },
      {
        label: t("app.generate.refine.removeOverlapLabel"),
        instruction: t("app.generate.refine.removeOverlapInstruction"),
      },
    ],
    [t],
  );

  const showGenerationAnimation =
    busy ||
    commitBusy ||
    phase === "thinking" ||
    phase === "generating" ||
    phase === "saving";

  if (!topic.trim()) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/cards")}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-border-strong)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">{t("app.generate.title")}</span>
          </h1>
        </div>

        <div className="mx-auto w-full max-w-3xl pt-10">
          <p className="mb-6 text-center text-3xl font-semibold tracking-tight text-[var(--color-text)] md:text-4xl">
            {t("app.generate.landing.title")}
          </p>
          <p className="mb-6 text-center text-sm text-[var(--color-text-secondary)]">
            {t("app.generate.landing.subtitle")}
          </p>

          <form
            onSubmit={handleChatSubmit}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t("app.generate.landing.placeholder")}
              className="w-full border-0 bg-transparent px-2 py-2 text-base focus:ring-0"
              disabled={busy}
            />
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {starterTopics.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => startTopic(preset)}
                className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showGenerationAnimation && <GenerationDeckAnimation t={t} phase={phase} />}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/cards")}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-border-strong)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">{t("app.generate.title")}</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t("app.generate.headerSubtitle")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setWorkspace("coach")}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            workspace === "coach"
              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
          }`}
        >
          <IconChat className="h-3.5 w-3.5" />
          {t("app.generate.coachChat")}
        </button>
        <button
          type="button"
          onClick={() => setWorkspace("editor")}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
            workspace === "editor"
              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
          }`}
        >
          <IconEdit className="h-3.5 w-3.5" />
          {t("app.generate.draftEditor", { count: cards.length })}
        </button>
        <span className="ml-auto rounded-md bg-[var(--color-surface-alt)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
          {statusText}
        </span>
      </div>

      {workspace === "coach" && (
        <div className="space-y-4">
          <div className="card-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                {t("app.generate.chips.topic")}: {topic}
              </span>

              {level && (
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {t("app.generate.chips.level")}: {levelLabel(level, t)}
                </span>
              )}

              {count !== DEFAULT_COUNT && (
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {count} {t("app.generate.chips.cards")}
                </span>
              )}

              {saveMode === "existing" && selectedDeckName && (
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {t("app.generate.chips.savingTo")}: {selectedDeckName}
                </span>
              )}

              {showCustomAutoName && (
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {t("app.generate.chips.newDeck")}: {autoDeckName}
                </span>
              )}
            </div>
          </div>

          <div className="card-surface flex min-h-[24rem] flex-col overflow-hidden">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "assistant"
                      ? "bg-[var(--color-surface-alt)] text-[var(--color-text)]"
                      : "ml-auto bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  }`}
                >
                  {msg.text}
                </div>
              ))}

              {busy && (
                <div className="max-w-[90%] rounded-2xl bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                  <span className="inline-block animate-pulse">{t("app.generate.working")}</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {canAskLevel && (
              <div className="border-t border-[var(--color-border)] px-4 pt-3">
                <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {t("app.generate.yourLevel")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["beginner", "intermediate", "advanced"] as const).map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      disabled={busy}
                      onClick={() => void onPickLevel(lv)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                        level === lv
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"
                      } disabled:opacity-50`}
                    >
                      {levelLabel(lv, t)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void quickGenerate()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    <IconZap className="h-3.5 w-3.5" />
                    {t("app.generate.generateNow")}
                  </button>
                </div>
              </div>
            )}

            {canRefine && (
              <div className="border-t border-[var(--color-border)] px-4 pt-3">
                <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {t("app.generate.quickRefinements")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {refineActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        addMessage("user", action.label);
                        void refineDraft(action.instruction);
                      }}
                      className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleChatSubmit} className="flex gap-2 border-t border-[var(--color-border)] p-4">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  !level
                    ? t("app.generate.chatPlaceholderLevel")
                    : t("app.generate.chatPlaceholderRefine")
                }
                className="flex-1"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => {
                  const rawTopic = topic.trim() ? undefined : chatInput;
                  if (!topic.trim()) {
                    setChatInput("");
                  }
                  void quickGenerate(rawTopic);
                }}
                disabled={busy || (!topic.trim() && chatInput.trim().length < 2)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)] transition hover:opacity-90 disabled:opacity-50"
              >
                <IconZap className="h-3.5 w-3.5" />
                {t("app.generate.instant")}
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || chatInput.trim().length < 2}
              >
                {t("app.generate.send")}
              </button>
            </form>

            <div className="border-t border-[var(--color-border)] px-4 py-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
              >
                <IconTune className="h-3.5 w-3.5" />
                {showAdvanced ? t("app.generate.hideSetup") : t("app.generate.adjustSetup")}
              </button>
            </div>

            {showAdvanced && (
              <div className="border-t border-[var(--color-border)] px-4 pb-4 pt-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label>
                    {t("app.generate.defaultCardCount")}
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {[12, 20, 24, 30].map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={busy}
                          onClick={() => setCount(n)}
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
                  </label>

                  <label>
                    {t("app.generate.saveDestination")}
                    <div className="mt-1.5 space-y-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSaveMode("auto")}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                            saveMode === "auto"
                              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                              : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                          }`}
                        >
                          {t("app.generate.autoCreateDeck")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSaveMode("existing")}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                            saveMode === "existing"
                              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                              : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                          }`}
                        >
                          {t("app.generate.existingDeck")}
                        </button>
                      </div>

                      {saveMode === "existing" ? (
                        <select value={deckId} onChange={(e) => setDeckId(e.target.value)} disabled={busy}>
                          <option value="">{t("app.generate.chooseDeck")}</option>
                          {deckList.map((deck) => (
                            <option key={deck._id} value={deck._id}>
                              {deck.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={autoDeckName}
                          onChange={(e) => setAutoDeckName(e.target.value)}
                          placeholder={t("app.generate.newDeckNamePlaceholder")}
                          disabled={busy}
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        </div>
      )}

      {workspace === "editor" && (
        <div className="space-y-4">
          <div className="card-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                <IconEdit className="h-4 w-4" />
                {t("app.generate.draftEditor", { count: cards.length })}
              </span>
              <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                {t("app.generate.saveDestination")}: {destinationPreview}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWorkspace("coach")}
                  className="btn-secondary !text-xs"
                >
                  {t("app.generate.backToChat")}
                </button>
                <button
                  type="button"
                  onClick={addManualCard}
                  className="btn-secondary !text-xs"
                >
                  {t("app.generate.addCard")}
                </button>
                <button
                  type="button"
                  onClick={() => void commitDraft()}
                  disabled={commitBusy || busy || cards.length === 0}
                  className="btn-primary !text-xs"
                >
                  {commitBusy ? t("app.generate.status.saving") : t("app.generate.saveToLibrary")}
                </button>
                <button
                  type="button"
                  onClick={() => void clearDraft()}
                  className="btn-danger !text-xs"
                >
                  {t("app.generate.discardDraft")}
                </button>
              </div>
            </div>

            {savedCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-sm text-[var(--color-success)]">
                  {t("app.generate.savedSuccess", { count: savedCount })}
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/cards")}
                  className="btn-primary !text-xs"
                >
                  {t("app.generate.openCards")}
                </button>
              </div>
            )}

            {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
          </div>

          {cards.length === 0 && (
            <div className="card-surface p-6 text-center text-sm text-[var(--color-text-secondary)]">
              {t("app.generate.noDraftCards")}
            </div>
          )}

          {cards.length > 0 && (
            <div className="space-y-3">
              {cards.map((card, idx) => (
                <div key={`${idx}-${card.front.slice(0, 30)}`} className="card-surface p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                      {t("app.generate.cardTitle", { count: idx + 1 })}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeCardAt(idx)}
                      className="text-xs font-semibold text-[var(--color-danger)] hover:underline"
                    >
                      {t("app.generate.remove")}
                    </button>
                  </div>

                  <label>
                    {t("app.generate.front")}
                    <textarea
                      rows={2}
                      value={card.front}
                      onChange={(e) => updateCardAt(idx, { front: e.target.value, manuallyModified: true })}
                    />
                  </label>

                  <label className="mt-2 block">
                    {t("app.generate.back")}
                    <textarea
                      rows={5}
                      value={card.back}
                      onChange={(e) => updateCardAt(idx, { back: e.target.value, manuallyModified: true })}
                    />
                  </label>

                  <label className="mt-2 block">
                    {t("app.generate.tags")}
                    <input
                      value={card.tags.join(", ")}
                      onChange={(e) =>
                        updateCardAt(idx, {
                          tags: e.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean),
                          manuallyModified: true,
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
