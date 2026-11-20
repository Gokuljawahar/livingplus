import { type VibeAnswers, type VibeMatch } from '@livingplus/shared';
/** How far the matcher may move a score away from the deterministic baseline. */
export declare const MAX_AI_SHIFT = 15;
/** One room the visitor is compared against. */
export interface VibeRoomInput {
    roomId: string;
    roomNumber?: string;
    roommates: VibeAnswers[];
    /** Residents' habit summaries (no names), when they wrote one. */
    summaries?: string[];
}
export interface AiVibeMatch extends VibeMatch {
    /** True when the score came from the AI matcher rather than the baseline. */
    ai: boolean;
    /** One-line verdict from the matcher, present on AI matches only. */
    headline?: string;
}
/** Gemini model name for VibeCheck, or null when no usable model is configured. */
export declare function vibeModelName(): string | null;
/** Whether the AI path is attempted (failures still fall back). */
export declare const vibeAiEnabled: () => boolean;
export declare function vibeAiStatus(): {
    enabled: boolean;
    configured: boolean;
    model: string;
};
export interface VibeProfile {
    answers: VibeAnswers;
    summary: string | null;
    followUp: string | null;
    /** Habits the description did not cover (still unanswered). */
    missing: string[];
}
declare let profilerOverride: ((text: string) => Promise<unknown>) | null;
/** Test hook: replace the profiler agent with a canned answer (null restores). */
export declare function setVibeProfilerForTests(run: typeof profilerOverride): void;
/**
 * Builds a lifestyle profile from free text with the `vibe-profiler` model call.
 * `current` (earlier answers) fills habits the new text does not mention.
 * Throws VIBE_AI_UNAVAILABLE when no model is configured, so callers can offer the quiz.
 */
export declare function buildVibeProfile(text: string, current?: VibeAnswers): Promise<VibeProfile>;
declare let agentTextOverride: ((prompt: string) => Promise<string>) | null;
/** Test hook: replace the matcher agent run with canned model text (null restores). */
export declare function setVibeAgentForTests(run: typeof agentTextOverride): void;
/** The agent's score, held within ±MAX_AI_SHIFT of the deterministic baseline. */
export declare function anchoredScore(aiScore: number, baseline: number): number;
/**
 * Scores one person against every room: AI judgment per room when the agent
 * answers, else the deterministic baseline. Rooms nobody answered stay
 * scoreless and never reach the agent.
 */
export declare function scoreVibeRooms(person: VibeAnswers, rooms: VibeRoomInput[], personSummary?: string | null): Promise<Map<string, AiVibeMatch>>;
export {};
//# sourceMappingURL=vibe-agent.d.ts.map