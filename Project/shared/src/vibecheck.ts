// VibeCheck: lifestyle compatibility between a person and the residents of a room.
// Lifestyle habits only (sleep, tidiness, noise, guests, kitchen, schedule,
// temperature, lights). Never caste, religion, diet or any identity question.
// Shared by the API (scoring) and the web app (the questions people answer).
// Every phrase reads after both "You both …" and "A roommate tends to …".

export interface VibeOption {
  value: number;
  label: string;
}

export interface VibeQuestion {
  id: string;
  question: string;
  /** How much this habit matters for sharing a room (1 = normal, 2 = high). */
  weight: number;
  options: [VibeOption, VibeOption, VibeOption];
  /** Plain-language phrases for match reasons, one per option value. */
  phrase: [string, string, string];
}

export const VIBE_QUESTIONS: readonly VibeQuestion[] = [
  {
    id: 'sleep', weight: 2, question: 'When do you usually go to sleep?',
    options: [{ value: 0, label: 'Before 11 pm' }, { value: 1, label: '11 pm to 1 am' }, { value: 2, label: 'After 1 am' }],
    phrase: ['sleep before 11 pm', 'sleep around midnight', 'stay up after 1 am']
  },
  {
    id: 'wake', weight: 1, question: 'When do you usually wake up?',
    options: [{ value: 0, label: 'Before 7 am' }, { value: 1, label: '7 to 9 am' }, { value: 2, label: 'After 9 am' }],
    phrase: ['wake up before 7 am', 'wake up between 7 and 9 am', 'wake up after 9 am']
  },
  {
    id: 'tidiness', weight: 2, question: 'How tidy do you keep your space?',
    options: [{ value: 0, label: 'Spotless, every day' }, { value: 1, label: 'Tidy most days' }, { value: 2, label: 'Relaxed about it' }],
    phrase: ['keep things spotless', 'keep things tidy most days', 'keep a relaxed approach to tidiness']
  },
  {
    id: 'noise', weight: 2, question: 'How much noise is normal for you in the room?',
    options: [{ value: 0, label: 'Quiet, headphones on' }, { value: 1, label: 'Some calls or music' }, { value: 2, label: 'Lively: calls, music, chats' }],
    phrase: ['like a quiet room', 'like some calls or music', 'like a lively room']
  },
  {
    id: 'guests', weight: 1, question: 'How often do friends visit you?',
    options: [{ value: 0, label: 'Rarely' }, { value: 1, label: 'Sometimes' }, { value: 2, label: 'Often' }],
    phrase: ['rarely have visitors', 'sometimes have visitors', 'often have visitors']
  },
  {
    id: 'kitchen', weight: 1, question: 'How often do you use the shared kitchen?',
    options: [{ value: 0, label: 'Rarely' }, { value: 1, label: 'A few times a week' }, { value: 2, label: 'Every day' }],
    phrase: ['rarely use the kitchen', 'use the kitchen a few times a week', 'use the kitchen every day']
  },
  {
    id: 'schedule', weight: 1, question: 'When are you usually busy with study or work?',
    options: [{ value: 0, label: 'Daytime' }, { value: 1, label: 'Mixed or flexible' }, { value: 2, label: 'Evenings or nights' }],
    phrase: ['study or work in the daytime', 'have a flexible schedule', 'study or work evenings or nights']
  },
  {
    id: 'cooling', weight: 1, question: 'What room temperature do you like?',
    options: [{ value: 0, label: 'Cool, AC on' }, { value: 1, label: 'In between' }, { value: 2, label: 'Warm, fan only' }],
    phrase: ['like the room cool', 'like a moderate temperature', 'prefer a fan to AC']
  }
];

export type VibeAnswers = Record<string, number>;

/** Keeps only known questions with a valid option value. Null when nothing valid is left. */
export function cleanVibeAnswers(input: unknown): VibeAnswers | null {
  if (!input || typeof input !== 'object') return null;
  const out: VibeAnswers = {};
  for (const question of VIBE_QUESTIONS) {
    const value = Number((input as Record<string, unknown>)[question.id]);
    if (Number.isInteger(value) && value >= 0 && value <= 2) out[question.id] = value;
  }
  return Object.keys(out).length ? out : null;
}

export interface VibeMatch {
  /** 0–100, or null when there is nobody to compare with. */
  score: number | null;
  /** How many roommates' answers were compared. */
  compared: number;
  /** Up to two things in common, in plain language. */
  reasons: string[];
  /** At most one notable difference, in plain language. */
  differences: string[];
}

/** Similarity of two people on the questions both answered: 0–1, or null. */
function pairScore(a: VibeAnswers, b: VibeAnswers): number | null {
  let weighted = 0;
  let total = 0;
  for (const question of VIBE_QUESTIONS) {
    if (a[question.id] === undefined || b[question.id] === undefined) continue;
    weighted += question.weight * (1 - Math.abs(a[question.id]! - b[question.id]!) / 2);
    total += question.weight;
  }
  return total ? weighted / total : null;
}

/**
 * Scores a person against everyone already in a room. Reasons name habits, never
 * people: roommates' individual answers are not revealed.
 */
export function vibeMatch(person: VibeAnswers, roommates: VibeAnswers[]): VibeMatch {
  const scores = roommates.map((mate) => pairScore(person, mate)).filter((s): s is number => s !== null);
  if (!scores.length) return { score: null, compared: 0, reasons: [], differences: [] };
  const score = Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 100);
  const shared: { weight: number; text: string }[] = [];
  const apart: { weight: number; text: string }[] = [];
  for (const question of VIBE_QUESTIONS) {
    const mine = person[question.id];
    if (mine === undefined) continue;
    const theirs = roommates.map((mate) => mate[question.id]).filter((v): v is number => v !== undefined);
    if (!theirs.length) continue;
    if (theirs.every((v) => v === mine)) {
      shared.push({ weight: question.weight, text: `You both ${question.phrase[mine]}` });
    } else if (theirs.some((v) => Math.abs(v - mine) === 2)) {
      const other = theirs.find((v) => Math.abs(v - mine) === 2)!;
      apart.push({ weight: question.weight, text: `A roommate tends to ${question.phrase[other]}` });
    }
  }
  const byWeight = (x: { weight: number }, y: { weight: number }) => y.weight - x.weight;
  return {
    score,
    compared: scores.length,
    reasons: shared.sort(byWeight).slice(0, 2).map((item) => item.text),
    differences: apart.sort(byWeight).slice(0, 1).map((item) => item.text)
  };
}

/** Longest habit summary kept (written by the profile agent, reviewed by the person). */
export const VIBE_SUMMARY_MAX = 300;

/** A one- or two-sentence habits-only summary, trimmed and single-line. Null when empty. */
export function cleanVibeSummary(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const text = input.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, VIBE_SUMMARY_MAX);
  return text || null;
}
