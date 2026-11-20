export type EmbeddingPurpose = 'document' | 'query';
export interface EmbeddingsModel {
    readonly model: string;
    readonly taskType: string;
    readonly dimensions: number;
    embedQuery(text: string): Promise<number[]>;
    embedDocuments(texts: string[]): Promise<number[][]>;
}
export declare function embeddingModelId(): string;
/** Test hook: replace the embeddings provider (null restores). */
export declare function setEmbeddingsForTests(factory: ((purpose: EmbeddingPurpose) => EmbeddingsModel) | null): void;
/** Builds the configured embeddings model, or throws EMBEDDINGS_NOT_CONFIGURED / EMBEDDINGS_INIT_FAILED. */
export declare function createEmbeddings(purpose: EmbeddingPurpose): Promise<EmbeddingsModel>;
//# sourceMappingURL=ai-embeddings.d.ts.map