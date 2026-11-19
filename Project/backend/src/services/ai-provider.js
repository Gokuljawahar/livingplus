// Provider-agnostic chat model factory (PG OS §7), built on LangChain.
//
// The model is chosen entirely by configuration: AI_MODEL is a LangChain
// "provider:model" string such as "google:gemini-3.8-flash",
// "openai:gpt-5-mini" or "anthropic:claude-sonnet-5-5". Each provider reads its
// own credentials from its usual environment variables (GOOGLE_API_KEY,
// OPENAI_API_KEY, ANTHROPIC_API_KEY, Google Cloud ADC, ...). Switching provider
// means installing its @langchain/* package and changing AI_MODEL: no code.
import { initChatModel } from 'langchain';
export const aiEnabled = () => process.env.ENABLE_AI_ORCHESTRATOR === 'true';
function parseOptions(raw) {
    if (!raw?.trim())
        return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('AI_MODEL_OPTIONS must be a JSON object');
    return parsed;
}
/** Reads the model configuration for a purpose from the environment. */
export function modelConfig(purpose = 'chat') {
    const chatModel = (process.env.AI_MODEL || '').trim();
    const model = purpose === 'voice' ? (process.env.AI_VOICE_MODEL || '').trim() || chatModel : chatModel;
    return { model, options: parseOptions(process.env.AI_MODEL_OPTIONS) };
}
/** "google:gemini-3.8-flash" -> { provider: "google", name: "gemini-3.8-flash" }. */
export function describeModel(model) {
    const at = model.indexOf(':');
    return at > 0 ? { provider: model.slice(0, at), name: model.slice(at + 1) } : { provider: '', name: model };
}
/**
 * Builds the configured LangChain chat model. Throws AI_ORCHESTRATOR_NOT_CONFIGURED
 * when the assistant is off or no model is set, and AI_MODEL_INIT_FAILED when the
 * provider package is missing or rejects the configuration.
 */
export async function createChatModel(purpose = 'chat') {
    if (!aiEnabled())
        throw new Error('AI_ORCHESTRATOR_NOT_CONFIGURED');
    let config;
    try {
        config = modelConfig(purpose);
    }
    catch (error) {
        throw new Error(`AI_MODEL_INIT_FAILED: ${String(error?.message || error)}`);
    }
    if (!config.model)
        throw new Error('AI_ORCHESTRATOR_NOT_CONFIGURED');
    try {
        return (await initChatModel(config.model, { maxRetries: 1, ...config.options }));
    }
    catch (error) {
        throw new Error(`AI_MODEL_INIT_FAILED: ${String(error?.message || error)}`);
    }
}
/** Reports whether the configured model can be constructed, without calling it. */
export async function modelStatus() {
    const enabled = aiEnabled();
    let model = '';
    try {
        model = modelConfig('chat').model;
    }
    catch {
        /* reported below */
    }
    const { provider, name } = describeModel(model);
    if (!enabled || !model)
        return { enabled, configured: false, provider, model: name };
    try {
        await createChatModel('chat');
        return { enabled, configured: true, provider, model: name };
    }
    catch (error) {
        return { enabled, configured: false, provider, model: name, error: String(error?.message || error).slice(0, 200) };
    }
}
/** Normalizes provider failures to the MODEL_API_FAILED code the API maps to 502. */
export function modelFailure(error) {
    const message = String(error?.message || error);
    if (message.startsWith('MODEL_API_FAILED'))
        return error;
    const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError' || /abort|timed? ?out/i.test(message);
    return new Error(timedOut ? 'MODEL_API_FAILED: TIMEOUT' : `MODEL_API_FAILED: ${message.slice(0, 300)}`);
}
export const modelTimeoutMs = () => Math.max(1000, Number(process.env.MODEL_API_TIMEOUT_MS) || 30000);
const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export function parseImageDataUrl(value) {
    if (typeof value !== 'string')
        throw new Error('AI_IMAGE_INVALID');
    const match = IMAGE_DATA_URL_RE.exec(value.trim());
    if (!match)
        throw new Error('AI_IMAGE_INVALID');
    const bytes = Buffer.from(match[2] ?? '', 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
        throw new Error('AI_IMAGE_INVALID');
    return `data:${match[1]};base64,${bytes.toString('base64')}`;
}
//# sourceMappingURL=ai-provider.js.map