"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppLink, useAppRouter } from "@/lib/app-router";
import { useI18n } from "@/i18n/client";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const api = anyApi;

type Deck = { _id: string; name: string };
type DueCard = { _id: string; front: string; back: string };
type Card = { _id: string; deckId?: string; front: string; back: string; tags: string[] };
type StudyMode = "smart" | "linear";

export default function StudyView() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const { searchParams, navigate } = useAppRouter();
  const deckId = searchParams.get("deck") || undefined;
  const sourceChatId = searchParams.get("chat") || undefined;
  const modeParam = searchParams.get("mode");
  const mode: StudyMode = modeParam === "linear" || (!modeParam && !!sourceChatId)
    ? "linear"
    : "smart";
  const isLinearMode = mode === "linear";
  const shouldLaunchIntro = searchParams.get("launch") === "1";
  const ratings = [
    { label: zh ? "重来" : "Again", quality: 0, color: "#ef4444", border: "rgba(239,68,68,0.45)", desc: zh ? "忘记了" : "Forgot it" },
    { label: zh ? "困难" : "Hard", quality: 1, color: "#f59e0b", border: "rgba(245,158,11,0.45)", desc: zh ? "有点吃力" : "Struggled" },
    { label: zh ? "良好" : "Good", quality: 2, color: "#10b981", border: "rgba(16,185,129,0.45)", desc: zh ? "答对了" : "Got it" },
    { label: zh ? "简单" : "Easy", quality: 3, color: "#8b5cf6", border: "rgba(139,92,246,0.45)", desc: zh ? "秒答" : "Instant" },
  ] as const;

  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const [studyAll, setStudyAll] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [linearIndex, setLinearIndex] = useState(0);
  const [showQuickView, setShowQuickView] = useState(false);
  const [showAllView, setShowAllView] = useState(false);
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [quickEditBusy, setQuickEditBusy] = useState(false);
  const [quickEditError, setQuickEditError] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [showLaunchOverlay, setShowLaunchOverlay] = useState(shouldLaunchIntro);
  const [launchLeaving, setLaunchLeaving] = useState(false);
  const launchStartedAtRef = useRef<number>(0);

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
  ) as { due: DueCard[]; total: number; reviewed: number } | undefined;
  const activeData = isLinearMode ? linearData : dueData;
  const allCards = useQuery(
    api.flashcards.list,
    deckId ? { deckId } : "skip",
  ) as Card[] | undefined;

  useEffect(() => {
    setLinearIndex(0);
    setSessionDone(0);
    setFlipped(false);
  }, [deckId, mode, sourceChatId]);

  useEffect(() => {
    if (!shouldLaunchIntro) return;
    launchStartedAtRef.current = Date.now();
    setShowLaunchOverlay(true);
    setLaunchLeaving(false);
  }, [shouldLaunchIntro]);

  useEffect(() => {
    if (!shouldLaunchIntro || !showLaunchOverlay || !activeData) return;
    const elapsed = Date.now() - launchStartedAtRef.current;
    const minVisibleMs = 620;
    const waitMs = Math.max(0, minVisibleMs - elapsed);
    const fadeTimer = window.setTimeout(() => setLaunchLeaving(true), waitMs);
    const hideTimer = window.setTimeout(
      () => setShowLaunchOverlay(false),
      waitMs + 260,
    );
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [shouldLaunchIntro, showLaunchOverlay, activeData]);

  const statsAllDecks = useQuery(api.study.getSessionStats, {}) as
    | { total: number; newCount: number; dueCount: number; reviewedToday: number }
    | undefined;
  const recordReview = useMutation(api.study.recordReview);
  const updateCard = useMutation(api.flashcards.update);

  const linearCards = linearData?.due ?? [];
  const allCardsList = allCards ?? [];
  const currentCard = isLinearMode
    ? linearCards[linearIndex] ?? null
    : dueData?.due[0] ?? null;
  const currentFullCard = currentCard
    ? allCardsList.find((card) => card._id === currentCard._id) ?? null
    : null;
  const quickQueue =
    (isLinearMode
      ? linearCards.slice(linearIndex, linearIndex + 8)
      : (dueData?.due ?? []).slice(0, 8)) ?? [];
  const remaining = isLinearMode
    ? Math.max(0, linearCards.length - linearIndex)
    : dueData
      ? dueData.due.length
      : 0;
  const deckName = deckId
    ? decks?.find((d) => d._id === deckId)?.name ?? (zh ? "牌组" : "Deck")
    : (zh ? "全部卡片" : "All cards");

  const progressPct = activeData?.total
    ? isLinearMode
      ? (Math.min(linearIndex, activeData.total) / activeData.total) * 100
      : ((activeData.reviewed + sessionDone) / activeData.total) * 100
    : 0;

  useEffect(() => {
    if (!currentCard) return;
    setEditFront(currentCard.front);
    setEditBack(currentCard.back);
    setQuickEditError(null);
  }, [currentCard?._id, currentCard?.front, currentCard?.back]);

  const setMode = useCallback(
    (nextMode: StudyMode) => {
      if (!deckId) return;
      const query = new URLSearchParams(searchParams.toString());
      query.set("deck", deckId);
      query.delete("launch");
      query.delete("draft");
      if (nextMode === "linear") query.set("mode", "linear");
      else query.delete("mode");
      navigate(`/study?${query.toString()}`);
    },
    [deckId, navigate, searchParams],
  );

  const handleRate = useCallback(async (quality: number) => {
    if (!currentCard || animating) return;
    setAnimating(true);
    await recordReview({ cardId: currentCard._id as any, quality });
    setSessionDone((n) => n + 1);
    if (isLinearMode) {
      setLinearIndex((idx) => idx + 1);
    }
    setFlipped(false);
    setTimeout(() => setAnimating(false), 200);
  }, [currentCard, animating, isLinearMode, recordReview]);

  const handleFlip = useCallback(() => {
    if (!animating) setFlipped((f) => !f);
  }, [animating]);

  const saveQuickEdit = useCallback(async () => {
    if (!currentCard || quickEditBusy) return;
    const front = editFront.trim();
    const back = editBack.trim();
    const nextDeckId = currentFullCard?.deckId ?? deckId;
    const nextTags = currentFullCard?.tags ?? ((currentCard as any).tags ?? []);
    if (!front || !back) {
      setQuickEditError(zh ? "正反面都不能为空。" : "Front and back cannot be empty.");
      return;
    }
    setQuickEditBusy(true);
    setQuickEditError(null);
    try {
      await updateCard({
        id: currentCard._id as any,
        deckId: nextDeckId ? (nextDeckId as any) : undefined,
        front,
        back,
        tags: nextTags,
      });
      setQuickEditOpen(false);
      setFlipped(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : zh ? "保存失败" : "Save failed";
      setQuickEditError(message);
    } finally {
      setQuickEditBusy(false);
    }
  }, [currentCard, quickEditBusy, editFront, editBack, updateCard, currentFullCard, deckId, zh]);

  // ── Deck picker (no deck selected) ───────────────
  if (!deckId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">{zh ? "学习" : "Study"}</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {zh ? "选择一个牌组开始学习。" : "Pick a deck to start a study session."}
          </p>
        </div>

        {/* Quick stats */}
        {statsAllDecks && (
          <div className="grid grid-cols-3 gap-3">
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-[var(--color-accent)]">{statsAllDecks.newCount}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{zh ? "新卡" : "New"}</p>
            </div>
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{statsAllDecks.dueCount}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{zh ? "到期" : "Due"}</p>
            </div>
            <div className="card-surface p-4 text-center">
              <p className="text-2xl font-bold text-[var(--color-success)]">{statsAllDecks.reviewedToday}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">{zh ? "今日" : "Today"}</p>
            </div>
          </div>
        )}

        {/* Deck list */}
        {!decks && <p className="text-sm text-[var(--color-text-secondary)]">{zh ? "正在加载牌组..." : "Loading decks..."}</p>}

        {decks && decks.length === 0 && (
          <div className="card-surface flex flex-col items-center px-6 py-16 text-center">
            <h3 className="text-base font-bold">{zh ? "还没有牌组" : "No decks yet"}</h3>
            <p className="mt-1 max-w-xs text-sm text-[var(--color-text-secondary)]">
              {zh ? "请先创建牌组并添加卡片，再开始学习。" : "Create a deck and add some cards before you can study."}
            </p>
            <AppLink href="/decks/new" className="btn-primary mt-5">{zh ? "创建牌组" : "Create deck"}</AppLink>
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
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{zh ? "点击开始学习" : "Tap to study"}</p>
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
      {showLaunchOverlay && (
        <div className={`onboarding-overlay fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${launchLeaving ? "opacity-0" : "opacity-100"}`}>
          <div className="onboarding-deck relative h-56 w-72">
            <div className="onboarding-deck-card onboarding-deck-card-1" />
            <div className="onboarding-deck-card onboarding-deck-card-2" />
            <div className="onboarding-deck-card onboarding-deck-card-3" />
            <div className="onboarding-deck-card onboarding-deck-card-4" />
            <div className="onboarding-deck-card onboarding-deck-card-5" />
          </div>
          <div className="absolute bottom-[18vh] text-center">
            <p className="text-lg font-bold tracking-tight text-[var(--color-text)]">
              {zh ? "准备就绪" : "Ready to study"}
            </p>
          </div>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AppLink href="/study"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-border-strong)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </AppLink>
          <div>
            <h1 className="text-lg font-bold tracking-tight"><span className="gradient-text">{zh ? "学习" : "Study"}</span></h1>
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
              {zh ? "继续编辑这组卡片" : "Edit this set"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowQuickView((prev) => !prev)}
            className="btn-secondary !px-3 !py-1.5 !text-xs"
          >
            {showQuickView ? (zh ? "关闭速览" : "Hide quick view") : (zh ? "快速预览" : "Quick view")}
          </button>
          <button
            type="button"
            onClick={() => setShowAllView((prev) => !prev)}
            className="btn-secondary !px-3 !py-1.5 !text-xs"
          >
            {showAllView ? (zh ? "关闭全部" : "Hide all") : (zh ? "查看全部" : "All view")}
          </button>
          <button
            type="button"
            disabled={!currentCard || quickEditBusy}
            onClick={() => setQuickEditOpen((prev) => !prev)}
            className="btn-secondary !px-3 !py-1.5 !text-xs disabled:opacity-50"
          >
            {quickEditOpen ? (zh ? "关闭快改" : "Hide quick edit") : (zh ? "快速编辑" : "Quick edit")}
          </button>
          <AppLink href={deckId ? `/cards?deck=${deckId}` : "/cards"} className="btn-secondary !px-3 !py-1.5 !text-xs">
            {zh ? "编辑全部" : "Edit all"}
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
              {zh ? "智能" : "Smart"}
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
              {zh ? "线性" : "Linear"}
            </button>
          </div>
          <span className="font-semibold text-[var(--color-success)]">{sessionDone} {zh ? "已完成" : "done"}</span>
          <span className="text-[var(--color-text-secondary)]">{remaining} {zh ? "剩余" : "remaining"}</span>
        </div>
      </div>

      {activeData && activeData.total > 0 && (
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, progressPct)}%`, background: "linear-gradient(90deg, var(--color-gradient-from), var(--color-gradient-to))" }} />
        </div>
      )}

      {showQuickView && quickQueue.length > 0 && (
        <div className="card-surface mb-4 p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
            {zh ? "快速预览" : "Quick view"}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {quickQueue.map((card, idx) => (
              <button
                key={`${card._id}-${idx}`}
                type="button"
                disabled={!isLinearMode}
                onClick={() => {
                  if (!isLinearMode) return;
                  setLinearIndex((prev) => prev + idx);
                  setFlipped(false);
                }}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:cursor-default"
              >
                <p className="line-clamp-2 text-[var(--color-text)]">{card.front.split("\n")[0].replace(/^#+\s*/, "")}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {showAllView && (
        <div className="card-surface mb-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <p className="text-sm font-semibold">{zh ? "本牌组全部卡片" : "All cards in this deck"}</p>
            <AppLink href={deckId ? `/cards?deck=${deckId}` : "/cards"} className="btn-secondary !px-3 !py-1.5 !text-xs">
              {zh ? "打开完整编辑器" : "Open full editor"}
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
                  {zh ? "编辑" : "Edit"}
                </AppLink>
              </div>
            ))}
            {allCardsList.length === 0 && (
              <p className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{zh ? "暂无卡片。" : "No cards yet."}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center">
        {!activeData && <p className="text-[var(--color-text-secondary)]">{zh ? "正在加载卡片..." : "Loading cards..."}</p>}

        {activeData && remaining === 0 && (
          <div className="card-surface mx-auto flex w-full max-w-lg flex-col items-center px-6 py-16 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-success-soft)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <h2 className="text-xl font-bold">{zh ? "本轮学习完成！" : "Session complete!"}</h2>
            <p className="mt-2 text-[var(--color-text-secondary)]">
              {zh ? "你在本轮学习中复习了 " : "You reviewed "}
              <strong className="text-[var(--color-text)]">{sessionDone}</strong>
              {zh ? " 张卡片。" : ` card${sessionDone !== 1 ? "s" : ""} this session.`}
              {activeData.total > 0 && (zh ? ` 已掌握 ${Math.min(activeData.total, activeData.reviewed + sessionDone)}/${activeData.total}。` : ` ${Math.min(activeData.total, activeData.reviewed + sessionDone)} of ${activeData.total} mastered.`)}
            </p>
            <div className="mt-6 flex gap-2">
              <AppLink href="/study" className="btn-secondary">{zh ? "选择其他牌组" : "Pick another deck"}</AppLink>
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
                {zh ? "再学一轮" : "Study again"}
              </button>
            </div>
          </div>
        )}

        {currentCard && (
          <div className="w-full max-w-[min(96vw,78rem)]">
            <button type="button" onClick={handleFlip}
              className="card-surface glow-hover scanline group w-full cursor-pointer px-6 py-12 text-left transition-all sm:px-12 sm:py-16 lg:px-16 lg:py-20"
              style={{ minHeight: "clamp(22rem, 62dvh, 44rem)", boxShadow: flipped ? "0 0 30px var(--color-accent-glow)" : undefined }}>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] sm:text-sm">{flipped ? (zh ? "背面" : "Back") : (zh ? "正面" : "Front")}</span>
                <span className="text-xs text-[var(--color-text-secondary)] sm:text-sm">{zh ? "点击翻面" : "Tap to flip"}</span>
              </div>
              <div className="prose prose-lg max-w-none sm:prose-xl lg:prose-2xl">
                <MarkdownRenderer content={flipped ? currentCard.back : currentCard.front} />
              </div>
            </button>

            {quickEditOpen && currentCard && (
              <div className="card-surface mt-3 space-y-3 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                  {zh ? "快速编辑当前卡片" : "Quick edit current card"}
                </p>
                <label>
                  {zh ? "正面" : "Front"}
                  <textarea
                    rows={3}
                    value={editFront}
                    onChange={(e) => setEditFront(e.target.value)}
                    disabled={quickEditBusy}
                  />
                </label>
                <label>
                  {zh ? "背面" : "Back"}
                  <textarea
                    rows={6}
                    value={editBack}
                    onChange={(e) => setEditBack(e.target.value)}
                    disabled={quickEditBusy}
                  />
                </label>
                {quickEditError && (
                  <p className="text-sm text-[var(--color-danger)]">{quickEditError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveQuickEdit()}
                    disabled={quickEditBusy}
                    className="btn-primary !text-xs"
                  >
                    {quickEditBusy
                      ? (zh ? "保存中..." : "Saving...")
                      : (zh ? "保存修改" : "Save changes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickEditOpen(false);
                      setQuickEditError(null);
                    }}
                    className="btn-secondary !text-xs"
                  >
                    {zh ? "取消" : "Cancel"}
                  </button>
                </div>
              </div>
            )}

            {flipped && (
              <div className="mt-5 space-y-3">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">{zh ? "你掌握得如何？" : "How well did you know it?"}</p>
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

            {!flipped && <p className="mt-4 text-center text-sm text-[var(--color-text-secondary)]">{zh ? "先想答案，然后点击卡片查看。" : "Think about the answer, then tap the card to reveal."}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
