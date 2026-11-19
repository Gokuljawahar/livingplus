import type { EmbeddingsInterface } from '@langchain/core/embeddings';
export type EmbeddingPurpose = 'document' | 'query';
export declare function embeddingModelId(): string;
/** Test hook: replace the embeddings provider (null restores). */
export declare function setEmbeddingsForTests(factory: ((purpose: EmbeddingPurpose) => EmbeddingsInterface) | null): void;
/** Builds the configured embeddings model, or throws EMBEDDINGS_NOT_CONFIGURED / EMBEDDINGS_INIT_FAILED. */
export declare function createEmbeddings(purpose: EmbeddingPurpose): Promise<EmbeddingsInterface>;
//# sourceMappingURL=ai-embeddings.d.ts.map