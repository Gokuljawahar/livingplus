// Google chat models (PG OS §7), via the @google/genai SDK.
//
// The model is chosen entirely by configuration: AI_MODEL is
// "google:<model>", e.g. "google:gemini-4-hydrogen" (a bare model name means
// google too). Credentials resolve in order: Vertex AI when
// GOOGLE_GENAI_USE_ENTERPRISE=true (GOOGLE_CLOUD_PROJECT, defaulting to the
// ADC project, plus GOOGLE_CLOUD_LOCATION, authenticating with Application
// Default Credentials — the Cloud Run service account), else a Gemini API key
// from GOOGLE_GENAI_API_KEY, GOOGLE_API_KEY or GEMINI_API_KEY.
//
// One generate() call is one model step: system instruction, history and the
// role's function declarations in; text, function calls and usage out. The
// assistant's agent loop (Google ADK, ai-orchestrator) runs around it.
//
// generateStructured() is the plain SDK path for one-shot jobs (KYC reading,
// VibeCheck profile and matching): one call, JSON out, checked with Zod.
import { GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentConfig, type GenerateContentResponse, type Schema } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { z, type ZodType } from 'zod';
import { logger } from '../utils/logger.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ModelPurpose = 'chat' | 'voice';

export const aiEnabled = (): boolean => process.env.ENABLE_AI_ORCHESTRATOR === 'true';

export interface ModelConfig {
  /** "google:<model>" id, e.g. "google:gemini-4-hydrogen". */
  model: string;
  /** Generation options from AI_MODEL_OPTIONS, passed through untouched. */
  options: Record<string, unknown>;
}

function parseOptions(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI_MODEL_OPTIONS must be a JSON object');
  return parsed;
}

/** Reads the model configuration for a purpose from the environment. */
export function modelConfig(purpose: ModelPurpose = 'chat'): ModelConfig {
  const chatModel = (process.env.AI_MODEL || '').trim();
  const model = purpose === 'voice' ? (process.env.AI_VOICE_MODEL || '').trim() || chatModel : chatModel;
  return { model, options: parseOptions(process.env.AI_MODEL_OPTIONS) };
}

/** "google:gemini-4-hydrogen" -> { provider: "google", name: "gemini-4-hydrogen" }. */
export function describeModel(model: string): { provider: string; name: string } {
  const at = model.indexOf(':');
  return at > 0 ? { provider: model.slice(0, at), name: model.slice(at + 1) } : { provider: '', name: model };
}

export interface GoogleAccess {
  vertexai: boolean;
  project?: string;
  location?: string;
  apiKey?: string;
}

let adcProject: Promise<string> | null = null;

/** Project id from Application Default Credentials (cached; Cloud Run's metadata server answers). */
export function adcProjectId(): Promise<string> {
  if (!adcProject) {
    adcProject = new GoogleAuth().getProjectId().catch((error) => {
      adcProject = null;
      throw error;
    });
  }
  return adcProject;
}

/** Resolves how to reach Google: Vertex AI or a Gemini API key. Throws AI_MODEL_INIT_FAILED when neither works. */
export async function resolveGoogleAuth(): Promise<GoogleAccess> {
  const enterprise = process.env.GOOGLE_GENAI_USE_ENTERPRISE ?? process.env.GOOGLE_GENAI_USE_VERTEXAI;
  if (['true', '1'].includes((enterprise || '').toLowerCase())) {
    const location = (process.env.GOOGLE_CLOUD_LOCATION || '').trim();
    if (!location) throw new Error('AI_MODEL_INIT_FAILED: Vertex AI needs GOOGLE_CLOUD_LOCATION');
    let project = (process.env.GOOGLE_CLOUD_PROJECT || '').trim();
    if (!project) {
      try {
        project = await adcProjectId();
      } catch {
        project = '';
      }
      if (!project) throw new Error('AI_MODEL_INIT_FAILED: Vertex AI needs GOOGLE_CLOUD_PROJECT (or Application Default Credentials with a project)');
    }
    return { vertexai: true, project, location };
  }
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('AI_MODEL_INIT_FAILED: set GOOGLE_API_KEY, or GOOGLE_GENAI_USE_ENTERPRISE=true with GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION for Vertex AI');
  }
  return { vertexai: false, apiKey };
}

function validatedModelConfig(purpose: ModelPurpose): { name: string; options: Record<string, unknown> } {
  if (!aiEnabled()) throw new Error('AI_ORCHESTRATOR_NOT_CONFIGURED');
  let config: ModelConfig;
  try {
    config = modelConfig(purpose);
  } catch (error: any) {
    throw new Error(`AI_MODEL_INIT_FAILED: ${String(error?.message || error)}`);
  }
  if (!config.model) throw new Error('AI_ORCHESTRATOR_NOT_CONFIGURED');
  const { provider, name } = describeModel(config.model);
  if (!name) throw new Error('AI_MODEL_INIT_FAILED: AI_MODEL has no model name');
  if (provider && provider !== 'google') throw new Error(`AI_MODEL_INIT_FAILED: unsupported provider "${provider}" (only google models are supported)`);
  return { name, options: config.options };
}

/** Validated Gemini model name for a purpose. Throws AI_ORCHESTRATOR_NOT_CONFIGURED / AI_MODEL_INIT_FAILED. */
export function googleModelName(purpose: ModelPurpose = 'chat'): string {
  return validatedModelConfig(purpose).name;
}

/** Uppercase JSON-schema types for Gemini function declarations (the API's OpenAPI subset uses OBJECT/STRING/...). */
function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = key === 'type' && typeof value === 'string' ? value.toUpperCase() : geminiSchema(value);
  }
  return out;
}

/** Tool catalogue entries in the shape the Gemini API wants them. */
export function toFunctionDeclarations(tools: ToolDefinition[]): FunctionDeclaration[] {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: geminiSchema(tool.parameters) as Schema }));
}

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
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function toModelStep(response: GenerateContentResponse): ModelStep {
  const content = response.candidates?.[0]?.content;
  const parts = content?.parts ?? [];
  const text = parts.filter((part) => typeof part.text === 'string').map((part) => part.text as string).join('');
  const calls: ModelFunctionCall[] = [];
  const invalid: ModelInvalidCall[] = [];
  parts.forEach((part, index) => {
    const call = part.functionCall;
    if (!call) return;
    const id = call.id || `call_${index}`;
    if (!call.name) {
      invalid.push({ id, name: '', error: 'the model returned a function call without a name' });
      return;
    }
    calls.push({ id, name: call.name, args: (call.args && typeof call.args === 'object' ? call.args : {}) as Record<string, unknown> });
  });
  const step: ModelStep = {
    text,
    content: content ? { role: content.role ?? 'model', parts } : { role: 'model', parts: [{ text }] },
    calls,
    invalid
  };
  const usage = response.usageMetadata;
  if (usage && (usage.promptTokenCount !== undefined || usage.candidatesTokenCount !== undefined)) {
    step.usage = {
      ...(usage.promptTokenCount !== undefined ? { prompt_tokens: usage.promptTokenCount } : {}),
      ...(usage.candidatesTokenCount !== undefined ? { completion_tokens: usage.candidatesTokenCount } : {})
    };
  }
  return step;
}

export interface GoogleChatModel {
  backend: 'gemini-api' | 'vertex-ai';
  model: string;
  generate: (turn: ModelTurn) => Promise<ModelStep>;
}

/**
 * When Gemini is out of capacity (HTTP 429 "resource exhausted" or 503
 * "unavailable") or too slow to answer, one retry goes to a fallback model so
 * people don't see an error or a long spinner. Any other failure is not
 * retried: it is a real problem to surface.
 */
export function isCapacityError(error: any): boolean {
  const status = Number(error?.status ?? error?.code ?? error?.response?.status);
  const text = String(error?.message || error || '');
  return status === 429 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|\b429\b|\b503\b/i.test(text);
}

/** The fallback model name ("google:" prefix allowed), or null when it is switched off or the same as the primary. */
export function fallbackModelName(primary: string): string | null {
  const configured = (process.env.AI_FALLBACK_MODEL ?? 'gemini-3.5-flash-lite').trim();
  if (!configured || configured === 'none') return null;
  const name = configured.startsWith('google:') ? configured.slice('google:'.length) : configured;
  return name === primary ? null : name;
}

export const isTimeoutError = (error: any): boolean =>
  error?.name === 'AbortError' || error?.name === 'TimeoutError' || /abort|timed? ?out|MODEL_API_FAILED: TIMEOUT/i.test(String(error?.message || error || ''));

/** How long the main model gets before the fallback takes over (when there is one). */
export const primaryPatienceMs = (): number => Math.max(1000, Number(process.env.AI_PRIMARY_PATIENCE_MS) || 12_000);
const MIN_FALLBACK_MS = 4_000;

/**
 * Runs `call` on the primary model within `budgetMs`. With a fallback model
 * configured, the primary gets at most primaryPatienceMs() of that budget; on a
 * capacity error or a timeout the rest of the budget goes to one fallback try.
 */
async function withFallback<T>(primary: string, budgetMs: number, call: (model: string, timeoutMs: number) => Promise<T>): Promise<T> {
  const fallback = fallbackModelName(primary);
  const started = Date.now();
  try {
    return await call(primary, fallback ? Math.min(budgetMs, primaryPatienceMs()) : budgetMs);
  } catch (error) {
    const remaining = budgetMs - (Date.now() - started);
    if (!fallback || remaining < MIN_FALLBACK_MS || !(isCapacityError(error) || isTimeoutError(error))) throw error;
    logger.warn({ primary, fallback, reason: isTimeoutError(error) ? 'slow' : 'capacity' }, 'Gemini busy; retrying on the fallback model');
    return call(fallback, remaining);
  }
}

/**
 * Builds the configured Google chat model. Throws AI_ORCHESTRATOR_NOT_CONFIGURED
 * when the assistant is off or no model is set, and AI_MODEL_INIT_FAILED when the
 * provider or credentials are unusable. Builds a client only; no network calls.
 */
export async function createChatModel(purpose: ModelPurpose = 'chat'): Promise<GoogleChatModel> {
  const { name, options } = validatedModelConfig(purpose);
  const auth = await resolveGoogleAuth();
  const client = await googleClient();
  const backend = auth.vertexai ? 'vertex-ai' : 'gemini-api';
  return {
    backend,
    model: name,
    generate: async (turn: ModelTurn): Promise<ModelStep> => withFallback(name, turn.timeoutMs, async (model, timeoutMs) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const config: GenerateContentConfig = { ...(options as GenerateContentConfig), abortSignal: controller.signal };
        if (turn.system) config.systemInstruction = { parts: [{ text: turn.system }] };
        if (turn.tools.length) config.tools = [{ functionDeclarations: toFunctionDeclarations(turn.tools) }];
        const response = await client.models.generateContent({ model, contents: turn.contents, config });
        return toModelStep(response);
      } finally {
        clearTimeout(timer);
      }
    })
  };
}

async function googleClient(): Promise<GoogleGenAI> {
  const auth = await resolveGoogleAuth();
  return auth.vertexai
    ? new GoogleGenAI({ vertexai: true, project: auth.project!, location: auth.location! })
    : new GoogleGenAI({ apiKey: auth.apiKey! });
}

const stripFences = (text: string) => text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

/**
 * One structured Gemini call: instruction and parts in, an answer matching
 * `schema` out (the schema is sent as the response JSON schema and checked
 * again on return). `model` overrides the configured model name. Rejects with
 * MODEL_API_FAILED on timeout, an empty answer or one that does not parse.
 */
export async function generateStructured<T>(options: {
  system: string;
  parts: Array<Record<string, unknown>>;
  schema: ZodType<T>;
  model?: string;
  /** Shorter limit for calls a person is waiting on, when the caller has a non-AI fallback. */
  timeoutMs?: number;
}): Promise<T> {
  const { name, options: generation } = validatedModelConfig('chat');
  const client = await googleClient();
  try {
    const budget = Math.min(modelTimeoutMs(), options.timeoutMs ?? Infinity);
    return await withFallback(options.model || name, budget, (model, timeoutMs) => structuredCall(client, model, generation, { ...options, timeoutMs }));
  } catch (error: any) {
    throw modelFailure(error);
  }
}

async function structuredCall<T>(
  client: GoogleGenAI,
  model: string,
  generation: Record<string, unknown>,
  options: { system: string; parts: Array<Record<string, unknown>>; schema: ZodType<T>; timeoutMs?: number }
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? modelTimeoutMs());
  try {
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: options.parts as any }],
      config: {
        ...(generation as GenerateContentConfig),
        systemInstruction: { parts: [{ text: options.system }] },
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(options.schema as any, { io: 'input' }),
        abortSignal: controller.signal
      }
    });
    const text = response.text ?? '';
    if (!text.trim()) throw new Error('MODEL_API_FAILED: EMPTY_ANSWER');
    return options.schema.parse(JSON.parse(stripFences(text)));
  } finally {
    clearTimeout(timer);
  }
}

export interface ModelStatus {
  enabled: boolean;
  configured: boolean;
  provider: string;
  model: string;
  error?: string;
}

/** Reports whether the configured model can be constructed, without calling it. */
export async function modelStatus(): Promise<ModelStatus> {
  const enabled = aiEnabled();
  let model = '';
  try {
    model = modelConfig('chat').model;
  } catch {
    /* reported below */
  }
  const { provider, name } = describeModel(model);
  if (!enabled || !model) return { enabled, configured: false, provider, model: name };
  try {
    await createChatModel('chat');
    return { enabled, configured: true, provider, model: name };
  } catch (error: any) {
    return { enabled, configured: false, provider, model: name, error: String(error?.message || error).slice(0, 200) };
  }
}

/** Normalizes provider failures to the MODEL_API_FAILED code the API maps to 502. */
export function modelFailure(error: any): Error {
  const message = String(error?.message || error);
  if (message.startsWith('MODEL_API_FAILED')) return error;
  const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError' || /abort|timed? ?out/i.test(message);
  return new Error(timedOut ? 'MODEL_API_FAILED: TIMEOUT' : `MODEL_API_FAILED: ${message.slice(0, 300)}`);
}

export const modelTimeoutMs = (): number => Math.max(1000, Number(process.env.MODEL_API_TIMEOUT_MS) || 30000);

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
