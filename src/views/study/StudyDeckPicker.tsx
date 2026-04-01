import { AppLink } from "@/lib/app-router";
import type { Deck, HeatCell, HeatmapData } from "./studyTypes";

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

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export default function StudyDeckPicker({
  t,
  locale,
  decks,
  statsAllDecks,
  heatmap,
  heatWeeks,
  heatmapRangeLabel,
  linearStateByDeck,
  voiceSupported,
  voiceMode,
  voiceStatus,
  voiceListening,
  toggleVoiceMode,
  navigate,
}: {
  t: TranslateFn;
  locale: string;
  decks: Deck[] | undefined;
  statsAllDecks:
    | { total: number; newCount: number; dueCount: number; reviewedToday: number }
    | undefined;
  heatmap: HeatmapData | undefined;
  heatWeeks: Array<Array<HeatCell | null>>;
  heatmapRangeLabel: string;
  linearStateByDeck: Map<string, unknown>;
  voiceSupported: boolean;
  voiceMode: boolean;
  voiceStatus: string | null;
  voiceListening: boolean;
  toggleVoiceMode: () => void;
  navigate: (href: string) => void;
}) {
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
            <p className="text-xs text-[var(--color-text-secondary)]">{heatmapRangeLabel}</p>
          </div>
          {heatmap && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <span>{t("app.study.heatmap.currentStreak")} <strong className="text-[var(--color-text)]">{heatmap.currentStreak}</strong></span>
              <span>{t("app.study.heatmap.longestStreak")} <strong className="text-[var(--color-text)]">{heatmap.longestStreak}</strong></span>
              <span>{t("app.study.heatmap.totalReviews")} <strong className="text-[var(--color-text)]">{heatmap.totalReviews}</strong></span>
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
          {decks.map((deck) => (
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
