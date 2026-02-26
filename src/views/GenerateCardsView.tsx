"use client";

import { anyApi } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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

type GenerationPhase = "idle" | "thinking" | "generating" | "saving" | "done";

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
  const { t, locale } = useI18n();
  const zh = locale === "zh";
  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const bulkCreate = useMutation(api.flashcards.bulkCreate);

  const [topicInput, setTopicInput] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level | null>(null);
  const [count, setCount] = useState(12);
  const [deckId, setDeckId] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [tips, setTips] = useState<string[]>([]);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [lastRunTopic, setLastRunTopic] = useState("");
  const [lastRunLevel, setLastRunLevel] = useState<Level | null>(null);
  const [lastRunCount, setLastRunCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      text: zh
        ? "告诉我你的学习主题。之后我只会问一个问题：你的水平。"
        : "Tell me your topic. I will ask only one question after that: your level.",
    },
  ]);

  const canAskLevel = topic.trim().length > 0 && !level;
  const readyToGenerate = topic.trim().length > 0 && !!level;
  const deckList = decks ?? [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, phase]);

  function addMessage(role: ChatMessage["role"], text: string) {
    setMessages((prev) => [...prev, { id: uid(), role, text }]);
  }

  function applyTopic(nextTopic: string) {
    const clean = nextTopic.trim();
    if (!clean) return;
    const changedTopic = clean !== topic;
    setTopic(clean);
    setTopicInput("");
    setSavedCount(0);
    setTips([]);
    setCards([]);
    setError(null);
    setLevel(null);
    setPhase("idle");
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", text: clean },
      {
        id: uid(),
        role: "assistant",
        text: changedTopic
          ? zh
            ? "收到。这个主题的水平是？"
            : "Great. What's your level for this topic?"
          : zh
            ? "这个主题我记住了。请选择你的水平。"
            : "Got it. Choose your level and I'll generate instantly.",
      },
    ]);
  }

  async function generateAndSave(
    chosenLevel: Level,
    topicText: string,
    opts?: { nextCount?: number; guidance?: string; reason?: string },
  ) {
    const targetCount = opts?.nextCount ?? count;
    const topicForModel = opts?.guidance
      ? `${topicText}\n\nSpecial instruction: ${opts.guidance}`
      : topicText;

    setBusy(true);
    setPhase("thinking");
    setError(null);
    setSavedCount(0);
    setTips([]);
    setCards([]);
    addMessage(
      "assistant",
      zh
        ? `${opts?.reason ? `${opts.reason}。` : ""}正在为“${topicText}”（${chosenLevel}）生成 ${targetCount} 张卡片...`
        : `${opts?.reason ? `${opts.reason}. ` : ""}Generating ${targetCount} cards for "${topicText}" (${chosenLevel})...`,
    );

    try {
      setPhase("generating");
      const response = await fetch("/api/ai/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicForModel,
          level: chosenLevel,
          count: targetCount,
        }),
      });

      const payload = (await response.json()) as {
        cards?: GeneratedCard[];
        tips?: string[];
        error?: string;
      };

      if (!response.ok || !payload.cards || payload.cards.length === 0) {
        throw new Error(payload.error ?? (zh ? "生成失败" : "Generation failed"));
      }

      const preparedCards = payload.cards
        .map((card) => ({
          front: card.front.trim(),
          back: card.back.trim(),
          tags: (card.tags ?? []).map((t) => t.trim()).filter(Boolean),
        }))
        .filter((card) => card.front && card.back);

      if (preparedCards.length === 0) {
        throw new Error(zh ? "模型返回了空卡片" : "Model returned empty cards");
      }

      setPhase("saving");
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
      setLastRunTopic(topicText);
      setLastRunLevel(chosenLevel);
      setLastRunCount(targetCount);
      setPhase("done");
      addMessage(
        "assistant",
        zh
          ? `完成。已生成并保存 ${created} 张卡片。你可以重新生成或打开卡片页。`
          : `Done. Generated and saved ${created} cards. You can regenerate or open Cards.`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : zh ? "生成卡片失败" : "Failed to generate cards";
      setError(message);
      setPhase("idle");
      addMessage("assistant", zh ? `生成失败：${message}` : `Generation failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  function chooseLevel(chosen: Level) {
    if (!topic || busy) return;
    setLevel(chosen);
    addMessage(
      "user",
      zh
        ? chosen === "beginner"
          ? "初学"
          : chosen === "intermediate"
            ? "中级"
            : "高级"
        : levelOptions.find((opt) => opt.value === chosen)?.label ?? chosen,
    );
    void generateAndSave(chosen, topic);
  }

  function onSubmitTopic(e: FormEvent) {
    e.preventDefault();
    applyTopic(topicInput);
  }

  const statusText = useMemo(() => {
    if (phase === "thinking") return zh ? "理解主题..." : "Understanding topic...";
    if (phase === "generating") return zh ? "正在构建高质量卡片..." : "Crafting high-retention cards...";
    if (phase === "saving") return zh ? "保存到你的题库..." : "Saving to your library...";
    if (savedCount > 0) return zh ? `已保存 ${savedCount} 张卡片` : `${savedCount} cards saved`;
    if (readyToGenerate) return zh ? "准备就绪" : "Ready";
    if (canAskLevel) return zh ? "请选择你的水平" : "Choose your level";
    return zh ? "等待输入主题" : "Waiting for topic";
  }, [phase, savedCount, readyToGenerate, canAskLevel, zh]);

  const refineActions = useMemo(
    () => [
      {
        key: "harder",
        label: zh ? "更难" : "Make harder",
        reason: zh ? "已按更高难度重生成" : "Regenerated with higher difficulty",
        guidance: zh
          ? "提高难度，增加更深层理解题和易错点。"
          : "Increase difficulty, include deeper reasoning and edge cases.",
      },
      {
        key: "easier",
        label: zh ? "更简单" : "Make easier",
        reason: zh ? "已按更易版本重生成" : "Regenerated in simpler form",
        guidance: zh
          ? "降低难度，优先基础概念，用更简洁语言。"
          : "Lower difficulty, focus on fundamentals with simpler language.",
      },
      {
        key: "examples",
        label: zh ? "增加例子" : "Add examples",
        reason: zh ? "已增加更多例子" : "Regenerated with concrete examples",
        guidance: zh
          ? "每张卡尽量给出一个简短真实例子。"
          : "Include a short practical example in most card backs.",
      },
      {
        key: "more",
        label: zh ? "更多卡片" : "More cards",
        reason: zh ? "已生成更多卡片" : "Regenerated with more cards",
        nextCount: Math.min(28, Math.max(lastRunCount || count, count) + 4),
      },
      {
        key: "fewer",
        label: zh ? "更少卡片" : "Fewer cards",
        reason: zh ? "已压缩为更少卡片" : "Regenerated with fewer cards",
        nextCount: Math.max(6, Math.min(lastRunCount || count, count) - 4),
      },
    ],
    [zh, count, lastRunCount],
  );

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
            {zh ? "对话" : "Chat"}
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
            {busy && (
              <div className="max-w-[90%] rounded-xl bg-[var(--color-surface-alt)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                <span className="inline-block animate-pulse">
                  {zh ? "正在处理..." : "Working..."}
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="space-y-3 border-t border-[var(--color-border)] p-4">
            {!topic && (
              <div className="flex flex-wrap gap-2">
                {(zh
                  ? ["JavaScript 闭包", "操作系统内存管理", "机器学习概率基础", "中国近现代史基础"]
                  : starterTopics).map((preset) => (
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
            )}

            <form onSubmit={onSubmitTopic} className="flex gap-2">
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder={zh ? "主题（例如：SQL 连接、React Hooks、电化学）" : "Topic (example: SQL joins, React hooks, electrochemistry)"}
                className="flex-1"
                disabled={busy}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || topicInput.trim().length < 2}
              >
                {zh ? "发送" : "Send"}
              </button>
            </form>

            {topic && (
              <p className="text-xs text-[var(--color-text-secondary)]">
                {zh ? `当前主题：${topic}` : `Current topic: ${topic}`}
              </p>
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
                    <p className="text-sm font-semibold">
                      {zh
                        ? opt.value === "beginner"
                          ? "初学"
                          : opt.value === "intermediate"
                            ? "中级"
                            : "高级"
                        : opt.label}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {zh
                        ? opt.value === "beginner"
                          ? "语言更简单，重基础"
                          : opt.value === "intermediate"
                            ? "概念 + 应用题"
                            : "偏考试与边界场景"
                        : opt.hint}
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
              {zh ? "选项" : "Options"}
            </p>
            {topic && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-[0.7rem] font-semibold text-[var(--color-text-secondary)]">
                  {zh ? "主题" : "Topic"}: {topic}
                </span>
                {level && (
                  <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-[0.7rem] font-semibold text-[var(--color-text-secondary)]">
                    {zh ? "水平" : "Level"}: {zh ? (level === "beginner" ? "初学" : level === "intermediate" ? "中级" : "高级") : level}
                  </span>
                )}
              </div>
            )}
            <div className="mt-3 space-y-3">
              <label>
                {zh ? "牌组" : "Deck"}
                <select
                  value={deckId}
                  onChange={(e) => setDeckId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">{zh ? "无牌组" : "No deck"}</option>
                  {deckList.map((deck) => (
                    <option key={deck._id} value={deck._id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="mb-1 text-sm font-medium">{zh ? "卡片数量" : "Card count"}</p>
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
              {zh ? "状态：" : "Status:"} <span className="font-semibold text-[var(--color-text)]">{statusText}</span>
            </p>
            {(phase === "thinking" || phase === "generating" || phase === "saving") && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-alt)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500"
                  style={{
                    width:
                      phase === "thinking"
                        ? "33%"
                        : phase === "generating"
                          ? "68%"
                          : "92%",
                  }}
                />
              </div>
            )}
            {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
            {readyToGenerate && !busy && (
              <button
                type="button"
                onClick={() => level && void generateAndSave(level, topic)}
                className="btn-secondary mt-3 w-full justify-center"
              >
                {zh ? "重新生成" : "Regenerate"}
              </button>
            )}
            {savedCount > 0 && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {refineActions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      disabled={busy || !lastRunLevel || !lastRunTopic}
                      onClick={() =>
                        lastRunLevel &&
                        lastRunTopic &&
                        void generateAndSave(lastRunLevel, lastRunTopic, {
                          guidance: action.guidance,
                          reason: action.reason,
                          nextCount: action.nextCount,
                        })
                      }
                      className="rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/cards")}
                  className="btn-primary mt-3 w-full justify-center"
                >
                  {zh ? "打开卡片" : "Open cards"}
                </button>
              </>
            )}
          </div>

          <div className="card-surface p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
              {zh ? "输出预览" : "Output preview"}
            </p>
            {busy && cards.length === 0 ? (
              <div className="mt-3 space-y-2">
                <div className="h-10 animate-pulse rounded-md bg-[var(--color-surface-alt)]" />
                <div className="h-10 animate-pulse rounded-md bg-[var(--color-surface-alt)]" />
                <div className="h-10 animate-pulse rounded-md bg-[var(--color-surface-alt)]" />
              </div>
            ) : cards.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                {zh ? "生成后的卡片会显示在这里（保存前后）。" : "Generated cards will appear here before/after save."}
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {cards.slice(0, 4).map((card, idx) => (
                  <div
                    key={`${card.front}-${idx}`}
                    className="rounded-lg border border-[var(--color-border)] p-3"
                  >
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                      {zh ? `卡片 ${idx + 1}` : `Card ${idx + 1}`}
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
                      {zh ? "学习建议" : "Study tips"}
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
