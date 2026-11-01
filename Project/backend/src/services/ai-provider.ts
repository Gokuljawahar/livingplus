// Meta Model API provider behind a local interface (cookbook §1 + PG OS §7).
// OpenAI-compatible chat-completions over fetch: no new dependencies.
// The user adds META_MODEL_API_KEY to .env; nothing works live until then.

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
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface ModelProvider {
  readonly name: string;
  readonly configured: boolean;
  complete(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ModelResponse>;
}

export const aiEnabled = (): boolean => process.env.ENABLE_AI_ORCHESTRATOR === 'true';

const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function parseImageDataUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('AI_IMAGE_INVALID');
  const match = IMAGE_DATA_URL_RE.exec(value.trim());
  if (!match) throw new Error('AI_IMAGE_INVALID');
  const bytes = Buffer.from(match[2] ?? '', 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('AI_IMAGE_INVALID');
  return `data:${match[1]};base64,${bytes.toString('base64')}`;
}

function normalizeToolCalls(toolCalls: unknown): ProviderToolCall[] | undefined {
  if (!Array.isArray(toolCalls) || !toolCalls.length) return undefined;
  return (toolCalls as any[]).map((call) => {
    const nested = (call as any)?.function?.arguments;
    const flat = (call as any)?.arguments;
    const args = typeof nested === 'string' ? nested
      : typeof flat === 'string' ? flat
      : JSON.stringify(nested ?? flat ?? {});
    return { id: String(call?.id || ''), name: String(call?.name || (call as any)?.function?.name || ''), arguments: args };
  });
}

function toModelContent(content: string | null, images?: string[]): unknown {
  if (!images?.length) return content;
  return [
    { type: 'text', text: content ?? '' },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } }))
  ];
}

export class MetaModelProvider implements ModelProvider {
  readonly name = 'meta-model-api';
  readonly configured: boolean;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = (process.env.META_MODEL_BASE_URL || 'https://api.meta.ai/v1').replace(/\/$/, '');
    this.apiKey = process.env.META_MODEL_API_KEY || '';
    this.model = process.env.META_MODEL_NAME || 'muse-spark-1.3';
    this.configured = aiEnabled() && this.apiKey.length > 0;
  }

  async complete(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ModelResponse> {
    if (!this.configured) throw new Error('AI_ORCHESTRATOR_NOT_CONFIGURED');
    const timeoutMs = Math.max(1000, Number(process.env.MODEL_API_TIMEOUT_MS) || 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(({ role, content, tool_calls, tool_call_id, name, images }) => ({
          role,
          content: toModelContent(content, images),
          ...(tool_calls ? { tool_calls: tool_calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : {}),
          ...(tool_call_id ? { tool_call_id } : {}),
          ...(name ? { name } : {})
        })),
        ...(tools.length ? { tools: tools.map((fn) => ({ type: 'function', function: fn })) } : {})
      })
    });
    } catch (error: any) {
      clearTimeout(timer);
      if (error?.name === 'AbortError') throw new Error('MODEL_API_FAILED: TIMEOUT');
      throw error;
    }
    clearTimeout(timer);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`MODEL_API_FAILED: ${response.status} ${detail.slice(0, 300)}`);
    }
    const data = (await response.json()) as any;
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error('MODEL_API_EMPTY_RESPONSE');
    return { message: { role: 'assistant', content: message.content ?? null, tool_calls: normalizeToolCalls(message.tool_calls) }, usage: data?.usage };
  }
}
