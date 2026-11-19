import { type BaseMessage } from '@langchain/core/messages';
/**
 * Minimal surface the agent needs from a chat model. Every LangChain chat model
 * with tool calling satisfies it; tests pass a scripted stand-in.
 */
export interface AgentModel {
    bindTools?: (tools: any[]) => {
        invoke: (messages: BaseMessage[], config?: any) => Promise<BaseMessage>;
    };
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
}
export declare function runChat(req: any, model: AgentModel, input: {
    message: string;
    sessionId?: string | undefined;
    confirmationId?: string | undefined;
    cancelConfirmationId?: string | undefined;
    imageDataUrl?: string | undefined;
}): Promise<ChatResult>;
//# sourceMappingURL=ai-orchestrator.d.ts.map