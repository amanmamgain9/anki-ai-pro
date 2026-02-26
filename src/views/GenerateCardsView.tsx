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

const api = anyApi;
const DEFAULT_COUNT = 12;
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

type ChatAction =
  | { kind: "setCount"; value: number }
  | { kind: "setSaveAuto"; name?: string }
  | { kind: "setSaveExisting"; deckId: string; deckName: string }
  | { kind: "saveNow" }
  | { kind: "openEditor" };

const starterTopics = [
  "JavaScript closures",
  "Operating systems memory management",
  "Probability for machine learning",
  "Indian polity basics",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function levelLabel(level: Level, zh: boolean) {
  if (!zh) return level;
  if (level === "beginner") return "初学";
  if (level === "intermediate") return "中级";
  return "高级";
}

function introText(zh: boolean) {
  return zh
    ? "告诉我你想学什么。我会尽量少问问题，尽快给你可编辑草稿。"
    : "Tell me what you want to learn. I will ask as little as possible and get you to an editable draft fast.";
}

function defaultDeckName(topic: string, zh: boolean) {
  return `${topic}${zh ? " 牌组" : " Deck"}`;
}

function parseLevelFromText(raw: string): Level | null {
  const txt = raw.trim().toLowerCase();
  if (!txt) return null;
  if (txt.includes("beginner") || txt.includes("basic") || txt.includes("初")) return "beginner";
  if (txt.includes("intermediate") || txt.includes("medium") || txt.includes("中级")) return "intermediate";
  if (txt.includes("advanced") || txt.includes("hard") || txt.includes("高级")) return "advanced";
  return null;
}

function parseCountFromText(raw: string): number | null {
  const match = raw.match(/(\d{1,2})\s*(cards?|flashcards?|张)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(4, Math.min(30, value));
}

function hasGenerateIntent(raw: string) {
  return /(generate|create|start|go|now|生成|开始|来吧|做吧)/i.test(raw);
}

function hasRegenerateIntent(raw: string) {
  return /(regenerate|again|rebuild|new draft|from scratch|重新生成|重做|再来)/i.test(raw);
}

function parseChatAction(raw: string, decks: Deck[]): ChatAction | null {
  const txt = raw.trim();
  if (!txt) return null;
  const lower = txt.toLowerCase();

  if (/(save now|commit|finali[sz]e|publish|提交|立即保存|保存到题库)/i.test(txt)) {
    return { kind: "saveNow" };
  }

  if (/(open editor|open draft|edit draft|打开编辑|编辑草稿|回到编辑)/i.test(txt)) {
    return { kind: "openEditor" };
  }

  const count = parseCountFromText(txt);
  if (count && /(cards?|flashcards?|张)/i.test(txt)) {
    return { kind: "setCount", value: count };
  }

  if (/(new deck|create deck|auto deck|新牌组|自动牌组)/i.test(txt)) {
    const nameByColon = txt.match(/[:：]\s*(.+)$/)?.[1]?.trim();
    const nameByQuote = txt.match(/["“”']([^"“”']+)["“”']/)?.[1]?.trim();
    return { kind: "setSaveAuto", name: nameByColon || nameByQuote || undefined };
  }

  if (/(use deck|existing deck|save to|用牌组|现有牌组|保存到)/i.test(txt)) {
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

export default function GenerateCardsView() {
  const { navigate, back, searchParams } = useAppRouter();
  const { t, locale } = useI18n();
  const zh = locale === "zh";

  const decks = useQuery(api.decks.list) as Deck[] | undefined;
  const upsertDraft = useMutation(api.chats.upsertDraft);
  const commitChat = useMutation(api.chats.commit);
  const discardChat = useMutation(api.chats.discard);

  const requestedChatId = searchParams.get("chat");
  const wantsNew = searchParams.get("new") === "1";

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
    { id: uid(), role: "assistant", text: introText(zh) },
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
    setMessages([{ id: uid(), role: "assistant", text: introText(zh) }]);
  }, [zh]);

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
      navigate("/cards/generate");
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
        : [{ id: uid(), role: "assistant", text: introText(zh) }],
    );
    setSavedCount(0);
    setCommitBusy(false);
    setBusy(false);
    setPhase("idle");
    setError(null);
    setDraftDirty(true);

    loadedChatIdRef.current = requestedChatId;
  }, [requestedChatId, wantsNew, chatDoc, navigate, resetLocal, zh]);

  function addMessage(role: ChatMessage["role"], text: string) {
    setMessages((prev) => [...prev, { id: uid(), role, text }]);
  }

  const buildSnapshotPayload = useCallback(() => {
    return {
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
  }, [topic, level, count, saveMode, deckId, autoDeckName, cards, messages, workspace]);

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

          if (!requestedChatId) {
            navigate(`/cards/generate?chat=${encodeURIComponent(nextId)}`);
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
    buildSnapshotPayload,
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
      setAutoDeckName(defaultDeckName(clean, zh));
    }

    addMessage("user", clean);
    addMessage(
      "assistant",
      zh
        ? "这个主题很好。你现在是初学、中级，还是高级？"
        : "Nice topic. What's your level: beginner, intermediate, or advanced?",
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
      zh
        ? `${options?.reason ? `${options.reason}。` : ""}正在生成 ${targetCount} 张卡片草稿...`
        : `${options?.reason ? `${options.reason}. ` : ""}Generating a ${targetCount}-card draft...`,
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
        throw new Error(payload.error ?? (zh ? "生成失败" : "Generation failed"));
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
        throw new Error(zh ? "模型返回空卡片" : "Model returned empty cards");
      }

      setPhase("done");
      setCards(preparedCards);
      setCount(targetCount);
      setDraftDirty(true);
      setWorkspace("editor");

      addMessage(
        "assistant",
        zh
          ? `草稿完成，共 ${preparedCards.length} 张。你可以去编辑器手动改，也可以继续对话让我改。`
          : `Draft ready with ${preparedCards.length} cards. Edit manually in the editor, or keep refining here in chat.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : zh ? "生成失败" : "Generation failed";
      setError(message);
      setPhase("idle");
      addMessage("assistant", zh ? `生成失败：${message}` : `Generation failed: ${message}`);
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
      zh ? "收到，正在按你的要求重写草稿..." : "Got it. Rewriting the draft to match your request...",
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
        throw new Error(payload.error ?? (zh ? "编辑失败" : "Draft edit failed"));
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
        throw new Error(zh ? "编辑后无有效卡片" : "No valid cards after edit");
      }

      setCards(nextCards);
      setDraftDirty(true);
      setPhase("done");
      setWorkspace("editor");

      addMessage(
        "assistant",
        payload.summary
          ? payload.summary
          : zh
            ? "已更新草稿。"
            : "Draft updated.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : zh ? "编辑失败" : "Draft edit failed";
      setError(message);
      setPhase("idle");
      addMessage("assistant", zh ? `编辑失败：${message}` : `Draft edit failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onPickLevel(nextLevel: Level) {
    if (!topic.trim() || busy) return;
    setLevel(nextLevel);
    setDraftDirty(true);
    addMessage("user", levelLabel(nextLevel, zh));
    await generateDraft(nextLevel);
  }

  async function quickGenerate(rawTopic?: string) {
    const incomingTopic = rawTopic?.trim() ?? "";
    const baseTopic = topic.trim() || incomingTopic;

    if (!baseTopic) {
      addMessage(
        "assistant",
        zh ? "先给我一个主题，我就能秒出草稿。" : "Give me a topic first and I can generate instantly.",
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
        setAutoDeckName(defaultDeckName(baseTopic, zh));
      }
      addMessage("user", baseTopic);
    }

    const chosen = level ?? DEFAULT_LEVEL;
    if (!level) {
      setLevel(chosen);
      setDraftDirty(true);
      addMessage(
        "assistant",
        zh
          ? `我先用${levelLabel(chosen, zh)}，直接开始。`
          : `Using ${levelLabel(chosen, zh)} for now and starting immediately.`,
      );
    }

    await generateDraft(chosen, { reason: zh ? "极速模式" : "Quick mode" });
  }

  async function commitDraft() {
    if (!cards.length || commitBusy) return;
    if (saveMode === "existing" && !deckId) {
      const message = zh
        ? "请先指定要保存的牌组，或切换为自动建牌组。"
        : "Choose a destination deck first, or switch to auto-create deck.";
      setError(message);
      addMessage("assistant", message);
      return;
    }

    setCommitBusy(true);
    setError(null);

    try {
      let chatId = requestedChatId;
      if (!chatId) {
        chatId = (await upsertDraft({
          snapshot: buildSnapshotPayload(),
        })) as string;
      }

      setPhase("saving");
      const result = (await commitChat({
        id: chatId as any,
        snapshot: buildSnapshotPayload(),
      })) as { created: number; deckId?: string };

      setSavedCount(result.created);
      setDraftDirty(false);
      setPhase("done");
      addMessage(
        "assistant",
        zh
          ? `已保存 ${result.created} 张卡片到你的题库。`
          : `Saved ${result.created} cards to your library.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : zh ? "保存失败" : "Save failed";
      setError(message);
      setPhase("idle");
      addMessage("assistant", zh ? `保存失败：${message}` : `Save failed: ${message}`);
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
      navigate("/cards/generate?new=1");
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
        zh ? `好的，默认卡片数改为 ${action.value}。` : `Done. Default card count is now ${action.value}.`,
      );
      return;
    }

    if (action.kind === "setSaveAuto") {
      setSaveMode("auto");
      if (action.name?.trim()) {
        setAutoDeckName(action.name.trim());
      } else if (topic.trim()) {
        setAutoDeckName(defaultDeckName(topic, zh));
      }
      setDraftDirty(true);
      addMessage(
        "assistant",
        zh
          ? `好的，将自动建牌组保存${action.name?.trim() ? `（${action.name.trim()}）` : ""}。`
          : `Done. I will auto-create a deck${action.name?.trim() ? ` (${action.name.trim()})` : ""}.`,
      );
      return;
    }

    if (action.kind === "setSaveExisting") {
      setSaveMode("existing");
      setDeckId(action.deckId);
      setDraftDirty(true);
      addMessage(
        "assistant",
        zh ? `好的，后续会保存到“${action.deckName}”。` : `Done. Future saves will go to "${action.deckName}".`,
      );
      return;
    }

    if (action.kind === "openEditor") {
      if (!cards.length) {
        addMessage(
          "assistant",
          zh ? "还没有草稿可编辑，先生成一版。" : "No draft to edit yet. Generate one first.",
        );
        return;
      }
      setWorkspace("editor");
      addMessage("assistant", zh ? "已打开编辑器。" : "Opened editor.");
      return;
    }

    if (action.kind === "saveNow") {
      if (!cards.length) {
        addMessage(
          "assistant",
          zh ? "还没有草稿可保存，先生成一版。" : "No draft to save yet. Generate one first.",
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
        zh
          ? "告诉我你的水平（初学/中级/高级）就行。你也可以直接说“直接生成”，我会先帮你选一个默认水平。"
          : "Just tell me your level (beginner/intermediate/advanced). Or say \"generate now\" and I'll pick a sensible default.",
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
          reason: zh ? "按你的要求开始生成" : "Starting with your direction",
        });
        return;
      }
      await generateDraft(level, {
        guidance: text,
        reason: zh ? "已应用额外要求" : "Applied your extra guidance",
      });
      return;
    }

    if (hasRegenerateIntent(text)) {
      await generateDraft(level, {
        guidance: text,
        reason: zh ? "按你的要求重新生成" : "Regenerating per your request",
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
        front: zh ? "新问题" : "New question",
        back: zh ? "新答案" : "New answer",
        tags: [],
        manuallyModified: true,
      },
    ]);
    setDraftDirty(true);
  }

  const statusText = useMemo(() => {
    if (phase === "thinking") return zh ? "理解中..." : "Understanding...";
    if (phase === "generating") return zh ? "生成草稿中..." : "Generating draft...";
    if (phase === "saving") return zh ? "保存中..." : "Saving...";
    if (savedCount > 0) return zh ? `已保存 ${savedCount} 张` : `${savedCount} saved`;
    if (draftDirty) return zh ? "草稿已保存" : "Draft saved";
    if (canAskLevel) return zh ? "等待水平" : "Waiting for level";
    return zh ? "准备就绪" : "Ready";
  }, [phase, savedCount, draftDirty, canAskLevel, zh]);

  const destinationPreview = useMemo(() => {
    if (saveMode === "existing") {
      return selectedDeckName || (zh ? "未选择牌组" : "No deck selected");
    }
    if (autoDeckName.trim()) return autoDeckName.trim();
    if (topic.trim()) return defaultDeckName(topic.trim(), zh);
    return zh ? "自动建牌组" : "Auto-create deck";
  }, [saveMode, selectedDeckName, autoDeckName, topic, zh]);

  const showCustomAutoName =
    saveMode === "auto" &&
    topic.trim().length > 0 &&
    autoDeckName.trim().length > 0 &&
    autoDeckName.trim() !== defaultDeckName(topic, zh);

  const refineActions = useMemo(
    () => [
      {
        label: zh ? "更详细" : "More detail",
        instruction: zh
          ? "让每张卡更详细，并补充关键例子。"
          : "Make each card more detailed and add concrete examples.",
      },
      {
        label: zh ? "更精简" : "Concise",
        instruction: zh
          ? "压缩每张卡片，用更精炼表述。"
          : "Make each card shorter and more concise.",
      },
      {
        label: zh ? "更难" : "Harder",
        instruction: zh
          ? "提高难度，增加推理题与易错点。"
          : "Increase difficulty with reasoning-heavy prompts and edge cases.",
      },
      {
        label: zh ? "去重" : "Remove overlap",
        instruction: zh
          ? "删除重复内容并合并相似卡片。"
          : "Remove overlaps and merge redundant cards.",
      },
    ],
    [zh],
  );

  if (!topic.trim()) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={back}
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
            {zh ? "今天想学什么？" : "What do you want to learn today?"}
          </p>

          <form
            onSubmit={handleChatSubmit}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={zh ? "输入主题（比如：细胞生物学）" : "Type a topic (e.g. cell biology)"}
              className="w-full border-0 bg-transparent px-2 py-2 text-base focus:ring-0"
              disabled={busy}
            />
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(zh
              ? ["JavaScript 闭包", "操作系统内存管理", "机器学习概率基础", "中国近现代史基础"]
              : starterTopics
            ).map((preset) => (
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
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
            {zh ? "边聊边生成，边编辑边完善。" : "Generate in chat, refine in editor."}
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
          {zh ? "教练对话" : "Coach Chat"}
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
          {zh ? `草稿编辑 (${cards.length})` : `Draft Editor (${cards.length})`}
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
                {zh ? "主题" : "Topic"}: {topic}
              </span>

              {level && (
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {zh ? "水平" : "Level"}: {levelLabel(level, zh)}
                </span>
              )}

              {count !== DEFAULT_COUNT && (
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {count} {zh ? "张" : "cards"}
                </span>
              )}

              {saveMode === "existing" && selectedDeckName && (
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {zh ? "保存到" : "Saving to"}: {selectedDeckName}
                </span>
              )}

              {showCustomAutoName && (
                <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {zh ? "新牌组" : "New deck"}: {autoDeckName}
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
                  <span className="inline-block animate-pulse">{zh ? "处理中..." : "Working..."}</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {canAskLevel && (
              <div className="border-t border-[var(--color-border)] px-4 pt-3">
                <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {zh ? "你的水平" : "Your level"}
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
                      {levelLabel(lv, zh)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void quickGenerate()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    <IconZap className="h-3.5 w-3.5" />
                    {zh ? "直接生成" : "Generate now"}
                  </button>
                </div>
              </div>
            )}

            {canRefine && (
              <div className="border-t border-[var(--color-border)] px-4 pt-3">
                <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                  {zh ? "快捷调整" : "Quick refinements"}
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
                    ? zh
                      ? "输入水平，或说“直接生成”"
                      : "Type level, or say 'generate now'"
                    : zh
                      ? "继续说：改详细、删冗余、保存到某个牌组..."
                      : "Keep going: make detailed, trim fluff, save to deck..."
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
                {zh ? "秒出草稿" : "Instant"}
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || chatInput.trim().length < 2}
              >
                {zh ? "发送" : "Send"}
              </button>
            </form>

            <div className="border-t border-[var(--color-border)] px-4 py-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
              >
                <IconTune className="h-3.5 w-3.5" />
                {showAdvanced
                  ? zh
                    ? "收起设置"
                    : "Hide setup"
                  : zh
                    ? "调整设置"
                    : "Adjust setup"}
              </button>
            </div>

            {showAdvanced && (
              <div className="border-t border-[var(--color-border)] px-4 pb-4 pt-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label>
                    {zh ? "默认卡片数" : "Default card count"}
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {[8, 12, 16, 20].map((n) => (
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
                    {zh ? "保存位置" : "Save destination"}
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
                          {zh ? "自动建牌组" : "Auto-create deck"}
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
                          {zh ? "现有牌组" : "Existing deck"}
                        </button>
                      </div>

                      {saveMode === "existing" ? (
                        <select value={deckId} onChange={(e) => setDeckId(e.target.value)} disabled={busy}>
                          <option value="">{zh ? "选择牌组" : "Choose deck"}</option>
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
                          placeholder={zh ? "新牌组名称（可选）" : "New deck name (optional)"}
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
                {zh ? `草稿编辑器 (${cards.length})` : `Draft Editor (${cards.length})`}
              </span>
              <span className="rounded-md bg-[var(--color-surface-alt)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                {zh ? "保存位置" : "Save destination"}: {destinationPreview}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWorkspace("coach")}
                  className="btn-secondary !text-xs"
                >
                  {zh ? "回到对话" : "Back to chat"}
                </button>
                <button
                  type="button"
                  onClick={addManualCard}
                  className="btn-secondary !text-xs"
                >
                  {zh ? "手动加卡片" : "Add card"}
                </button>
                <button
                  type="button"
                  onClick={() => void commitDraft()}
                  disabled={commitBusy || busy || cards.length === 0}
                  className="btn-primary !text-xs"
                >
                  {commitBusy ? (zh ? "保存中..." : "Saving...") : zh ? "保存到题库" : "Save to library"}
                </button>
                <button
                  type="button"
                  onClick={() => void clearDraft()}
                  className="btn-danger !text-xs"
                >
                  {zh ? "丢弃草稿" : "Discard draft"}
                </button>
              </div>
            </div>

            {savedCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-sm text-[var(--color-success)]">
                  {zh ? `已成功保存 ${savedCount} 张卡片。` : `Successfully saved ${savedCount} cards.`}
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/cards")}
                  className="btn-primary !text-xs"
                >
                  {zh ? "打开卡片库" : "Open cards"}
                </button>
              </div>
            )}

            {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
          </div>

          {cards.length === 0 && (
            <div className="card-surface p-6 text-center text-sm text-[var(--color-text-secondary)]">
              {zh ? "还没有草稿卡片。先去对话区生成。" : "No draft cards yet. Generate from chat first."}
            </div>
          )}

          {cards.length > 0 && (
            <div className="space-y-3">
              {cards.map((card, idx) => (
                <div key={`${idx}-${card.front.slice(0, 30)}`} className="card-surface p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                      {zh ? `卡片 ${idx + 1}` : `Card ${idx + 1}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeCardAt(idx)}
                      className="text-xs font-semibold text-[var(--color-danger)] hover:underline"
                    >
                      {zh ? "删除" : "Remove"}
                    </button>
                  </div>

                  <label>
                    {zh ? "正面" : "Front"}
                    <textarea
                      rows={2}
                      value={card.front}
                      onChange={(e) => updateCardAt(idx, { front: e.target.value, manuallyModified: true })}
                    />
                  </label>

                  <label className="mt-2 block">
                    {zh ? "背面" : "Back"}
                    <textarea
                      rows={5}
                      value={card.back}
                      onChange={(e) => updateCardAt(idx, { back: e.target.value, manuallyModified: true })}
                    />
                  </label>

                  <label className="mt-2 block">
                    {zh ? "标签（逗号分隔）" : "Tags (comma separated)"}
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
