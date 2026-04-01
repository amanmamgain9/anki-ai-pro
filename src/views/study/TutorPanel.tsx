"use client";

import { useEffect, useRef } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { Card, TutorChatDetail, TutorChatMeta } from "./studyTypes";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function formatDateTime(ts: number, locale: string) {
  return new Date(ts).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TutorPanelProps = {
  t: TranslateFn;
  locale: string;
  currentCard: Card;
  showTutorPanel: boolean;
  closeTutorPanel: () => void;
  hasTutorHistory: boolean;
  tutorChats: TutorChatMeta[] | undefined;
  selectedTutorChatId: string | null;
  setSelectedTutorChatId: (id: string | null) => void;
  startFreshTutorChat: () => Promise<void>;
  tutorBusy: boolean;
  summaryBusy: boolean;
  tutorChatDetail: TutorChatDetail | undefined;
  pendingUserMessage: string | null;
  assistantTyping: boolean;
  tutorError: string | null;
  tutorInput: string;
  setTutorInput: (value: string) => void;
  sendTutorMessage: () => Promise<string | null>;
  sendTutorStarter: () => Promise<string | null>;
  finishTutorChat: () => Promise<void>;
  selectedTutorChatMeta: TutorChatMeta | null;
  tutorDictationSupported: boolean;
  tutorDictating: boolean;
  toggleTutorDictation: () => void;
};

export default function TutorPanel({
  t,
  locale,
  currentCard,
  showTutorPanel,
  closeTutorPanel,
  hasTutorHistory,
  tutorChats,
  selectedTutorChatId,
  setSelectedTutorChatId,
  startFreshTutorChat,
  tutorBusy,
  summaryBusy,
  tutorChatDetail,
  pendingUserMessage,
  assistantTyping,
  tutorError,
  tutorInput,
  setTutorInput,
  sendTutorMessage,
  sendTutorStarter,
  finishTutorChat,
  selectedTutorChatMeta,
  tutorDictationSupported,
  tutorDictating,
  toggleTutorDictation,
}: TutorPanelProps) {
  const tutorScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showTutorPanel) return;
    const el = tutorScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [showTutorPanel, tutorChatDetail?.messages.length, tutorChatDetail?.chat.summary]);

  return (
    <>
      <button
        type="button"
        aria-label={t("app.study.tutor.closePanelAria")}
        onClick={closeTutorPanel}
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
            onClick={closeTutorPanel}
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
                {t("app.study.tutor.newChat")}
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
              <button
                type="button"
                onClick={() => void sendTutorStarter()}
                disabled={tutorBusy || summaryBusy}
                className="btn-primary mt-3 !px-3 !py-2 !text-xs disabled:opacity-50"
              >
                {t("app.study.tutor.starterButton")}
              </button>
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
            <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {t("app.study.tutor.you")}
              </p>
              <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{pendingUserMessage}</p>
            </div>
          )}

          {assistantTyping && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {t("app.study.tutor.tutorName")}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">{t("app.study.tutor.thinking")}</p>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-3">
          {selectedTutorChatMeta?.hasSummary && selectedTutorChatMeta.summary && (
            <div className="card-surface mb-3 border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                {t("app.study.tutor.studySummary")}
              </p>
              <div className="prose prose-sm max-w-none">
                <MarkdownRenderer content={selectedTutorChatMeta.summary} />
              </div>
            </div>
          )}

          {tutorError && (
            <p className="mb-2 text-xs text-[var(--color-danger)]">{tutorError}</p>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={tutorInput}
              onChange={(e) => setTutorInput(e.target.value)}
              placeholder={t("app.study.tutor.textareaPlaceholder")}
              rows={3}
              className="min-h-[5.5rem] flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-accent)]"
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void sendTutorMessage()}
                disabled={tutorBusy || !tutorInput.trim()}
                className="btn-primary !px-3 !py-2 !text-xs disabled:opacity-50"
              >
                {tutorBusy ? t("app.study.tutor.sending") : t("app.study.tutor.send")}
              </button>
              <button
                type="button"
                onClick={() => void finishTutorChat()}
                disabled={summaryBusy || tutorBusy}
                className="btn-secondary !px-3 !py-2 !text-xs disabled:opacity-50"
              >
                {summaryBusy ? t("app.study.tutor.summarizing") : t("app.study.tutor.finishAndSummarize")}
              </button>
              {tutorDictationSupported && (
                <button
                  type="button"
                  onClick={toggleTutorDictation}
                  className={`btn-secondary !px-3 !py-2 !text-xs ${tutorDictating ? "!border-[var(--color-accent)] !text-[var(--color-accent)]" : ""}`}
                >
                  {tutorDictating ? t("app.study.tutor.voiceStop") : t("app.study.tutor.voiceStart")}
                </button>
              )}
            </div>
          </div>

          {tutorDictationSupported && (
            <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
              {t("app.study.tutor.voiceHint")}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
