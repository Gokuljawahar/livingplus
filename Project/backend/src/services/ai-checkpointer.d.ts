import type { Content } from '@google/genai';
/** A sensitive call the thread is paused on, bound to who may confirm it. */
export interface PendingAction {
    nonce: string;
    callId: string;
    tool: string;
    args: any;
    preview: string;
    /** Later calls from the same model turn, answered once this one resolves. */
    laterCalls: Array<{
        id: string;
        name: string;
        args: Record<string, unknown>;
    }>;
    userKey: string;
    role: string;
    propertyId: string | null;
    expiresAt: number;
}
export interface ChatThreadState {
    history: Content[];
    pending: PendingAction | null;
}
/** Reads a thread's durable state; missing or corrupt rows start empty. */
export declare function loadThreadState(sessionId: string): Promise<ChatThreadState>;
/** Persists a thread's durable state. */
export declare function saveThreadState(sessionId: string, state: ChatThreadState): Promise<void>;
/** No pools to drain; state lives in PostgreSQL behind Prisma. Kept for shutdown callers. */
export declare function closeCheckpointer(): Promise<void>;
//# sourceMappingURL=ai-checkpointer.d.ts.map