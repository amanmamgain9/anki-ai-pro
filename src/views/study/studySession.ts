import type {
  DueCard,
  LinearStudyState,
  StudyMode,
  TutorChatMeta,
} from "./studyTypes";

export function resolveStudyMode(
  modeParam: string | null,
  sourceChatId: string | undefined,
  hasLinearResume: boolean,
): StudyMode {
  return modeParam === "linear" || (!modeParam && (!!sourceChatId || hasLinearResume))
    ? "linear"
    : "smart";
}

export function resolveLinearResumeIndex(
  linearCards: DueCard[],
  linearStudyState: LinearStudyState | null | undefined,
) {
  if (linearCards.length === 0) return 0;
  if (!linearStudyState || linearStudyState.completedAt) return 0;

  if (linearStudyState.currentCardId) {
    const exactIndex = linearCards.findIndex((card) => card._id === linearStudyState.currentCardId);
    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  if (linearStudyState.currentIndex > 0) {
    return Math.min(
      Math.max(0, linearStudyState.currentIndex),
      Math.max(0, linearCards.length - 1),
    );
  }

  return 0;
}

export function getRemainingCards(
  isLinearMode: boolean,
  linearResumeReady: boolean,
  linearCardsLength: number,
  linearIndex: number,
  smartDueLength: number | undefined,
) {
  if (isLinearMode) {
    return linearResumeReady ? Math.max(0, linearCardsLength - linearIndex) : 0;
  }
  return smartDueLength ?? 0;
}

export function getProgressPercent(
  total: number | undefined,
  isLinearMode: boolean,
  linearIndex: number,
  reviewed: number | undefined,
  sessionDone: number,
) {
  if (!total) return 0;
  if (isLinearMode) {
    return (Math.min(linearIndex, total) / total) * 100;
  }
  return (((reviewed ?? 0) + sessionDone) / total) * 100;
}

export function resolveTutorChatSelection(
  tutorChats: TutorChatMeta[] | undefined,
  preferredTutorChatId: string | null,
) {
  if (!tutorChats || tutorChats.length === 0) return null;
  if (
    preferredTutorChatId &&
    tutorChats.some((chat) => String(chat._id) === String(preferredTutorChatId))
  ) {
    return preferredTutorChatId;
  }
  return String(tutorChats[0]._id);
}
