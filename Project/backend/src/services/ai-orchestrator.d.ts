import type { ModelProvider } from './ai-provider.js';
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
}
export declare function runChat(req: any, provider: ModelProvider, input: {
    message: string;
    sessionId?: string | undefined;
    confirmationId?: string | undefined;
    cancelConfirmationId?: string | undefined;
    imageDataUrl?: string | undefined;
}): Promise<ChatResult>;
//# sourceMappingURL=ai-orchestrator.d.ts.map