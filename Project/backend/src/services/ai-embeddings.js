// Google text embeddings via the @google/genai SDK.
// AI_EMBEDDING_MODEL names the model: "google-genai:gemini-embedding-001"
// (Gemini API key), "google-vertexai:gemini-embedding-001" (Vertex AI with the
// service account, no key: the Cloud Run default) or "google:<model>" (the
// key when set, else Vertex AI). Vertex AI needs GOOGLE_CLOUD_LOCATION and a
// project from GOOGLE_CLOUD_PROJECT or Application Default Credentials.
// AI_EMBEDDING_OPTIONS passes extra options as JSON (outputDimensionality).
// Vectors default to 768 dimensions.
import { GoogleGenAI } from '@google/genai';
import { adcProjectId } from './ai-provider.js';
export function embeddingModelId() {
    return (process.env.AI_EMBEDDING_MODEL || '').trim();
}
let override = null;
/** Test hook: replace the embeddings provider (null restores). */
export function setEmbeddingsForTests(factory) {
    override = factory;
}
const cache = new Map();
/** Builds the configured embeddings model, or throws EMBEDDINGS_NOT_CONFIGURED / EMBEDDINGS_INIT_FAILED. */
export async function createEmbeddings(purpose) {
    if (override)
        return override(purpose);
    const id = embeddingModelId();
    const at = id.indexOf(':');
    if (at <= 0)
        throw new Error('EMBEDDINGS_NOT_CONFIGURED');
    const provider = id.slice(0, at);
    const model = id.slice(at + 1);
    if (!['google', 'google-genai', 'google-vertexai'].includes(provider)) {
        throw new Error(`EMBEDDINGS_INIT_FAILED: unsupported provider "${provider}" (supported: google-genai, google-vertexai)`);
    }
    if (!model)
        throw new Error('EMBEDDINGS_INIT_FAILED: AI_EMBEDDING_MODEL has no model name');
    const cacheKey = `${id}|${purpose}|${process.env.AI_EMBEDDING_OPTIONS || ''}`;
    const cached = cache.get(cacheKey);
    if (cached)
        return cached;
    let options;
    try {
        options = JSON.parse(process.env.AI_EMBEDDING_OPTIONS || '{}');
    }
    catch {
        throw new Error('EMBEDDINGS_INIT_FAILED: AI_EMBEDDING_OPTIONS must be JSON');
    }
    const taskType = purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
    const dimensions = Number(options.outputDimensionality) > 0 ? Math.floor(Number(options.outputDimensionality)) : 768;
    const key = process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    const vertexai = provider === 'google-vertexai' || (!key && provider === 'google');
    if (!vertexai && !key)
        throw new Error('EMBEDDINGS_INIT_FAILED: set GOOGLE_API_KEY for google-genai embeddings');
    const location = (process.env.GOOGLE_CLOUD_LOCATION || '').trim();
    if (vertexai && !location)
        throw new Error('EMBEDDINGS_INIT_FAILED: Vertex AI needs GOOGLE_CLOUD_LOCATION');
    let project = (process.env.GOOGLE_CLOUD_PROJECT || '').trim();
    // The client is built lazily: constructing the model never touches the
    // network, so ADC project resolution waits for the first embedding.
    let client = vertexai ? null : new GoogleGenAI({ apiKey: key });
    const ensureClient = async () => {
        if (client)
            return client;
        if (!project) {
            try {
                project = await adcProjectId();
            }
            catch {
                project = '';
            }
            if (!project)
                throw new Error('EMBEDDINGS_INIT_FAILED: Vertex AI needs GOOGLE_CLOUD_PROJECT (or Application Default Credentials with a project)');
        }
        client = new GoogleGenAI({ vertexai: true, project, location });
        return client;
    };
    const embed = async (texts) => {
        if (!texts.length)
            return [];
        const backend = await ensureClient();
        const response = await backend.models.embedContent({
            model,
            contents: texts.map((text) => ({ parts: [{ text }] })),
            config: { taskType, outputDimensionality: dimensions }
        });
        return (response.embeddings ?? []).map((item) => item.values ?? []);
    };
    const instance = {
        model,
        taskType,
        dimensions,
        embedQuery: async (text) => (await embed([text]))[0] ?? [],
        embedDocuments: embed
    };
    cache.set(cacheKey, instance);
    return instance;
}
//# sourceMappingURL=ai-embeddings.js.map