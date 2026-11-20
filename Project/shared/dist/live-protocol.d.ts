import type { VibeAnswers } from './vibecheck.js';
export type LiveClientMessage = {
    type: 'audio';
    data: string;
} | {
    type: 'text';
    text: string;
} | {
    type: 'pause';
};
export type LiveServerMessage = {
    type: 'ready';
} | {
    type: 'audio';
    data: string;
    mimeType: string;
} | {
    type: 'heard';
    text: string;
} | {
    type: 'said';
    text: string;
} | {
    type: 'interrupted';
} | {
    type: 'turn';
} | {
    type: 'habits';
    answers: VibeAnswers;
    summary: string | null;
    done: boolean;
    missing?: string[] | undefined;
} | {
    type: 'error';
    message: string;
} | {
    type: 'end';
    reason?: string | undefined;
};
export interface SafeParseResult<T = unknown> {
    success: boolean;
    data?: T;
}
export interface LiveMessageSchema<T> {
    safeParse(input: unknown): SafeParseResult<T>;
}
/** Structural subset of Zod v4 used to build the live protocol schemas without importing `zod` in @livingplus/shared. */
export interface ZodLike {
    discriminatedUnion(discriminator: string, options: readonly any[]): {
        safeParse(input: unknown): SafeParseResult;
    };
    object(shape: Record<string, any>): any;
    literal(value: string): any;
    string(): any;
    number(): any;
    boolean(): any;
    record(key: any, value: any): any;
    array(element: any): any;
}
export interface LiveProtocol {
    liveClientMessageSchema: LiveMessageSchema<LiveClientMessage>;
    liveServerMessageSchema: LiveMessageSchema<LiveServerMessage>;
    parseLiveClientMessage(raw: unknown): LiveClientMessage | null;
    parseLiveServerMessage(raw: unknown): LiveServerMessage | null;
}
export declare function createLiveProtocol(z: ZodLike): LiveProtocol;
