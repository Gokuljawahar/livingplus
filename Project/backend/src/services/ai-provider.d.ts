import { type Content, type FunctionDeclaration } from '@google/genai';
import { type ZodType } from 'zod';
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export type ModelPurpose = 'chat' | 'voice';
export declare const aiEnabled: () => boolean;
export interface ModelConfig {
    /** "google:<model>" id, e.g. "google:gemini-4-hydrogen". */
    model: string;
    /** Generation options from AI_MODEL_OPTIONS, passed through untouched. */
    options: Record<string, unknown>;
}
/** Reads the model configuration for a purpose from the environment. */
export declare function modelConfig(purpose?: ModelPurpose): ModelConfig;
/** "google:gemini-4-hydrogen" -> { provider: "google", name: "gemini-4-hydrogen" }. */
export declare function describeModel(model: string): {
    provider: string;
    name: string;
};
export interface GoogleAccess {
    vertexai: boolean;
    project?: string;
    location?: string;
    apiKey?: string;
}
/** Project id from Application Default Credentials (cached; Cloud Run's metadata server answers). */
export declare function adcProjectId(): Promise<string>;
/** Resolves how to reach Google: Vertex AI or a Gemini API key. Throws AI_MODEL_INIT_FAILED when neither works. */
export declare function resolveGoogleAuth(): Promise<GoogleAccess>;
/** Validated Gemini model name for a purpose. Throws AI_ORCHESTRATOR_NOT_CONFIGURED / AI_MODEL_INIT_FAILED. */
export declare function googleModelName(purpose?: ModelPurpose): string;
/** Tool catalogue entries in the shape the Gemini API wants them. */
export declare function toFunctionDeclarations(tools: ToolDefinition[]): FunctionDeclaration[];
export interface ModelFunctionCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
}
export interface ModelInvalidCall {
    id: string;
    name: string;
    error: string;
}
/** One model step: system instruction, history and tools in. */
export interface ModelTurn {
    system: string;
    contents: Content[];
    tools: ToolDefinition[];
    timeoutMs: number;
}
/** ... text, function calls and usage out, plus the verbatim model turn for history (echoes thought signatures). */
export interface ModelStep {
    text: string;
    content: Content;
    calls: ModelFunctionCall[];
    invalid: ModelInvalidCall[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    };
}
export interface GoogleChatModel {
    backend: 'gemini-api' | 'vertex-ai';
    model: string;
    generate: (turn: ModelTurn) => Promise<ModelStep>;
}
/**
 * Builds the configured Google chat model. Throws AI_ORCHESTRATOR_NOT_CONFIGURED
 * when the assistant is off or no model is set, and AI_MODEL_INIT_FAILED when the
 * provider or credentials are unusable. Builds a client only; no network calls.
 */
export declare function createChatModel(purpose?: ModelPurpose): Promise<GoogleChatModel>;
/**
 * One structured Gemini call: instruction and parts in, an answer matching
 * `schema` out (the schema is sent as the response JSON schema and checked
 * again on return). `model` overrides the configured model name. Rejects with
 * MODEL_API_FAILED on timeout, an empty answer or one that does not parse.
 */
export declare function generateStructured<T>(options: {
    system: string;
    parts: Array<Record<string, unknown>>;
    schema: ZodType<T>;
    model?: string;
}): Promise<T>;
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