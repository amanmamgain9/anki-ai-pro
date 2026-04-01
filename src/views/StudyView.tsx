/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLink, useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";
import { useStudyVoice } from "@/hooks/useStudyVoice";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const api = anyApi;

type Deck = { _id: string; name: string };
type DueCard = { _id: string; front: string; back: string };
type Card = { _id: string; front: string; back: string };
type StudyMode = "smart" | "linear";
type LinearStudyState = {
  deckId: string;
  sourceChatId: string | null;
  currentCardId: string | null;
  currentIndex: number;
  totalCards: number;
  orderFingerprint: string;
  lastSeenAt: number;
  completedAt: number | null;
};
type BillingState = {
  isActive: boolean;
  // "inactive" means locked out until trial, paid, or manual access is active.
  plan: "inactive" | "pro" | "pro_plus";
  hasPremiumVoice?: boolean;
  trialActive?: boolean;
  trialEndsAt?: number | null;
};
type HeatCell = { dayStart: number; count: number };
type HeatmapData = {
  days: HeatCell[];
  startDay: number;
  endDay: number;
  maxCount: number;
  totalReviews: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
};
type TutorChatMeta = {
  _id: string;
  status: string;
  title: string | null;
  summary: string | null;
  hasSummary: boolean;
  messageCount: number;
  lastMessagePreview: string | null;
  createdAt: number;
  updatedAt: number;
};
type TutorChatDetail = {
  chat: {
    _id: string;
    status: string;
    title: string | null;
    summary: string | null;
    messageCount: number;
    createdAt: number;
    updatedAt: number;
  };
  messages: Array<{
    _id: string;
    role: "user" | "assistant";
    content: string;
    order: number;
    createdAt: number;
  }>;
};

function heatLevel(count: number, maxCount: number) {
  if (count <= 0) return 0;
  if (maxCount <= 1) return 4;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function heatColor(level: number) {
  if (level === 0) return "color-mix(in srgb, var(--color-surface-alt) 88%, #000 12%)";
  if (level === 1) return "color-mix(in srgb, var(--color-accent) 24%, var(--color-surface-alt) 76%)";
  if (level === 2) return "color-mix(in srgb, var(--color-accent) 45%, var(--color-surface-alt) 55%)";
  if (level === 3) return "color-mix(in srgb, var(--color-accent) 68%, var(--color-surface-alt) 32%)";
  return "color-mix(in srgb, var(--color-accent) 88%, #fff 12%)";
}

function formatDateTime(ts: number, locale: string) {
  return new Date(ts).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StudyView() {
  const { locale, t } = useI18n();
  const { searchParams, navigate } = useAppRouter();
  const deckId = searchParams.get("deck") || undefined;
  const sourceChatId = searchParams.get("chat") || undefined;
  const modeParam = searchParams.get("mode");
  const ratings = useMemo(
    () => [
      { label: t("app.study.ratings.again.label"), quality: 0, color: "#ef4444", border: "rgba(239,68,68,0.45)", desc: t("app.study.ratings.again.desc") },
      { label: t("app.study.ratings.hard.label"), quality: 1, color: "#f59e0b", border: "rgba(245,158,11,0.45)", desc: t("app.study.ratings.hard.desc") },
      { label: t("app.study.ratings.good.label"), quality: 2, color: "#10b981", border: "rgba(16,185,129,0.45)", desc: t("app.study.ratings.good.desc") },
      { label: t("app.study.ratings.easy.label"), quality: 3, color: "#8b5cf6", border: "rgba(139,92,246,0.45)", desc: t("app.study.ratings.easy.desc") },
    ] as const,
    [t],
  );

  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const billing = useQuery(api.billing.getMyBilling, {}) as BillingState | undefined;
  const [studyAll, setStudyAll] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [linearIndex, setLinearIndex] = useState(0);
  const [linearResumeReady, setLinearResumeReady] = useState(false);
  const [showAllView, setShowAllView] = useState(false);
  const [showTutorPanel, setShowTutorPanel] = useState(false);
  const [selectedTutorChatId, setSelectedTutorChatId] = useState<string | null>(null);
  const [tutorInput, setTutorInput] = useState("");
  const [tutorBusy, setTutorBusy] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [tutorDictationSupported, setTutorDictationSupported] = useState(false);
  const [tutorDictating, setTutorDictating] = useState(false);
  const tutorScrollRef = useRef<HTMLDivElement | null>(null);
  const closeAfterReplyRef = useRef(false);
  const tutorDictationRef = useRef<any>(null);
  const voiceModeRef = useRef(false);
  const suppressFlipUntilRef = useRef(0);
  const linearStudyState = useQuery(
    api.study.getStudyState,
    deckId
      ? {
          deckId: deckId as any,
          mode: "linear",
          sourceChatId: sourceChatId ? (sourceChatId as any) : undefined,
        }
      : "skip",
  ) as LinearStudyState | null | undefined;
  const hasLinearResume = Boolean(linearStudyState && !linearStudyState.completedAt);
  const mode: StudyMode = modeParam === "linear" || (!modeParam && (!!sourceChatId || hasLinearResume))
    ? "linear"
    : "smart";
  const isLinearMode = mode === "linear";

  // Only fetch the active study source based on mode
  const dueData = useQuery(
    api.study.getDueCards,
    deckId && !isLinearMode ? { deckId, all: studyAll || undefined } : "skip",
  ) as { due: DueCard[]; total: number; reviewed: number } | undefined;
  const linearData = useQuery(
    api.study.getLinearCards,
    deckId && isLinearMode
      ? {
          deckId,
          chatId: sourceChatId ? (sourceChatId as any) : undefined,
        }
      : "skip",
  ) as { due: DueCard[]; total: number; reviewed: number; orderFingerprint: string } | undefined;
  const activeLinearStudyStates = useQuery(
    api.study.listLinearStudyStates,
    {},
  ) as Array<{
    deckId: string;
    sourceChatId: string | null;
    currentCardId: string;
    currentIndex: number;
    totalCards: number;
    lastSeenAt: number;
  }> | undefined;
  const activeData = isLinearMode ? linearData : dueData;
  const allCards = useQuery(
    api.flashcards.list,
    deckId ? { deckId } : "skip",
  ) as Card[] | undefined;

  useEffect(() => {
    setSessionDone(0);
    setFlipped(false);
    setLinearIndex(0);
    setLinearResumeReady(!isLinearMode);
    suppressFlipUntilRef.current = Date.now() + 300;
  }, [deckId, isLinearMode, mode, sourceChatId]);

  const statsAllDecks = useQuery(api.study.getSessionStats, {}) as
    | { total: number; newCount: number; dueCount: number; reviewedToday: number }
    | undefined;
  const heatmap = useQuery(api.study.getReviewHeatmap, { sinceUserCreated: true }) as
    | HeatmapData
    | undefined;
  const recordReview = useMutation(api.study.recordReview);
  const saveStudyState = useMutation(api.study.saveStudyState);
  const startTutorChat = useMutation(api.cardChats.start);
  const appendTutorTurn = useMutation(api.cardChats.appendTurn);
  const completeTutorChat = useMutation(api.cardChats.complete);

  const linearCards = useMemo(() => linearData?.due ?? [], [linearData]);
  const allCardsList = allCards ?? [];
  const linearStateByDeck = useMemo(
    () => new Map((activeLinearStudyStates ?? []).map((state) => [String(state.deckId), state])),
    [activeLinearStudyStates],
  );

  useEffect(() => {
    if (!isLinearMode) {
      setLinearResumeReady(true);
      return;
    }
    if (!deckId || !linearData) return;

    if (linearCards.length === 0) {
      setLinearIndex(0);
      setLinearResumeReady(true);
      return;
    }

    if (linearStudyState?.completedAt) {
      setLinearIndex(0);
      setLinearResumeReady(true);
      return;
    }

    let nextIndex = 0;
    if (linearStudyState?.currentCardId) {
      const exactIndex = linearCards.findIndex((card) => card._id === linearStudyState.currentCardId);
      if (exactIndex >= 0) {
        nextIndex = exactIndex;
      } else if (linearStudyState.currentIndex > 0) {
        nextIndex = Math.min(
          Math.max(0, linearStudyState.currentIndex),
          Math.max(0, linearCards.length - 1),
        );
      }
    } else if (linearStudyState && linearStudyState.currentIndex > 0) {
      nextIndex = Math.min(
        Math.max(0, linearStudyState.currentIndex),
        Math.max(0, linearCards.length - 1),
      );
    }

    setLinearIndex(nextIndex);
    setLinearResumeReady(true);
  }, [deckId, isLinearMode, linearCards, linearData, linearStudyState]);

  const currentCard = isLinearMode
    ? (linearResumeReady ? linearCards[linearIndex] ?? null : null)
    : dueData?.due[0] ?? null;
  const tutorChats = useQuery(
    api.cardChats.listForCard,
    currentCard ? { cardId: currentCard._id as any } : "skip",
  ) as TutorChatMeta[] | undefined;
  const tutorChatDetail = useQuery(
    api.cardChats.get,
    selectedTutorChatId ? { id: selectedTutorChatId as any } : "skip",
  ) as TutorChatDetail | undefined;
  const remaining = isLinearMode
    ? (linearResumeReady ? Math.max(0, linearCards.length - linearIndex) : 0)
    : dueData
      ? dueData.due.length
      : 0;
  const deckName = deckId
    ? decks?.find((d) => d._id === deckId)?.name ?? t("app.study.deckFallback")
    : t("app.study.allCardsDeckName");
  const ratingByQuality = useMemo(
    () => new Map(ratings.map((item) => [item.quality, item])),
    [ratings],
  );

  const progressPct = activeData?.total
    ? isLinearMode
      ? (Math.min(linearIndex, activeData.total) / activeData.total) * 100
      : ((activeData.reviewed + sessionDone) / activeData.total) * 100
    : 0;

  useEffect(() => {
    if (!isLinearMode || !deckId || !linearResumeReady || !linearData) return;
    const orderFingerprint = linearData.orderFingerprint;
    if (linearCards.length === 0) return;

    if (linearIndex >= linearCards.length) {
      void saveStudyState({
        deckId: deckId as any,
        mode: "linear",
        sourceChatId: sourceChatId ? (sourceChatId as any) : undefined,
        currentIndex: linearCards.length,
        totalCards: linearCards.length,
        orderFingerprint,
        completed: true,
      });
      return;
    }

    const activeCard = linearCards[linearIndex];
    if (!activeCard) return;
    void saveStudyState({
      deckId: deckId as any,
      mode: "linear",
      sourceChatId: sourceChatId ? (sourceChatId as any) : undefined,
      currentCardId: activeCard._id as any,
      currentIndex: linearIndex,
      totalCards: linearCards.length,
      orderFingerprint,
      completed: false,
    });
  }, [
    deckId,
    isLinearMode,
    linearCards,
    linearData,
    linearIndex,
    linearResumeReady,
    saveStudyState,
    sourceChatId,
  ]);

  const heatWeeks = useMemo(() => {
    if (!heatmap?.days?.length) return [] as Array<Array<HeatCell | null>>;
    const startWeekday = new Date(heatmap.days[0].dayStart).getUTCDay();
    const padded: Array<HeatCell | null> = [
      ...Array.from({ length: startWeekday }, () => null),
      ...heatmap.days,
    ];
    while (padded.length % 7 !== 0) padded.push(null);
    const weeks: Array<Array<HeatCell | null>> = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }
    return weeks;
  }, [heatmap]);

  const heatmapRangeLabel = useMemo(() => {
    if (!heatmap) return t("app.study.heatmap.loading");
    const startLabel = new Date(heatmap.startDay).toLocaleDateString(
      locale,
      { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
    );
    const trackedDays = Math.max(1, heatmap.days.length);
    const dayLabel = trackedDays === 1
      ? t("app.study.heatmap.daySingular")
      : t("app.study.heatmap.dayPlural");
    return t("app.study.heatmap.range", { start: startLabel, days: trackedDays, dayLabel });
  }, [heatmap, locale, t]);

  useEffect(() => {
    setSelectedTutorChatId(null);
    setTutorInput("");
    setTutorError(null);
    setPendingUserMessage(null);
    setAssistantTyping(false);
    closeAfterReplyRef.current = false;
  }, [currentCard?._id]);

  useEffect(() => {
    if (!tutorChats) return;
    if (tutorChats.length === 0) {
      setSelectedTutorChatId(null);
      return;
    }
    if (!selectedTutorChatId) {
      setSelectedTutorChatId(String(tutorChats[0]._id));
      return;
    }
    if (!tutorChats.find((chat) => String(chat._id) === String(selectedTutorChatId))) {
      setSelectedTutorChatId(String(tutorChats[0]._id));
    }
  }, [tutorChats, selectedTutorChatId]);

  useEffect(() => {
    if (!showTutorPanel) return;
    const el = tutorScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [showTutorPanel, tutorChatDetail?.messages.length, tutorChatDetail?.chat.summary]);

  const ensureTutorChatId = useCallback(async () => {
    if (selectedTutorChatId) return selectedTutorChatId;
    if (!currentCard) return null;
    const started = (await startTutorChat({
      cardId: currentCard._id as any,
    })) as { id: string };
    const id = String(started.id);
    setSelectedTutorChatId(id);
    return id;
  }, [selectedTutorChatId, currentCard, startTutorChat]);

  const startFreshTutorChat = useCallback(async () => {
    if (!currentCard || tutorBusy || summaryBusy) return;
    setTutorError(null);
    const started = (await startTutorChat({
      cardId: currentCard._id as any,
    })) as { id: string };
    setSelectedTutorChatId(String(started.id));
    setTutorInput("");
  }, [currentCard, tutorBusy, summaryBusy, startTutorChat]);

  const summarizeSelectedTutorChat = useCallback(async (
    silent: boolean,
    options?: {
      chatId?: string;
      messages?: Array<{ role: "user" | "assistant"; content: string }>;
    },
  ) => {
    const activeChatId = options?.chatId ?? selectedTutorChatId;
    if (!currentCard || summaryBusy || !activeChatId) return;
    const history = options?.messages ?? tutorChatDetail?.messages ?? [];
    const existingSummary = Boolean(tutorChatDetail?.chat.summary);
    if (existingSummary || history.length < 2) return;

    setSummaryBusy(true);
    if (!silent) setTutorError(null);
    try {
      const response = await fetch("/api/ai/card-chat-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: {
            front: currentCard.front,
            back: currentCard.back,
          },
          messages: history.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        summary?: string;
        error?: string;
      };
      if (!response.ok || !payload.summary) {
        throw new Error(payload.error ?? t("app.study.tutor.errors.summaryFailed"));
      }
      await completeTutorChat({
        id: activeChatId as any,
        summary: payload.summary,
      });
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : t("app.study.tutor.errors.summaryFailed");
      if (silent) {
        console.error("Auto summary on close failed", err);
      } else {
        setTutorError(messageText);
      }
    } finally {
      setSummaryBusy(false);
    }
  }, [
    currentCard,
    summaryBusy,
    selectedTutorChatId,
    tutorChatDetail?.messages,
    tutorChatDetail?.chat.summary,
    t,
    completeTutorChat,
  ]);

  const closeTutorPanel = useCallback(() => {
    if (tutorBusy) {
      closeAfterReplyRef.current = true;
      setShowTutorPanel(false);
      return;
    }
    void summarizeSelectedTutorChat(true);
    setShowTutorPanel(false);
  }, [tutorBusy, summarizeSelectedTutorChat]);

  const sendTutorMessage = useCallback(async (presetMessage?: string) => {
    if (!currentCard || tutorBusy) return null;
    const message = (presetMessage ?? tutorInput).trim();
    if (!message) return null;

    setTutorBusy(true);
    setPendingUserMessage(message);
    setAssistantTyping(true);
    setTutorError(null);
    let chatIdUsed: string | null = null;
    let forcedSummaryMessages: Array<{ role: "user" | "assistant"; content: string }> | null = null;
    let assistantReply: string | null = null;
    try {
      const chatId = await ensureTutorChatId();
      if (!chatId) return null;
      chatIdUsed = String(chatId);
      const history = tutorChatDetail?.messages?.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })) ?? [];

      const response = await fetch("/api/ai/card-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: {
            front: currentCard.front,
            back: currentCard.back,
          },
          messages: history,
          userMessage: message,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };
      if (!response.ok || !payload.reply) {
        throw new Error(payload.error ?? t("app.study.tutor.errors.replyFailed"));
      }
      assistantReply = payload.reply;

      await appendTutorTurn({
        id: chatId as any,
        userMessage: message,
        assistantMessage: assistantReply,
      });
      forcedSummaryMessages = [
        ...history,
        { role: "user", content: message },
        { role: "assistant", content: assistantReply },
      ];
      if (!presetMessage) {
        setTutorInput("");
      }
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : t("app.study.tutor.errors.sendFailed");
      setTutorError(messageText);
    } finally {
      setPendingUserMessage(null);
      setAssistantTyping(false);
      setTutorBusy(false);
      if (closeAfterReplyRef.current) {
        closeAfterReplyRef.current = false;
        void summarizeSelectedTutorChat(
          true,
          chatIdUsed && forcedSummaryMessages
            ? { chatId: chatIdUsed, messages: forcedSummaryMessages }
            : undefined,
        );
      }
    }
    return assistantReply;
  }, [
    currentCard,
    tutorBusy,
    tutorInput,
    ensureTutorChatId,
    tutorChatDetail?.messages,
    appendTutorTurn,
    t,
    summarizeSelectedTutorChat,
  ]);

  const finishTutorChat = useCallback(async () => {
    if (!selectedTutorChatId) {
      setTutorError(t("app.study.tutor.errors.needMessageBeforeSummary"));
      return;
    }
    const historyCount = tutorChatDetail?.messages.length ?? 0;
    if (historyCount < 2) {
      setTutorError(t("app.study.tutor.errors.needQATurnBeforeSummary"));
      return;
    }
    await summarizeSelectedTutorChat(false);
  }, [selectedTutorChatId, summarizeSelectedTutorChat, tutorChatDetail?.messages.length, t]);

  const selectedTutorChatMeta = tutorChats?.find(
    (chat) => String(chat._id) === String(selectedTutorChatId),
  ) ?? null;
  const tutorSessionCount = tutorChats?.length ?? 0;
  const hasTutorHistory = tutorSessionCount > 0;
  const latestSummaryChat =
    tutorChats?.find((chat) => Boolean(chat.hasSummary)) ?? null;
  const hasTutorSummary = Boolean(latestSummaryChat);
  const openLatestSummary = useCallback(() => {
    if (!latestSummaryChat) return;
    setSelectedTutorChatId(String(latestSummaryChat._id));
    setShowTutorPanel(true);
  }, [latestSummaryChat]);
  const tutorStarterPrompt = t("app.study.tutor.starterPrompt");

  useEffect(() => {
    if (typeof window === "undefined") {
      setTutorDictationSupported(false);
      return;
    }
    const supported = Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition,
    );
    setTutorDictationSupported(supported);
  }, []);

  const stopTutorDictation = useCallback(() => {
    const recognition = tutorDictationRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // no-op
      }
    }
    tutorDictationRef.current = null;
    setTutorDictating(false);
  }, []);

  const toggleTutorDictation = useCallback(() => {
    if (tutorDictating) {
      stopTutorDictation();
      return;
    }
    if (voiceModeRef.current) {
      setTutorError(t("app.study.tutor.voiceInMainMode"));
      return;
    }
    if (typeof window === "undefined") return;
    const RecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setTutorError(t("app.study.voice.unsupported"));
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = locale.startsWith("zh") ? "zh-CN" : locale || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i]?.[0]?.transcript;
        if (typeof chunk === "string" && chunk.trim()) {
          transcript += `${chunk.trim()} `;
        }
      }
      const spoken = transcript.trim();
      if (!spoken) return;
      setTutorInput((prev) => (prev.trim() ? `${prev.trim()}\n${spoken}` : spoken));
    };
    recognition.onerror = () => {
      setTutorError(t("app.study.tutor.voiceCaptureFailed"));
      tutorDictationRef.current = null;
      setTutorDictating(false);
    };
    recognition.onend = () => {
      tutorDictationRef.current = null;
      setTutorDictating(false);
    };

    tutorDictationRef.current = recognition;
    setTutorError(null);
    setTutorDictating(true);
    try {
      recognition.start();
    } catch {
      tutorDictationRef.current = null;
      setTutorDictating(false);
      setTutorError(t("app.study.tutor.voiceCaptureFailed"));
    }
  }, [locale, stopTutorDictation, t, tutorDictating]);

  useEffect(() => () => stopTutorDictation(), [stopTutorDictation]);

  const applyRating = useCallback(async (quality: number) => {
    if (!currentCard || animating) return;
    setAnimating(true);
    suppressFlipUntilRef.current = Date.now() + 450;
    await recordReview({ cardId: currentCard._id as any, quality });
    setSessionDone((n) => n + 1);
    if (isLinearMode) {
      setLinearIndex((idx) => idx + 1);
    }
    setFlipped(false);
    setTimeout(() => setAnimating(false), 200);
  }, [animating, currentCard, isLinearMode, recordReview]);

  const ratingLabelByQuality = useCallback(
    (quality: 0 | 1 | 2 | 3) => ratingByQuality.get(quality)?.label ?? "Good",
    [ratingByQuality],
  );

  const {
    voiceMode,
    voiceSupported,
    voiceListening,
    voiceStatus,
    suggestedVoiceQuality,
    toggleVoiceMode,
    interruptVoiceTurn,
  } = useStudyVoice({
    locale,
    t,
    deckId,
    decks,
    currentCard,
    selectedTutorChatId,
    showTutorPanel,
    setShowTutorPanel,
    flipped,
    setFlipped,
    isLinearMode,
    linearCardsLength: linearCards.length,
    setLinearIndex,
    navigate,
    applyRating,
    sendTutorMessage,
    ratingLabelByQuality,
    usePremiumTts: Boolean(billing?.hasPremiumVoice || billing?.isActive),
  });

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  const setMode = useCallback(
    (nextMode: StudyMode) => {
      if (!deckId) return;
      interruptVoiceTurn("manual_mode_switch");
      const query = new URLSearchParams(searchParams.toString());
      query.set("deck", deckId);
      query.delete("draft");
      query.set("mode", nextMode);
      navigate(`/study?${query.toString()}`);
    },
    [deckId, interruptVoiceTurn, navigate, searchParams],
  );

  const handleRate = useCallback(async (quality: number) => {
    interruptVoiceTurn("manual_rating");
    await applyRating(quality);
  }, [applyRating, interruptVoiceTurn]);

  const handleFlip = useCallback(() => {
    interruptVoiceTurn("manual_flip");
    if (Date.now() < suppressFlipUntilRef.current) return;
    if (!animating) setFlipped((f) => !f);
  }, [animating, interruptVoiceTurn]);

  useEffect(() => {
    suppressFlipUntilRef.current = Date.now() + 250;
  }, [currentCard?._id]);

  // ── Deck picker (no deck selected) ───────────────
  if (!deckId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">{t("app.study.title")}</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t("app.study.pickDeckDesc")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!voiceSupported}
                onClick={toggleVoiceMode}
                className="btn-secondary !px-3 !py-1.5 !text-xs disabled:opacity-50"
              >
                {voiceMode ? t("app.study.voice.toggleOn") : t("app.study.voice.toggleOff")}
              </button>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {voiceSupported
                ? voiceStatus ?? (voiceListening ? t("app.study.voice.listening") : "")
                : t("app.study.voice.unsupported")}
            </span>
          </div>
        </div>

        {/* Quick stats */}
        {statsAllDecks && (
          <div className="grid grid-cols-3 gap-3">
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-[var(--color-accent)]">{statsAllDecks.newCount}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{t("app.study.stats.new")}</p>
            </div>
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{statsAllDecks.dueCount}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{t("app.study.stats.due")}</p>
            </div>
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-[var(--color-success)]">{statsAllDecks.reviewedToday}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{t("app.study.stats.today")}</p>
            </div>
          </div>
        )}

        <div className="card-surface overflow-hidden p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{t("app.study.heatmap.title")}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {heatmapRangeLabel}
              </p>
            </div>
            {heatmap && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                <span>
                  {t("app.study.heatmap.currentStreak")}{" "}
                  <strong className="text-[var(--color-text)]">{heatmap.currentStreak}</strong>
                </span>
                <span>
                  {t("app.study.heatmap.longestStreak")}{" "}
                  <strong className="text-[var(--color-text)]">{heatmap.longestStreak}</strong>
                </span>
                <span>
                  {t("app.study.heatmap.totalReviews")}{" "}
                  <strong className="text-[var(--color-text)]">{heatmap.totalReviews}</strong>
                </span>
              </div>
            )}
          </div>

          {!heatmap && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t("app.study.heatmap.loading")}
            </p>
          )}

          {heatmap && heatWeeks.length > 0 && (
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max items-start gap-2">
                <div className="grid grid-rows-7 gap-1 pt-[1px] text-[10px] text-[var(--color-text-tertiary)]">
                  {t("app.study.heatmap.weekdaysCompact").split(",").map((d, idx) => (
                    <div key={`${idx}-${d}`} className="h-3">{d}</div>
                  ))}
                </div>
                <div className="flex gap-1">
                  {heatWeeks.map((week, weekIdx) => (
                    <div key={weekIdx} className="grid grid-rows-7 gap-1">
                      {week.map((cell, dayIdx) => {
                        if (!cell) {
                          return (
                            <div
                              key={`${weekIdx}-${dayIdx}`}
                              className="h-3 w-3 rounded-[3px] bg-transparent"
                            />
                          );
                        }
                        const level = heatLevel(cell.count, heatmap.maxCount);
                        const dateLabel = new Date(cell.dayStart).toLocaleDateString(
                          locale,
                          { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
                        );
                        const reviewLabel = cell.count === 1
                          ? t("app.study.heatmap.reviewSingular")
                          : t("app.study.heatmap.reviewPlural");
                        return (
                          <div
                            key={`${weekIdx}-${dayIdx}`}
                            className="h-3 w-3 rounded-[3px] border border-[var(--color-border)]/65"
                            style={{ backgroundColor: heatColor(level) }}
                            title={t("app.study.heatmap.cellTitle", { date: dateLabel, count: cell.count, reviewLabel })}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Deck list */}
        {!decks && <p className="text-sm text-[var(--color-text-secondary)]">{t("app.study.loadingDecks")}</p>}

        {decks && decks.length === 0 && (
          <div className="card-surface flex flex-col items-center px-6 py-16 text-center">
            <h3 className="text-base font-bold">{t("app.study.noDecksTitle")}</h3>
            <p className="mt-1 max-w-xs text-sm text-[var(--color-text-secondary)]">
              {t("app.study.noDecksDesc")}
            </p>
            <AppLink href="/decks/new" className="btn-primary mt-5">{t("app.study.createDeck")}</AppLink>
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
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    {linearStateByDeck.has(String(deck._id))
                      ? t("app.study.tapToResume")
                      : t("app.study.tapToStudy")}
                  </p>
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
            <h1 className="text-lg font-bold tracking-tight"><span className="gradient-text">{t("app.study.title")}</span></h1>
            <p className="text-xs text-[var(--color-text-secondary)]">{deckName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {sourceChatId && (
            <button
              type="button"
              onClick={() =>
                navigate(`/cards/generate?chat=${encodeURIComponent(sourceChatId)}`)
              }
              className="btn-secondary !px-3 !py-1.5 !text-xs"
            >
              {t("app.study.editThisSet")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAllView((prev) => !prev)}
            className="btn-secondary !px-3 !py-1.5 !text-xs"
          >
            {showAllView ? t("app.study.hideAll") : t("app.study.allView")}
          </button>
          <AppLink href={deckId ? `/cards?deck=${deckId}` : "/cards"} className="btn-secondary !px-3 !py-1.5 !text-xs">
            {t("app.study.editAll")}
          </AppLink>
          <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
            <button
              type="button"
              onClick={() => setMode("smart")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                !isLinearMode
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              }`}
            >
              {t("app.study.modeSmart")}
            </button>
            <button
              type="button"
              onClick={() => setMode("linear")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                isLinearMode
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              }`}
            >
              {t("app.study.modeLinear")}
            </button>
          </div>
          <span className="font-semibold text-[var(--color-success)]">{sessionDone} {t("app.study.done")}</span>
          <span className="text-[var(--color-text-secondary)]">{remaining} {t("app.study.remaining")}</span>
          <button
            type="button"
            disabled={!voiceSupported}
            onClick={toggleVoiceMode}
            className="btn-secondary !px-3 !py-1.5 !text-xs disabled:opacity-50"
          >
            {voiceMode ? t("app.study.voice.toggleOn") : t("app.study.voice.toggleOff")}
          </button>
          <span className="text-xs text-[var(--color-text-secondary)]">
            {voiceSupported
              ? voiceStatus ?? (voiceListening ? t("app.study.voice.listening") : "")
              : t("app.study.voice.unsupported")}
          </span>
        </div>
      </div>

      {activeData && activeData.total > 0 && (
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, progressPct)}%`, background: "linear-gradient(90deg, var(--color-gradient-from), var(--color-gradient-to))" }} />
        </div>
      )}

      {showAllView && (
        <div className="card-surface mb-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <p className="text-sm font-semibold">{t("app.study.allCardsInDeck")}</p>
            <AppLink href={deckId ? `/cards?deck=${deckId}` : "/cards"} className="btn-secondary !px-3 !py-1.5 !text-xs">
              {t("app.study.openFullEditor")}
            </AppLink>
          </div>
          <div className="max-h-64 divide-y divide-[var(--color-border)] overflow-y-auto">
            {allCardsList.map((card, idx) => (
              <div key={card._id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-7 shrink-0 text-xs text-[var(--color-text-tertiary)]">{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => {
                    const linearPos = linearCards.findIndex((c) => c._id === card._id);
                    if (linearPos >= 0) {
                      setLinearIndex(linearPos);
                      setFlipped(false);
                    }
                  }}
                  className="min-w-0 flex-1 text-left text-sm text-[var(--color-text)]"
                >
                  <span className="line-clamp-1">{card.front.split("\n")[0].replace(/^#+\s*/, "")}</span>
                </button>
                <AppLink href={`/cards/new?edit=${card._id}`} className="btn-secondary !px-2.5 !py-1 !text-xs">
                  {t("app.study.edit")}
                </AppLink>
              </div>
            ))}
            {allCardsList.length === 0 && (
              <p className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{t("app.study.noCardsYet")}</p>
            )}
          </div>
        </div>
      )}

      <div className={`flex flex-1 flex-col items-center ${currentCard ? "justify-start pt-2" : "justify-center"}`}>
        {(!activeData || (isLinearMode && !linearResumeReady)) && (
          <p className="text-[var(--color-text-secondary)]">{t("app.study.loadingCards")}</p>
        )}

        {activeData && remaining === 0 && (
          <div className="card-surface mx-auto flex w-full max-w-lg flex-col items-center px-6 py-16 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-success-soft)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <h2 className="text-xl font-bold">{t("app.study.sessionComplete.title")}</h2>
            <p className="mt-2 text-[var(--color-text-secondary)]">
              {t("app.study.sessionComplete.reviewedPrefix")}{" "}
              <strong className="text-[var(--color-text)]">{sessionDone}</strong>
              {" "}
              {sessionDone === 1
                ? t("app.study.sessionComplete.reviewedSuffixSingular")
                : t("app.study.sessionComplete.reviewedSuffixPlural")}
              {activeData.total > 0 && (
                <>
                  {" "}
                  {t("app.study.sessionComplete.mastered", {
                    done: Math.min(activeData.total, activeData.reviewed + sessionDone),
                    total: activeData.total,
                  })}
                </>
              )}
            </p>
            <div className="mt-6 flex gap-2">
              <AppLink href="/study" className="btn-secondary">{t("app.study.pickAnotherDeck")}</AppLink>
              <button
                type="button"
                onClick={() => {
                  if (isLinearMode) setLinearIndex(0);
                  else setStudyAll(true);
                  setSessionDone(0);
                  setFlipped(false);
                }}
                className="btn-primary"
              >
                {t("app.study.studyAgain")}
              </button>
            </div>
          </div>
        )}

        {currentCard && (
          <div className="w-full max-w-[min(96vw,78rem)]">
            {!flipped && (
              <p className="mb-1.5 text-center text-[11px] text-[var(--color-text-tertiary)]">
                {t("app.study.thinkThenFlip")}
              </p>
            )}
            <button type="button" onClick={handleFlip}
              className="card-surface glow-hover scanline group w-full cursor-pointer px-6 py-12 text-left transition-all sm:px-12 sm:py-16 lg:px-16 lg:py-20"
              style={{ height: "clamp(22rem, 62dvh, 44rem)", boxShadow: flipped ? "0 0 30px var(--color-accent-glow)" : undefined }}>
              <div className="flex h-full min-h-0 flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] sm:text-sm">{flipped ? t("app.study.back") : t("app.study.front")}</span>
                  {flipped && hasTutorSummary && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLatestSummary();
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/45 bg-[var(--color-accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-accent)] transition hover:border-[var(--color-accent)]/75 sm:text-xs"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      {t("app.study.summaryReady")}
                    </button>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="prose prose-lg max-w-none sm:prose-xl lg:prose-2xl">
                    <MarkdownRenderer content={flipped ? currentCard.back : currentCard.front} />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-secondary)] sm:text-sm">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12h18" />
                    <path d="M16 6l6 6-6 6" />
                    <path d="M8 18l-6-6 6-6" />
                  </svg>
                  <span>{flipped ? t("app.study.tapToFlipBack") : t("app.study.tapToFlip")}</span>
                </div>
              </div>
            </button>

            {flipped && (
              <div className="mt-5 space-y-3">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{t("app.study.howWellKnown")}</p>
                {suggestedVoiceQuality !== null && (
                  <p className="text-center text-xs text-[var(--color-text-secondary)]">
                    {t("app.study.voice.suggestedPrefix")}:{" "}
                    <span className="font-semibold text-[var(--color-text)]">
                      {ratingByQuality.get(suggestedVoiceQuality)?.label}
                    </span>
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ratings.map((r) => (
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

            <div className="mt-3 rounded-xl border border-[var(--color-accent)]/45 bg-gradient-to-r from-[var(--color-accent-soft)] via-[var(--color-accent-soft)] to-transparent p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
                    {t("app.study.tutor.badge")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text)] sm:text-base">
                    {hasTutorHistory
                      ? t("app.study.tutor.continueChat", { count: tutorSessionCount })
                      : t("app.study.tutor.introCta")}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] sm:text-sm">
                    {t("app.study.tutor.helper")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTutorPanel(true)}
                  className="btn-primary !px-4 !py-2 !text-xs sm:!text-sm"
                >
                  {hasTutorHistory ? t("app.study.tutor.openChat") : t("app.study.tutor.startChat")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showTutorPanel && currentCard && (
        <>
          <button
            type="button"
            aria-label={t("app.study.tutor.closePanelAria")}
            onClick={() => void closeTutorPanel()}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[46rem] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <div>
                <p className="text-sm font-bold">{t("app.study.tutor.panelTitle")}</p>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-secondary)]">
                  {currentCard.front.split("\n")[0].replace(/^#+\s*/, "")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void closeTutorPanel()}
                className="btn-secondary !px-2.5 !py-1 text-xs"
              >
                {t("app.study.tutor.close")}
              </button>
            </div>

            {hasTutorHistory && (
              <div className="border-b border-[var(--color-border)] px-4 py-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    {t("app.study.tutor.historyTitle")}
                  </p>
                  <button
                    type="button"
                    onClick={() => void startFreshTutorChat()}
                    disabled={tutorBusy || summaryBusy}
                    className="btn-secondary !px-2.5 !py-1 !text-xs disabled:opacity-50"
                  >
                    {t("app.study.tutor.new")}
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {tutorChats?.map((chat) => {
                    const active = String(chat._id) === String(selectedTutorChatId);
                    return (
                      <button
                        key={String(chat._id)}
                        type="button"
                        onClick={() => setSelectedTutorChatId(String(chat._id))}
                        className={`min-w-36 rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                          active
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface-alt)] hover:border-[var(--color-border-strong)]"
                        }`}
                      >
                        <p className="line-clamp-1 font-semibold text-[var(--color-text)]">
                          {chat.title || t("app.study.tutor.untitledChat")}
                        </p>
                        <p className="mt-1 line-clamp-1 text-[var(--color-text-secondary)]">
                          {chat.lastMessagePreview || t("app.study.tutor.noMessagesYet")}
                        </p>
                        <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                          {formatDateTime(chat.updatedAt, locale)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div ref={tutorScrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {!hasTutorHistory && (
                <div className="card-surface p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    {t("app.study.tutor.currentCard")}
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                        {t("app.study.front")}
                      </p>
                      <div className="prose prose-sm max-w-none">
                        <MarkdownRenderer content={currentCard.front} />
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                        {t("app.study.back")}
                      </p>
                      <div className="prose prose-sm max-w-none">
                        <MarkdownRenderer content={currentCard.back} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedTutorChatId && tutorChatDetail && tutorChatDetail.messages.length === 0 && (
                <div className="card-surface p-4">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {t("app.study.tutor.emptyStatePrompt")}
                  </p>
                </div>
              )}

              {tutorChatDetail?.messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`rounded-xl border px-3 py-2 ${
                    msg.role === "user"
                      ? "ml-8 border-[var(--color-border-strong)] bg-[var(--color-surface-alt)]"
                      : "mr-8 border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    {msg.role === "user" ? t("app.study.tutor.you") : t("app.study.tutor.tutorName")}
                  </p>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{msg.content}</p>
                  )}
                </div>
              ))}

              {pendingUserMessage && (
                <div className="ml-8 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-3 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    {t("app.study.tutor.you")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{pendingUserMessage}</p>
                </div>
              )}

              {assistantTyping && (
                <div className="mr-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    {t("app.study.tutor.tutorName")}
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {t("app.study.tutor.thinking")}
                  </p>
                </div>
              )}

              {selectedTutorChatMeta?.summary && (
                <div className="card-surface border-[var(--color-accent)]/40 p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]">
                    {t("app.study.tutor.studySummary")}
                  </p>
                  <div className="prose prose-sm max-w-none">
                    <MarkdownRenderer content={selectedTutorChatMeta.summary} />
                  </div>
                </div>
              )}

              {tutorError && (
                <p className="text-sm text-[var(--color-danger)]">{tutorError}</p>
              )}
            </div>

            <div className="border-t border-[var(--color-border)] px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void sendTutorMessage(tutorStarterPrompt)}
                  disabled={tutorBusy || summaryBusy}
                  className="btn-secondary !px-3 !py-1.5 !text-xs disabled:opacity-50"
                >
                  {t("app.study.tutor.starterButton")}
                </button>
                {hasTutorHistory && (
                  <button
                    type="button"
                    onClick={() => void startFreshTutorChat()}
                    disabled={tutorBusy || summaryBusy}
                    className="btn-secondary !px-3 !py-1.5 !text-xs disabled:opacity-50"
                  >
                    {t("app.study.tutor.newChat")}
                  </button>
                )}
              </div>
              <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                {t("app.study.tutor.voiceHint")}
              </p>
              <textarea
                value={tutorInput}
                onChange={(e) => setTutorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (e.shiftKey) return;
                  if (e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (tutorBusy || summaryBusy || !tutorInput.trim()) return;
                  void sendTutorMessage();
                }}
                rows={3}
                placeholder={t("app.study.tutor.textareaPlaceholder")}
                disabled={tutorBusy || summaryBusy}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void finishTutorChat()}
                  disabled={
                    summaryBusy ||
                    tutorBusy ||
                    !selectedTutorChatId ||
                    (tutorChatDetail?.messages.length ?? 0) < 2
                  }
                  className="btn-secondary !px-3 !py-1.5 !text-xs disabled:opacity-50"
                >
                  {summaryBusy
                    ? t("app.study.tutor.summarizing")
                    : t("app.study.tutor.finishAndSummarize")}
                </button>
                <button
                  type="button"
                  onClick={toggleTutorDictation}
                  disabled={tutorBusy || summaryBusy || !tutorDictationSupported}
                  className={`btn-secondary !px-3 !py-1.5 !text-xs disabled:opacity-50 ${tutorDictating ? "!border-[var(--color-accent)] !text-[var(--color-accent)]" : ""}`}
                >
                  {tutorDictating
                    ? t("app.study.tutor.voiceStop")
                    : t("app.study.tutor.voiceStart")}
                </button>
                <button
                  type="button"
                  onClick={() => void sendTutorMessage()}
                  disabled={tutorBusy || summaryBusy || !tutorInput.trim()}
                  className="btn-primary !px-3 !py-1.5 !text-xs disabled:opacity-50"
                >
                  {tutorBusy ? t("app.study.tutor.sending") : t("app.study.tutor.send")}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
