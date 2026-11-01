export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export interface ChatMessage {
    role: ChatRole;
    content: string | null;
    tool_calls?: ProviderToolCall[] | undefined;
    tool_call_id?: string;
    images?: string[];
    name?: string;
}
export interface ProviderToolCall {
    id: string;
    name: string;
    arguments: string;
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export interface ModelResponse {
    message: ChatMessage;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    };
}
export interface ModelProvider {
    readonly name: string;
    readonly configured: boolean;
    complete(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ModelResponse>;
}
export declare const aiEnabled: () => boolean;
export declare const MAX_IMAGE_BYTES: number;
export declare function parseImageDataUrl(value: unknown): string;
export declare class MetaModelProvider implements ModelProvider {
    readonly name = "meta-model-api";
    readonly configured: boolean;
    private readonly baseUrl;
    private readonly apiKey;
    private readonly model;
    constructor();
    complete(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ModelResponse>;
}
//# sourceMappingURL=ai-provider.d.ts.map