export type Deck = { _id: string; name: string };
export type DueCard = { _id: string; front: string; back: string };
export type Card = { _id: string; front: string; back: string };
export type StudyMode = "smart" | "linear";

export type LinearStudyState = {
  deckId: string;
  sourceChatId: string | null;
  currentCardId: string | null;
  currentIndex: number;
  totalCards: number;
  orderFingerprint: string;
  lastSeenAt: number;
  completedAt: number | null;
};

export type BillingState = {
  isActive: boolean;
  plan: "inactive" | "pro" | "pro_plus";
  hasPremiumVoice?: boolean;
  premiumVoiceSource?: "none" | "trial" | "pro_preview" | "pro_plus";
  proPreviewRemainingChars?: number | null;
  trialActive?: boolean;
  trialEndsAt?: number | null;
};

export type HeatCell = { dayStart: number; count: number };

export type HeatmapData = {
  days: HeatCell[];
  startDay: number;
  endDay: number;
  maxCount: number;
  totalReviews: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
};

export type TutorChatMeta = {
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

export type TutorChatDetail = {
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
