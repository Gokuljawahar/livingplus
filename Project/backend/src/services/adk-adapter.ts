// Adapter bridging LivingPlus's Gemini SDK model (ai-provider) to Google ADK's
// BaseLlm. Isolated here so ADK-specific quirks live in one well-tested module.
import { BaseLlm, type LlmRequest, type LlmResponse } from '@google/adk';
import type { Content } from '@google/genai';
import { modelFailure, modelTimeoutMs, type ModelStep, type ModelTurn, type ToolDefinition } from './ai-provider.js';

/** Marks a model tool call whose arguments could not be parsed (the model can retry). */
export const INVALID_ARGS = '__invalid_args__';

export interface AdkAgentModel {
  generate?: (turn: ModelTurn) => Promise<ModelStep>;
}

/**
 * Strips standalone `{ text: '' }` parts before handing content to `@google/adk` (v2.4.0).
 *
 * Why this exists: ADK 2.4.0 inspects `parts[0]?.text` in several event/history helpers and
 * treats an event whose leading part is an empty text string as empty, dropping or orphaning
 * `functionCall` parts that follow it. There is no ADK option to disable this behavior.
 * If every part is empty text, the original array is returned untouched so callers still receive
 * a valid turn.
 */
export function stripEmptyTextParts<T extends { text?: string | undefined }>(parts: T[]): T[] {
  const kept = parts.filter((part) => !(part.text === '' && Object.keys(part).length === 1));
  return kept.length ? kept : parts;
}

export async function generateModelStep(
  model: AdkAgentModel,
  system: string,
  contents: Content[],
  tools: ToolDefinition[]
): Promise<ModelStep> {
  if (typeof model.generate !== 'function') {
    throw new Error('AI_MODEL_INIT_FAILED: the configured model does not support tool calling');
  }
  try {
    return await model.generate({ system, contents, tools, timeoutMs: modelTimeoutMs() });
  } catch (error: unknown) {
    throw modelFailure(error);
  }
}

/**
 * Wraps our Gemini SDK model (or a test's scripted model) as an ADK BaseLlm.
 * ADK owns the loop; this answers each model call with one generate() step,
 * declaring only the caller role's tools.
 */
export class AgentModelLlm extends BaseLlm {
  constructor(
    private readonly inner: AdkAgentModel,
    private readonly declared: ToolDefinition[],
    private readonly onUsage: (usage: NonNullable<ModelStep['usage']>) => void
  ) {
    super({ model: 'livingplus-gemini' });
  }

  async *generateContentAsync(request: LlmRequest): AsyncGenerator<LlmResponse, void> {
    const instruction = request.config?.systemInstruction as { parts?: Array<{ text?: string }> } | string | undefined;
    const system = typeof instruction === 'string'
      ? instruction
      : (instruction?.parts ?? []).map((part) => part?.text ?? '').join('\n');
    const step = await generateModelStep(this.inner, system, request.contents, this.declared);
    if (step.usage) this.onUsage(step.usage);
    // Calls the provider could not parse go back to the model as errors (it can retry).
    const invalid = step.invalid.map((bad) => ({
      functionCall: { id: bad.id, name: bad.name || 'search_properties', args: { [INVALID_ARGS]: bad.error } }
    }));
    const parts = [...stripEmptyTextParts(step.content.parts ?? []), ...invalid];
    yield {
      content: { role: 'model', parts: parts.length ? parts : [{ text: step.text }] },
      ...(step.usage ? { usageMetadata: { promptTokenCount: step.usage.prompt_tokens, candidatesTokenCount: step.usage.completion_tokens } } : {})
    } as LlmResponse;
  }

  async connect(): Promise<never> {
    throw new Error('Live connections are not used by the LivingPlus assistant');
  }
}
