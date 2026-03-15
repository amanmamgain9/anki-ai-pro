import { voiceCommandKeywords } from "@/i18n/non-ui-text";

export type VoiceCommand =
  | { kind: "flip" }
  | { kind: "showFront" }
  | { kind: "showBack" }
  | { kind: "nextCard" }
  | { kind: "previousCard" }
  | { kind: "repeat" }
  | { kind: "applySuggested" }
  | { kind: "openTutor"; prompt?: string }
  | { kind: "closeTutor" }
  | { kind: "stopVoiceMode" }
  | { kind: "rate"; quality: 0 | 1 | 2 | 3 };

function normalizeText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"'`~]/g, " ")
    .replace(/\s+/g, " ");
}

function includesAny(input: string, patterns: string[]) {
  return patterns.some((pattern) => input.includes(pattern));
}

export function getSpeechLang(locale: string) {
  return locale.startsWith("zh") ? "zh-CN" : "en-US";
}

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shortSpeechText(value: string, max = 280) {
  const plain = markdownToPlainText(value);
  return plain.length <= max ? plain : `${plain.slice(0, max - 1)}…`;
}

export function parseVoiceCommand(text: string): VoiceCommand | null {
  const input = normalizeText(text);
  if (!input) return null;

  // Rating commands first: users often speak these naturally.
  if (includesAny(input, [...voiceCommandKeywords.rateAgain])) {
    return { kind: "rate", quality: 0 };
  }
  if (includesAny(input, [...voiceCommandKeywords.rateHard])) {
    return { kind: "rate", quality: 1 };
  }
  if (includesAny(input, [...voiceCommandKeywords.rateGood])) {
    return { kind: "rate", quality: 2 };
  }
  if (includesAny(input, [...voiceCommandKeywords.rateEasy])) {
    return { kind: "rate", quality: 3 };
  }

  if (includesAny(input, [...voiceCommandKeywords.applySuggested])) {
    return { kind: "applySuggested" };
  }

  const tutorPrefix = voiceCommandKeywords.tutorPrefix.exec(text.trim());
  if (tutorPrefix) {
    const prompt = tutorPrefix[2]?.trim();
    return prompt ? { kind: "openTutor", prompt } : { kind: "openTutor" };
  }
  if (includesAny(input, [...voiceCommandKeywords.tutorExplain])) {
    return { kind: "openTutor", prompt: text.trim() };
  }

  if (includesAny(input, [...voiceCommandKeywords.closeTutor])) {
    return { kind: "closeTutor" };
  }
  if (includesAny(input, [...voiceCommandKeywords.stopVoice])) {
    return { kind: "stopVoiceMode" };
  }
  if (includesAny(input, [...voiceCommandKeywords.showFront])) {
    return { kind: "showFront" };
  }
  if (includesAny(input, [...voiceCommandKeywords.showBack])) {
    return { kind: "showBack" };
  }
  if (includesAny(input, [...voiceCommandKeywords.flip])) {
    return { kind: "flip" };
  }
  if (includesAny(input, [...voiceCommandKeywords.nextCard])) {
    return { kind: "nextCard" };
  }
  if (includesAny(input, [...voiceCommandKeywords.previousCard])) {
    return { kind: "previousCard" };
  }
  if (includesAny(input, [...voiceCommandKeywords.repeat])) {
    return { kind: "repeat" };
  }

  return null;
}

export function findDeckByVoiceText(
  transcript: string,
  decks: Array<{ _id: string; name: string }>,
) {
  const spoken = normalizeText(transcript);
  if (!spoken) return null;

  let best: { _id: string; name: string; score: number } | null = null;

  for (const deck of decks) {
    const name = normalizeText(deck.name);
    if (!name) continue;
    let score = 0;
    if (spoken === name) score = 100;
    else if (spoken.includes(name)) score = 80;
    else if (name.includes(spoken)) score = 70;
    else {
      const spokenTokens = spoken.split(" ").filter(Boolean);
      const nameTokens = name.split(" ").filter(Boolean);
      const overlap = spokenTokens.filter((token) => nameTokens.includes(token)).length;
      score = overlap;
    }

    if (!best || score > best.score) {
      best = { _id: deck._id, name: deck.name, score };
    }
  }

  if (!best) return null;
  if (best.score >= 70) return best;
  if (best.score >= 2) return best;
  return null;
}
