import { cleanVibeAnswers, VIBE_QUESTIONS, type VibeAnswers } from '@livingplus/shared';

/** Sleep, tidiness and noise matter most; matching needs at least these. */
export const KEY_HABITS = VIBE_QUESTIONS.filter((question) => question.weight > 1).map((question) => question.id);
export const hasKeyHabits = (answers: VibeAnswers): boolean => KEY_HABITS.every((id) => answers[id] !== undefined);

const KEY = 'vibeAnswers';

/** A visitor's VibeCheck answers, kept on this device so they can compare several PGs. */
export function loadVibeAnswers(): VibeAnswers {
  try {
    return cleanVibeAnswers(JSON.parse(localStorage.getItem(KEY) || 'null')) ?? {};
  } catch {
    return {};
  }
}

export function saveVibeAnswers(answers: VibeAnswers): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    /* storage unavailable: answers stay for this visit only */
  }
}

const SUMMARY_KEY = 'vibeSummary';

/** The visitor's VibeCheck habit summary (from the profile agent), on this device. */
export function loadVibeSummary(): string {
  try {
    return localStorage.getItem(SUMMARY_KEY) || '';
  } catch {
    return '';
  }
}

export function saveVibeSummary(summary: string): void {
  try {
    if (summary) localStorage.setItem(SUMMARY_KEY, summary);
    else localStorage.removeItem(SUMMARY_KEY);
  } catch {
    /* storage unavailable */
  }
}
