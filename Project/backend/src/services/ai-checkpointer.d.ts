import type { BaseCheckpointSaver } from '@langchain/langgraph';
/** Converts a Prisma DATABASE_URL into a node-postgres connection string. */
export declare function pgConnectionString(databaseUrl: string): string;
export declare function getCheckpointer(): Promise<BaseCheckpointSaver>;
export declare function closeCheckpointer(): Promise<void>;
//# sourceMappingURL=ai-checkpointer.d.ts.map