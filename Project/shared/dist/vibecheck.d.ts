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
export declare const VIBE_QUESTIONS: readonly VibeQuestion[];
export type VibeAnswers = Record<string, number>;
/** Keeps only known questions with a valid option value. Null when nothing valid is left. */
export declare function cleanVibeAnswers(input: unknown): VibeAnswers | null;
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
/**
 * Scores a person against everyone already in a room. Reasons name habits, never
 * people: roommates' individual answers are not revealed.
 */
export declare function vibeMatch(person: VibeAnswers, roommates: VibeAnswers[]): VibeMatch;
/** Longest habit summary kept (written by the profile agent, reviewed by the person). */
export declare const VIBE_SUMMARY_MAX = 300;
/** A one- or two-sentence habits-only summary, trimmed and single-line. Null when empty. */
export declare function cleanVibeSummary(input: unknown): string | null;
