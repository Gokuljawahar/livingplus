import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
/** Session history entry persisted between chat turns (text only). */
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string | null;
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export type ModelPurpose = 'chat' | 'voice';
export declare const aiEnabled: () => boolean;
export interface ModelConfig {
    /** LangChain "provider:model" id, e.g. "google:gemini-3.8-flash". */
    model: string;
    /** Provider-specific constructor options, passed through untouched. */
    options: Record<string, unknown>;
}
/** Reads the model configuration for a purpose from the environment. */
export declare function modelConfig(purpose?: ModelPurpose): ModelConfig;
/** "google:gemini-3.8-flash" -> { provider: "google", name: "gemini-3.8-flash" }. */
export declare function describeModel(model: string): {
    provider: string;
    name: string;
};
/**
 * Builds the configured LangChain chat model. Throws AI_ORCHESTRATOR_NOT_CONFIGURED
 * when the assistant is off or no model is set, and AI_MODEL_INIT_FAILED when the
 * provider package is missing or rejects the configuration.
 */
export declare function createChatModel(purpose?: ModelPurpose): Promise<BaseChatModel>;
export interface ModelStatus {
    enabled: boolean;
    configured: boolean;
    provider: string;
    model: string;
    error?: string;
}
/** Reports whether the configured model can be constructed, without calling it. */
export declare function modelStatus(): Promise<ModelStatus>;
/** Normalizes provider failures to the MODEL_API_FAILED code the API maps to 502. */
export declare function modelFailure(error: any): Error;
export declare const modelTimeoutMs: () => number;
export declare const MAX_IMAGE_BYTES: number;
export declare function parseImageDataUrl(value: unknown): string;
//# sourceMappingURL=ai-provider.d.ts.map