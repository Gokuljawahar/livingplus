const PROVIDERS = {
    'google-genai': {
        pkg: '@langchain/google-genai',
        className: 'GoogleGenerativeAIEmbeddings',
        purposeOptions: (purpose) => ({ taskType: purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT' })
    },
    'google-vertexai': { pkg: '@langchain/google-vertexai', className: 'VertexAIEmbeddings' },
    openai: { pkg: '@langchain/openai', className: 'OpenAIEmbeddings' },
    ollama: { pkg: '@langchain/ollama', className: 'OllamaEmbeddings' },
    mistralai: { pkg: '@langchain/mistralai', className: 'MistralAIEmbeddings' },
    cohere: { pkg: '@langchain/cohere', className: 'CohereEmbeddings' }
};
/** Gemini's recommended compact size; other providers ignore unknown options. */
const DEFAULT_OPTIONS = {
    'google-genai': { outputDimensionality: 768 },
    'google-vertexai': { dimensions: 768 }
};
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
    const entry = PROVIDERS[provider];
    if (!entry)
        throw new Error(`EMBEDDINGS_INIT_FAILED: unsupported provider "${provider}" (supported: ${Object.keys(PROVIDERS).join(', ')})`);
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
    let mod;
    try {
        mod = await import(entry.pkg);
    }
    catch {
        throw new Error(`EMBEDDINGS_INIT_FAILED: install ${entry.pkg} to use ${provider} embeddings`);
    }
    try {
        const instance = new mod[entry.className]({
            model,
            maxRetries: 1,
            ...(DEFAULT_OPTIONS[provider] || {}),
            ...(entry.purposeOptions?.(purpose) || {}),
            ...options
        });
        cache.set(cacheKey, instance);
        return instance;
    }
    catch (error) {
        throw new Error(`EMBEDDINGS_INIT_FAILED: ${String(error?.message || error)}`);
    }
}
//# sourceMappingURL=ai-embeddings.js.map