// Durable LangGraph state for the assistant: conversation threads and paused
// confirmations survive restarts and work across Cloud Run instances.
// Stored in PostgreSQL in its own "langgraph" schema, so Prisma migrations
// (which manage "public") never see or drop these tables.
import pg from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { BaseCheckpointSaver } from '@langchain/langgraph';

const CHECKPOINT_SCHEMA = 'langgraph';

// Query parameters only Prisma understands; node-postgres would reject them.
const PRISMA_ONLY_PARAMS = ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'statement_cache_size', 'socket_timeout', 'sslaccept'];

/** Converts a Prisma DATABASE_URL into a node-postgres connection string. */
export function pgConnectionString(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  for (const param of PRISMA_ONLY_PARAMS) url.searchParams.delete(param);
  return url.toString();
}

let saverPromise: Promise<PostgresSaver> | null = null;
let pool: pg.Pool | null = null;

export function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (!saverPromise) {
    saverPromise = (async () => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('DATABASE_URL is not configured');
      pool = new pg.Pool({ connectionString: pgConnectionString(url), max: Number(process.env.CHECKPOINT_POOL_MAX) || 5 });
      const saver = new PostgresSaver(pool, undefined, { schema: CHECKPOINT_SCHEMA });
      await saver.setup();
      return saver;
    })().catch((error) => {
      saverPromise = null;
      throw error;
    });
  }
  return saverPromise;
}

export async function closeCheckpointer(): Promise<void> {
  const current = pool;
  saverPromise = null;
  pool = null;
  await current?.end().catch(() => undefined);
}
