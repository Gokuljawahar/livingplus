import type { IncomingMessage, Server } from 'http';
import { type VibeAnswers } from '@livingplus/shared';
export declare const VIBE_LIVE_PATH = "/api/pg/vibecheck/live";
export declare const vibeLiveEnabled: () => boolean;
/** Cleans one record_habits call and merges it into what is already known. */
export declare function applyHabitCall(known: VibeAnswers, args: unknown, skip?: string[]): {
    answers: VibeAnswers;
    summary: string | null;
    done: boolean;
    missing: string[];
};
/** Same-site browsers only (any origin in development). */
export declare function originAllowed(req: IncomingMessage): boolean;
/** Attaches the live VibeCheck WebSocket endpoint to the HTTP server. */
export declare function attachVibeLive(server: Server): void;
//# sourceMappingURL=vibe-live.d.ts.map