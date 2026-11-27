import { cleanVibeAnswers, VIBE_QUESTIONS, type VibeAnswers, type VibeQuestion } from '@livingplus/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Sleep, tidiness and noise matter most; matching needs at least high-weight questions from the active catalog. */
export const KEY_HABITS = VIBE_QUESTIONS.filter((question) => question.weight > 1).map((question) => question.id);
export const hasKeyHabits = (answers: VibeAnswers, questions: readonly VibeQuestion[] = VIBE_QUESTIONS): boolean =>
  questions.filter((q) => q.weight > 1).every((q) => answers[q.id] !== undefined);

const KEY = 'vibeAnswers';
const SUMMARY_KEY = 'vibeSummary';

interface VibeState {
  answers: VibeAnswers;
  summary: string;
  setAnswers: (answers: VibeAnswers) => void;
  setSummary: (summary: string) => void;
}

export const useVibeStore = create<VibeState>()(
  persist(
    (set) => ({
      answers: {},
      summary: '',
      setAnswers: (answers) => set({ answers: cleanVibeAnswers(answers) ?? {} }),
      setSummary: (summary) => set({ summary })
    }),
    {
      name: 'lp_vibe_store_v1',
      storage: createJSONStorage(() => localStorage)
    }
  )
);

/** A visitor's VibeCheck answers, kept on this device so they can compare several PGs. */
export function loadVibeAnswers(): VibeAnswers {
  const fromStore = useVibeStore.getState().answers;
  if (Object.keys(fromStore).length > 0) return fromStore;
  try {
    return cleanVibeAnswers(JSON.parse(localStorage.getItem(KEY) || 'null')) ?? {};
  } catch {
    return {};
  }
}

export function saveVibeAnswers(answers: VibeAnswers): void {
  const cleaned = cleanVibeAnswers(answers) ?? {};
  useVibeStore.getState().setAnswers(cleaned);
  try {
    localStorage.setItem(KEY, JSON.stringify(cleaned));
  } catch {
    /* storage unavailable */
  }
}

/** The visitor's VibeCheck habit summary (from the profile agent), on this device. */
export function loadVibeSummary(): string {
  const fromStore = useVibeStore.getState().summary;
  if (fromStore) return fromStore;
  try {
    return localStorage.getItem(SUMMARY_KEY) || '';
  } catch {
    return '';
  }
}

export function saveVibeSummary(summary: string): void {
  useVibeStore.getState().setSummary(summary);
  try {
    if (summary) localStorage.setItem(SUMMARY_KEY, summary);
    else localStorage.removeItem(SUMMARY_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function _resetVibeStoreForTests(): void {
  useVibeStore.setState({ answers: {}, summary: '' });
}
