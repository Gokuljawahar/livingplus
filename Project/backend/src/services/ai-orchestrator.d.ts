import { type ModelStep, type ModelTurn } from './ai-provider.js';
import { type A2uiMessage } from './a2ui.js';
/** Reply language chosen in the chat panel (buildathon answers Q12: local-language help). */
export declare const ASSISTANT_LANGUAGES: Record<string, string>;
export declare function languageInstruction(language?: string): string;
/**
 * Minimal surface the agent needs from a chat model: one generate() step per
 * turn. The configured Google model satisfies it; tests pass scripted stand-ins.
 */
export interface AgentModel {
    generate?: (turn: ModelTurn) => Promise<ModelStep>;
}
export interface ChatResult {
    reply: string;
    sessionId: string;
    needsConfirmation?: {
        confirmationId: string;
        tool: string;
        preview: string;
    };
    toolCalls?: string[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    } | undefined;
    /** A2UI v1.0 surfaces for the client to render natively (text reply remains the fallback). */
    ui?: A2uiMessage[];
}
export declare function runChat(req: any, model: AgentModel, input: {
    message: string;
    sessionId?: string | undefined;
    confirmationId?: string | undefined;
    cancelConfirmationId?: string | undefined;
    imageDataUrl?: string | undefined;
    language?: string | undefined;
}): Promise<ChatResult>;
//# sourceMappingURL=ai-orchestrator.d.ts.map