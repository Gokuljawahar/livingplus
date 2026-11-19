export declare const semanticSearchEnabled: () => boolean;
/** Minimum cosine similarity for a meaning-only match (keyword matches always count). */
export declare const minSemanticScore: () => number;
/** Text a property is embedded from. Live data (free beds) is left out on purpose. */
export declare function propertySearchText(property: any): string;
/**
 * Embeds published properties whose description (or the embedding model)
 * changed since they were last indexed. Pass ids to limit the scope.
 */
export declare function indexProperties(options?: {
    ids?: string[];
    force?: boolean;
}): Promise<{
    indexed: number;
    skipped: number;
}>;
/** Re-index a property shortly after it changes (edits often come in bursts). */
export declare function scheduleSearchIndex(propertyId: string | null | undefined): void;
export declare function cosineSimilarity(a: number[], b: number[]): number;
/**
 * Similarity of each published property (matching `where`) to the query, by
 * meaning. Properties not yet indexed with the current model are left out.
 */
export declare function semanticScores(query: string, where?: Record<string, unknown>): Promise<Map<string, number>>;
/** Clears cached query vectors (tests, model changes). */
export declare function clearSemanticQueryCache(): void;
//# sourceMappingURL=semantic-search.d.ts.map