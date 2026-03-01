"use client";

import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  findDeckByVoiceText,
  getSpeechLang,
  markdownToPlainText,
  parseVoiceCommand,
  shortSpeechText,
} from "@/lib/voice";
import type { VoiceCommand } from "@/lib/voice";

const api = anyApi;

type Quality = 0 | 1 | 2 | 3;
type Channel = "study" | "tutor";

type Deck = { _id: string; name: string };
type Card = { _id: string; front: string; back: string };

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type UseStudyVoiceOptions = {
  locale: string;
  t: TranslateFn;
  deckId?: string;
  decks?: Deck[];
  currentCard: Card | null;
  selectedTutorChatId: string | null;
  showTutorPanel: boolean;
  setShowTutorPanel: (next: boolean) => void;
  flipped: boolean;
  setFlipped: React.Dispatch<React.SetStateAction<boolean>>;
  isLinearMode: boolean;
  linearCardsLength: number;
  setLinearIndex: React.Dispatch<React.SetStateAction<number>>;
  navigate: (href: string) => void;
  applyRating: (quality: number) => Promise<void>;
  sendTutorMessage: (presetMessage?: string) => Promise<string | null>;
  ratingLabelByQuality: (quality: Quality) => string;
  usePremiumTts: boolean;
};

type UseStudyVoiceResult = {
  voiceMode: boolean;
  voiceSupported: boolean;
  voiceListening: boolean;
  voiceStatus: string | null;
  suggestedVoiceQuality: Quality | null;
  toggleVoiceMode: () => void;
  interruptVoiceTurn: (reason?: string) => void;
};

type VoiceIntentResponse = {
  intent: "command" | "answer" | "tutor" | "deck_select" | "unknown";
  command?:
    | "flip"
    | "showFront"
    | "showBack"
    | "nextCard"
    | "previousCard"
    | "repeat"
    | "applySuggested"
    | "openTutor"
    | "closeTutor"
    | "stopVoiceMode"
    | "rate";
  rateQuality?: 0 | 1 | 2 | 3;
  prompt?: string;
  deckQuery?: string;
  confidence?: number;
};

const AUTO_RATE_CONFIDENCE_THRESHOLD = 0.72;

function clampConfidence(value: unknown, fallback = 0.55) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

export function useStudyVoice(options: UseStudyVoiceOptions): UseStudyVoiceResult {
  const {
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
    linearCardsLength,
    setLinearIndex,
    navigate,
    applyRating,
    sendTutorMessage,
    ratingLabelByQuality,
    usePremiumTts,
  } = options;

  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ cardId: string; quality: Quality } | null>(null);

  const suggestedVoiceQuality =
    suggestion && currentCard && suggestion.cardId === currentCard._id ? suggestion.quality : null;

  const speechLang = useMemo(() => getSpeechLang(locale), [locale]);
  const isLikelyIOS = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const classicIOS = /iPad|iPhone|iPod/i.test(ua);
    const iPadDesktopUA =
      ua.includes("Macintosh") &&
      typeof document !== "undefined" &&
      "ontouchend" in document;
    return classicIOS || iPadDesktopUA;
  }, []);

  const startVoiceSession = useMutation(api.voice.startSession);
  const appendVoiceEvent = useMutation(api.voice.appendEvent);
  const endVoiceSession = useMutation(api.voice.endSession);
  const updateVoiceSessionContext = useMutation(api.voice.updateSessionContext);

  const voiceRecognitionRef = useRef<any>(null);
  const voiceManualStopRef = useRef(false);
  const voiceIsSpeakingRef = useRef(false);
  const voiceListeningRef = useRef(false);
  const voiceSessionIdRef = useRef<string | null>(null);
  const voiceRestartTimerRef = useRef<number | null>(null);
  const voiceRestartDelayRef = useRef(280);
  const voiceLastTranscriptRef = useRef("");
  const voiceLastTranscriptAtRef = useRef(0);
  const activeTurnIdRef = useRef(0);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const runtimeRef = useRef({
    locale,
    t,
    deckId,
    decks,
    currentCard,
    selectedTutorChatId,
    showTutorPanel,
    flipped,
    isLinearMode,
    linearCardsLength,
    suggestedVoiceQuality,
    setShowTutorPanel,
    setFlipped,
    setLinearIndex,
    navigate,
    applyRating,
    sendTutorMessage,
    ratingLabelByQuality,
    usePremiumTts,
  });
  runtimeRef.current = {
    locale,
    t,
    deckId,
    decks,
    currentCard,
    selectedTutorChatId,
    showTutorPanel,
    flipped,
    isLinearMode,
    linearCardsLength,
    suggestedVoiceQuality,
    setShowTutorPanel,
    setFlipped,
    setLinearIndex,
    navigate,
    applyRating,
    sendTutorMessage,
    ratingLabelByQuality,
    usePremiumTts,
  };

  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
  }, []);

  const beginVoiceTurn = useCallback(() => {
    activeTurnIdRef.current += 1;
    return activeTurnIdRef.current;
  }, []);

  const isVoiceTurnActive = useCallback((turnId: number) => {
    return activeTurnIdRef.current === turnId;
  }, []);

  const interruptVoiceTurn = useCallback(
    (_reason?: string) => {
      void _reason;
      activeTurnIdRef.current += 1;
      clearSuggestion();
      if (voiceAudioRef.current) {
        try {
          voiceAudioRef.current.pause();
        } catch {
          // no-op
        }
        voiceAudioRef.current.src = "";
        voiceAudioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (voiceMode) {
        setVoiceStatus(t("app.study.voice.listening"));
      }
    },
    [clearSuggestion, t, voiceMode],
  );

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((prev) => {
      const next = !prev;
      setVoiceStatus(next ? t("app.study.voice.listening") : null);
      return next;
    });
  }, [t]);

  const logVoiceEvent = useCallback(
    (
      source: "user" | "assistant" | "system",
      type: "transcript" | "command" | "spoken" | "evaluation" | "error",
      text: string,
      channel: Channel,
      metadata?: Record<string, unknown>,
    ) => {
      const sessionId = voiceSessionIdRef.current;
      if (!sessionId) return;
      void appendVoiceEvent({
        sessionId: sessionId as any,
        source,
        channel,
        type,
        text,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      });
    },
    [appendVoiceEvent],
  );

  const classifyVoiceIntent = useCallback(async (transcript: string) => {
    const ctx = runtimeRef.current;
    try {
      const response = await fetch("/api/ai/voice-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: ctx.locale,
          transcript,
          context: {
            hasDeck: Boolean(ctx.deckId),
            hasCard: Boolean(ctx.currentCard),
            tutorOpen: ctx.showTutorPanel,
            cardFlipped: ctx.flipped,
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as VoiceIntentResponse & {
        error?: string;
      };
      if (!response.ok || !payload.intent) {
        throw new Error(payload.error ?? "voice_intent_failed");
      }
      return payload;
    } catch (err) {
      console.error("Voice intent classification failed", err);
      return null;
    }
  }, []);

  const mapLLMCommand = useCallback((intent: VoiceIntentResponse | null): VoiceCommand | null => {
    if (!intent || intent.intent !== "command" || !intent.command) return null;
    switch (intent.command) {
      case "flip":
        return { kind: "flip" };
      case "showFront":
        return { kind: "showFront" };
      case "showBack":
        return { kind: "showBack" };
      case "nextCard":
        return { kind: "nextCard" };
      case "previousCard":
        return { kind: "previousCard" };
      case "repeat":
        return { kind: "repeat" };
      case "applySuggested":
        return { kind: "applySuggested" };
      case "openTutor":
        return intent.prompt?.trim()
          ? { kind: "openTutor", prompt: intent.prompt.trim() }
          : { kind: "openTutor" };
      case "closeTutor":
        return { kind: "closeTutor" };
      case "stopVoiceMode":
        return { kind: "stopVoiceMode" };
      case "rate":
        return {
          kind: "rate",
          quality:
            typeof intent.rateQuality === "number"
              ? (intent.rateQuality as 0 | 1 | 2 | 3)
              : 2,
        };
      default:
        return null;
    }
  }, []);

  const speakWithPremiumTts = useCallback(
    async (text: string, localeValue: string) => {
      if (typeof window === "undefined") return false;
      try {
        const response = await fetch("/api/ai/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, locale: localeValue }),
        });
        if (!response.ok) return false;
        const audioBlob = await response.blob();
        if (!audioBlob || audioBlob.size === 0) return false;
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        voiceAudioRef.current = audio;
        await new Promise<void>((resolve) => {
          const cleanup = () => {
            audio.onended = null;
            audio.onerror = null;
            URL.revokeObjectURL(audioUrl);
            if (voiceAudioRef.current === audio) {
              voiceAudioRef.current = null;
            }
            resolve();
          };
          audio.onended = cleanup;
          audio.onerror = cleanup;
          void audio.play().catch(() => cleanup());
        });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const speakText = useCallback(
    async (text: string, channel: Channel, short = false) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const spoken = short ? shortSpeechText(text) : markdownToPlainText(text);
      if (!spoken) return;

      const recognition = voiceRecognitionRef.current;
      const shouldRestartRecognition =
        voiceMode &&
        voiceListeningRef.current &&
        recognition &&
        !voiceManualStopRef.current;
      if (shouldRestartRecognition) {
        try {
          recognition.stop();
        } catch {
          // no-op
        }
      }

      voiceIsSpeakingRef.current = true;
      const shouldUsePremium = runtimeRef.current.usePremiumTts;
      const premiumSpoken = shouldUsePremium
        ? await speakWithPremiumTts(spoken, runtimeRef.current.locale)
        : false;
      if (!premiumSpoken) {
        await new Promise<void>((resolve) => {
          if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
          }
          const utterance = new SpeechSynthesisUtterance(spoken);
          const voices = window.speechSynthesis.getVoices();
          const preferredVoice =
            voices.find((voice) =>
              voice.lang.toLowerCase().startsWith(speechLang.toLowerCase()),
            ) ??
            voices.find((voice) =>
              voice.lang.toLowerCase().startsWith(speechLang.slice(0, 2).toLowerCase()),
            );
          utterance.lang = speechLang;
          if (preferredVoice) utterance.voice = preferredVoice;
          utterance.rate = 1;
          utterance.pitch = 1;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.speak(utterance);
        });
      }
      voiceIsSpeakingRef.current = false;
      logVoiceEvent("assistant", "spoken", spoken, channel);

      if (
        shouldRestartRecognition &&
        voiceMode &&
        voiceRecognitionRef.current &&
        !voiceManualStopRef.current
      ) {
        try {
          voiceRestartDelayRef.current = isLikelyIOS ? 420 : 240;
          voiceRecognitionRef.current.start();
        } catch {
          // no-op
        }
      }
    },
    [isLikelyIOS, logVoiceEvent, speakWithPremiumTts, speechLang, voiceMode],
  );

  const evaluateSpokenAnswer = useCallback(
    async (answer: string, turnId: number) => {
      const ctx = runtimeRef.current;
      const card = ctx.currentCard;
      if (!card) return;

      setVoiceStatus(ctx.t("app.study.voice.evaluating"));

      let suggested: Quality = 2;
      let feedback = "";
      let confidence = 0.55;
      try {
        const response = await fetch("/api/ai/card-answer-eval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale: ctx.locale,
            card: {
              front: card.front,
              back: card.back,
            },
            userAnswer: answer,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          quality?: number;
          feedback?: string;
        };
        if (typeof payload.quality === "number") {
          suggested = Math.max(0, Math.min(3, Math.round(payload.quality))) as Quality;
        }
        feedback = payload.feedback?.trim() ?? "";
        confidence = clampConfidence((payload as { confidence?: unknown }).confidence, 0.55);
      } catch (err) {
        console.error("Voice answer evaluation failed", err);
      }

      if (!isVoiceTurnActive(turnId)) return;
      setSuggestion({ cardId: card._id, quality: suggested });
      ctx.setFlipped(true);
      const ratingLabel = ctx.ratingLabelByQuality(suggested);
      const suggestionText = `${ctx.t("app.study.voice.suggestedPrefix")}: ${ratingLabel}. ${feedback}`.trim();
      logVoiceEvent("system", "evaluation", suggestionText, "study", {
        suggestedQuality: suggested,
        answer,
      });
      await speakText(suggestionText, "study", true);
      if (!isVoiceTurnActive(turnId)) return;
      if (confidence >= AUTO_RATE_CONFIDENCE_THRESHOLD) {
        await speakText(
          ctx.t("app.study.voice.autoRated", { label: ratingLabel }),
          "study",
          true,
        );
        if (!isVoiceTurnActive(turnId)) return;
        await ctx.applyRating(suggested);
        if (!isVoiceTurnActive(turnId)) return;
        clearSuggestion();
        setVoiceStatus(ctx.t("app.study.voice.listening"));
        return;
      }
      await speakText(card.back, "study");
      if (!isVoiceTurnActive(turnId)) return;
      await speakText(ctx.t("app.study.voice.sayRatingPrompt"), "study", true);
      if (!isVoiceTurnActive(turnId)) return;
      setVoiceStatus(ctx.t("app.study.voice.listening"));
    },
    [clearSuggestion, isVoiceTurnActive, logVoiceEvent, speakText],
  );

  const handleVoiceTranscript = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      const turnId = beginVoiceTurn();

      const ctx = runtimeRef.current;
      const channel: Channel = ctx.showTutorPanel ? "tutor" : "study";

      logVoiceEvent("user", "transcript", text, channel, {
        cardId: ctx.currentCard?._id ?? null,
        deckId: ctx.deckId ?? null,
      });

      const intent = await classifyVoiceIntent(text);
      if (!isVoiceTurnActive(turnId)) return;

      const command = mapLLMCommand(intent) ?? parseVoiceCommand(text);
      if (command) {
        logVoiceEvent("system", "command", command.kind, channel, command as any);

        if (command.kind === "stopVoiceMode") {
          setVoiceMode(false);
          return;
        }
        if (command.kind === "openTutor") {
          ctx.setShowTutorPanel(true);
          setVoiceStatus(ctx.t("app.study.voice.switchedToTutor"));
          await speakText(ctx.t("app.study.voice.switchedToTutor"), "tutor", true);
          if (!isVoiceTurnActive(turnId)) return;
          if (command.prompt) {
            const reply = await ctx.sendTutorMessage(command.prompt);
            if (!isVoiceTurnActive(turnId)) return;
            if (reply) await speakText(reply, "tutor", true);
          }
          return;
        }
        if (command.kind === "closeTutor") {
          ctx.setShowTutorPanel(false);
          setVoiceStatus(ctx.t("app.study.voice.switchedToStudy"));
          await speakText(ctx.t("app.study.voice.switchedToStudy"), "study", true);
          return;
        }

        const card = ctx.currentCard;
        if (!card) {
          await speakText(ctx.t("app.study.voice.noCard"), "study", true);
          return;
        }

        if (command.kind === "showFront") {
          ctx.setFlipped(false);
          clearSuggestion();
          await speakText(card.front, "study");
          return;
        }
        if (command.kind === "showBack") {
          ctx.setFlipped(true);
          await speakText(card.back, "study");
          return;
        }
        if (command.kind === "flip") {
          const nextFlipped = !ctx.flipped;
          ctx.setFlipped(nextFlipped);
          await speakText(nextFlipped ? card.back : card.front, "study");
          return;
        }
        if (command.kind === "repeat") {
          await speakText(ctx.flipped ? card.back : card.front, channel);
          return;
        }
        if (command.kind === "nextCard") {
          clearSuggestion();
          if (ctx.isLinearMode) {
            ctx.setLinearIndex((idx) =>
              Math.min(idx + 1, Math.max(0, ctx.linearCardsLength - 1)),
            );
            ctx.setFlipped(false);
          } else if (ctx.flipped) {
            await ctx.applyRating(2);
          } else {
            ctx.setFlipped(true);
          }
          return;
        }
        if (command.kind === "previousCard") {
          clearSuggestion();
          if (ctx.isLinearMode) {
            ctx.setLinearIndex((idx) => Math.max(0, idx - 1));
            ctx.setFlipped(false);
          }
          return;
        }
        if (command.kind === "applySuggested") {
          if (ctx.suggestedVoiceQuality !== null) {
            await ctx.applyRating(ctx.suggestedVoiceQuality);
            clearSuggestion();
          }
          return;
        }
        if (command.kind === "rate") {
          clearSuggestion();
          if (!ctx.flipped) {
            ctx.setFlipped(true);
          }
          await ctx.applyRating(command.quality);
          return;
        }
      }

      if (!ctx.deckId) {
        if (!ctx.decks || ctx.decks.length === 0) {
          await speakText(ctx.t("app.study.voice.chooseDeck"), "study", true);
          return;
        }
        const deckQuery = intent?.deckQuery?.trim() || text;
        const found = findDeckByVoiceText(deckQuery, ctx.decks);
        if (found) {
          ctx.navigate(`/study?deck=${found._id}`);
          return;
        }
        await speakText(ctx.t("app.study.voice.deckNotFound"), "study", true);
        return;
      }

      if (ctx.showTutorPanel) {
        const reply = await ctx.sendTutorMessage(text);
        if (!isVoiceTurnActive(turnId)) return;
        if (reply) await speakText(reply, "tutor", true);
        return;
      }

      if (!ctx.currentCard) {
        await speakText(ctx.t("app.study.voice.noCard"), "study", true);
        return;
      }

      if (!ctx.flipped) {
        await evaluateSpokenAnswer(text, turnId);
        return;
      }

      await speakText(ctx.t("app.study.voice.sayRatingPrompt"), "study", true);
    },
    [
      beginVoiceTurn,
      classifyVoiceIntent,
      clearSuggestion,
      evaluateSpokenAnswer,
      isVoiceTurnActive,
      logVoiceEvent,
      mapLLMCommand,
      speakText,
    ],
  );

  useEffect(() => {
    interruptVoiceTurn("card_or_deck_changed");
  }, [currentCard?._id, deckId, interruptVoiceTurn]);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      Boolean(
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition,
      );
    setVoiceSupported(supported);
    if (!supported) {
      setVoiceMode(false);
      setVoiceStatus(t("app.study.voice.unsupported"));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const ctx = runtimeRef.current;
      const sessionId = voiceSessionIdRef.current;

      if (!voiceMode || !voiceSupported) {
        if (sessionId) {
          try {
            await endVoiceSession({ sessionId: sessionId as any });
          } catch (err) {
            console.error("Failed to end voice session", err);
          }
          voiceSessionIdRef.current = null;
        }
        return;
      }

      const payload = {
        deckId: ctx.deckId ? (ctx.deckId as any) : undefined,
        cardId: ctx.currentCard ? (ctx.currentCard._id as any) : undefined,
        cardChatId: ctx.selectedTutorChatId
          ? (ctx.selectedTutorChatId as any)
          : undefined,
        channel: ctx.showTutorPanel ? "tutor" : "study",
        locale: ctx.locale,
      } as const;

      if (!sessionId) {
        try {
          const started = (await startVoiceSession(payload)) as { id: string };
          if (cancelled) return;
          voiceSessionIdRef.current = String(started.id);
          logVoiceEvent(
            "system",
            "command",
            "voice_mode_on",
            payload.channel,
          );
        } catch (err) {
          console.error("Failed to start voice session", err);
        }
        return;
      }

      try {
        await updateVoiceSessionContext({
          sessionId: sessionId as any,
          deckId: payload.deckId,
          cardId: payload.cardId,
          cardChatId: payload.cardChatId,
          channel: payload.channel,
        });
      } catch (err) {
        console.error("Failed to update voice session context", err);
      }
    };

    void syncSession();
    return () => {
      cancelled = true;
    };
  }, [
    currentCard?._id,
    deckId,
    endVoiceSession,
    locale,
    logVoiceEvent,
    selectedTutorChatId,
    showTutorPanel,
    startVoiceSession,
    updateVoiceSessionContext,
    voiceMode,
    voiceSupported,
  ]);

  useEffect(() => {
    return () => {
      const sessionId = voiceSessionIdRef.current;
      if (!sessionId) return;
      void endVoiceSession({ sessionId: sessionId as any }).catch((err: unknown) => {
        console.error("Failed to end voice session on unmount", err);
      });
    };
  }, [endVoiceSession]);

  useEffect(() => {
    const clearRestartTimer = () => {
      if (voiceRestartTimerRef.current !== null) {
        window.clearTimeout(voiceRestartTimerRef.current);
        voiceRestartTimerRef.current = null;
      }
    };

    if (!voiceMode) {
      voiceManualStopRef.current = true;
      clearRestartTimer();
      if (voiceAudioRef.current) {
        try {
          voiceAudioRef.current.pause();
        } catch {
          // no-op
        }
        voiceAudioRef.current.src = "";
        voiceAudioRef.current = null;
      }
      if (voiceRecognitionRef.current) {
        try {
          voiceRecognitionRef.current.stop();
        } catch {
          // no-op
        }
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      voiceListeningRef.current = false;
      setVoiceListening(false);
      setVoiceStatus(null);
      return;
    }

    if (!voiceSupported || typeof window === "undefined") {
      setVoiceStatus(t("app.study.voice.unsupported"));
      return;
    }

    const Recognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus(t("app.study.voice.unsupported"));
      return;
    }

    const recognition = new Recognition();
    recognition.lang = speechLang;
    recognition.continuous = !isLikelyIOS;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    voiceRecognitionRef.current = recognition;
    voiceManualStopRef.current = false;
    voiceRestartDelayRef.current = isLikelyIOS ? 420 : 240;

    const isDocumentHidden = () =>
      typeof document !== "undefined" && document.hidden;

    const scheduleRestart = (bumpDelay: boolean) => {
      if (
        !voiceMode ||
        voiceManualStopRef.current ||
        voiceIsSpeakingRef.current ||
        isDocumentHidden()
      ) {
        return;
      }
      clearRestartTimer();
      if (bumpDelay) {
        voiceRestartDelayRef.current = Math.min(
          Math.round(voiceRestartDelayRef.current * 1.6),
          2200,
        );
      } else {
        const floor = isLikelyIOS ? 420 : 240;
        voiceRestartDelayRef.current = Math.max(
          floor,
          Math.round(voiceRestartDelayRef.current * 0.92),
        );
      }
      setVoiceStatus(t("app.study.voice.reconnecting"));
      voiceRestartTimerRef.current = window.setTimeout(() => {
        if (
          !voiceMode ||
          voiceManualStopRef.current ||
          voiceIsSpeakingRef.current ||
          isDocumentHidden()
        ) {
          return;
        }
        try {
          recognition.start();
        } catch {
          scheduleRestart(true);
        }
      }, voiceRestartDelayRef.current);
    };

    recognition.onstart = () => {
      clearRestartTimer();
      voiceListeningRef.current = true;
      setVoiceListening(true);
      voiceRestartDelayRef.current = isLikelyIOS ? 420 : 240;
      setVoiceStatus(t("app.study.voice.listening"));
    };

    recognition.onerror = (event: any) => {
      const code = String(event?.error ?? "voice_error");
      if (code === "aborted" && (voiceManualStopRef.current || voiceIsSpeakingRef.current)) {
        return;
      }
      if (code === "no-speech") {
        setVoiceStatus(t("app.study.voice.listening"));
        return;
      }
      if (code === "not-allowed" || code === "service-not-allowed") {
        setVoiceStatus(t("app.study.voice.micDenied"));
        voiceManualStopRef.current = true;
        setVoiceMode(false);
        logVoiceEvent(
          "system",
          "error",
          code,
          runtimeRef.current.showTutorPanel ? "tutor" : "study",
        );
        return;
      }
      if (code === "audio-capture") {
        setVoiceStatus(t("app.study.voice.micUnavailable"));
        voiceManualStopRef.current = true;
        setVoiceMode(false);
        logVoiceEvent(
          "system",
          "error",
          code,
          runtimeRef.current.showTutorPanel ? "tutor" : "study",
        );
        return;
      }
      if (code === "network") {
        setVoiceStatus(t("app.study.voice.networkIssue"));
      } else {
        setVoiceStatus(code);
      }
      logVoiceEvent(
        "system",
        "error",
        code,
        runtimeRef.current.showTutorPanel ? "tutor" : "study",
      );
    };

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const transcript = result[0]?.transcript?.trim();
        const confidence =
          typeof result[0]?.confidence === "number"
            ? Number(result[0].confidence)
            : 1;
        if (!transcript) continue;

        const normalized = transcript.toLowerCase();
        const now = Date.now();
        const duplicate =
          normalized === voiceLastTranscriptRef.current &&
          now - voiceLastTranscriptAtRef.current < 1200;
        if (duplicate) continue;

        const likelyCommand = parseVoiceCommand(transcript);
        const looksLikeNoise =
          transcript.length <= 2 ||
          (confidence > 0 &&
            confidence < 0.42 &&
            !likelyCommand &&
            transcript.length < 18);
        if (looksLikeNoise) {
          logVoiceEvent(
            "system",
            "error",
            "ignored_noisy_transcript",
            runtimeRef.current.showTutorPanel ? "tutor" : "study",
            { transcript, confidence },
          );
          continue;
        }

        voiceLastTranscriptRef.current = normalized;
        voiceLastTranscriptAtRef.current = now;
        void handleVoiceTranscript(transcript);
      }
    };

    recognition.onend = () => {
      voiceListeningRef.current = false;
      setVoiceListening(false);
      if (!voiceMode || voiceManualStopRef.current || voiceIsSpeakingRef.current) return;
      scheduleRestart(false);
    };

    const handleVisibilityChange = () => {
      if (!voiceMode || voiceManualStopRef.current) return;
      if (isDocumentHidden()) {
        clearRestartTimer();
        try {
          recognition.stop();
        } catch {
          // no-op
        }
        return;
      }
      scheduleRestart(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    try {
      recognition.start();
    } catch (err) {
      console.error("Failed to start speech recognition", err);
      const message = err instanceof Error ? err.message.toLowerCase() : "";
      if (message.includes("not-allowed") || message.includes("denied")) {
        setVoiceStatus(t("app.study.voice.micDenied"));
      } else {
        setVoiceStatus(t("app.study.voice.unsupported"));
      }
    }

    return () => {
      clearRestartTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      activeTurnIdRef.current += 1;
      voiceManualStopRef.current = true;
      voiceListeningRef.current = false;
      if (voiceAudioRef.current) {
        try {
          voiceAudioRef.current.pause();
        } catch {
          // no-op
        }
        voiceAudioRef.current.src = "";
        voiceAudioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      try {
        recognition.stop();
      } catch {
        // no-op
      }
      voiceRecognitionRef.current = null;
    };
  }, [
    handleVoiceTranscript,
    isLikelyIOS,
    logVoiceEvent,
    speechLang,
    t,
    voiceMode,
    voiceSupported,
  ]);

  return {
    voiceMode,
    voiceSupported,
    voiceListening,
    voiceStatus,
    suggestedVoiceQuality,
    toggleVoiceMode,
    interruptVoiceTurn,
  };
}
