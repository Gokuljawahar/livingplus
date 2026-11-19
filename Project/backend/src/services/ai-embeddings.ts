// Provider-agnostic text embeddings, configured like the chat model:
// AI_EMBEDDING_MODEL="<provider>:<model>", e.g. "google-genai:gemini-embedding-001",
// "openai:text-embedding-3-small" or "ollama:nomic-embed-text". Each provider
// reads its usual credentials (GOOGLE_API_KEY, OPENAI_API_KEY, ...);
// AI_EMBEDDING_OPTIONS passes provider options as JSON.
// (LangChain has initChatModel for chat models but no equivalent for
// embeddings, hence this small registry over its standard Embeddings classes.)
import type { EmbeddingsInterface } from '@langchain/core/embeddings';

export type EmbeddingPurpose = 'document' | 'query';

interface ProviderEntry {
  pkg: string;
  className: string;
  /** Options that tell retrieval-tuned models what the text is for. */
  purposeOptions?: (purpose: EmbeddingPurpose) => Record<string, unknown>;
}

const PROVIDERS: Record<string, ProviderEntry> = {
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
const DEFAULT_OPTIONS: Record<string, Record<string, unknown>> = {
  'google-genai': { outputDimensionality: 768 }
};

export function embeddingModelId(): string {
  return (process.env.AI_EMBEDDING_MODEL || '').trim();
}

let override: ((purpose: EmbeddingPurpose) => EmbeddingsInterface) | null = null;

/** Test hook: replace the embeddings provider (null restores). */
export function setEmbeddingsForTests(factory: ((purpose: EmbeddingPurpose) => EmbeddingsInterface) | null): void {
  override = factory;
}

const cache = new Map<string, EmbeddingsInterface>();

/** Builds the configured embeddings model, or throws EMBEDDINGS_NOT_CONFIGURED / EMBEDDINGS_INIT_FAILED. */
export async function createEmbeddings(purpose: EmbeddingPurpose): Promise<EmbeddingsInterface> {
  if (override) return override(purpose);
  const id = embeddingModelId();
  const at = id.indexOf(':');
  if (at <= 0) throw new Error('EMBEDDINGS_NOT_CONFIGURED');
  const provider = id.slice(0, at);
  const model = id.slice(at + 1);
  const entry = PROVIDERS[provider];
  if (!entry) throw new Error(`EMBEDDINGS_INIT_FAILED: unsupported provider "${provider}" (supported: ${Object.keys(PROVIDERS).join(', ')})`);

  const cacheKey = `${id}|${purpose}|${process.env.AI_EMBEDDING_OPTIONS || ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let options: Record<string, unknown>;
  try {
    options = JSON.parse(process.env.AI_EMBEDDING_OPTIONS || '{}');
  } catch {
    throw new Error('EMBEDDINGS_INIT_FAILED: AI_EMBEDDING_OPTIONS must be JSON');
  }
  let mod: any;
  try {
    mod = await import(entry.pkg);
  } catch {
    throw new Error(`EMBEDDINGS_INIT_FAILED: install ${entry.pkg} to use ${provider} embeddings`);
  }
  try {
    const instance = new mod[entry.className]({
      model,
      maxRetries: 1,
      ...(DEFAULT_OPTIONS[provider] || {}),
      ...(entry.purposeOptions?.(purpose) || {}),
      ...options
    }) as EmbeddingsInterface;
    cache.set(cacheKey, instance);
    return instance;
  } catch (error: any) {
    throw new Error(`EMBEDDINGS_INIT_FAILED: ${String(error?.message || error)}`);
  }
}
