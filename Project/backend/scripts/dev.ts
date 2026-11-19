// `npm run dev`: starts the local PostgreSQL (when DATABASE_URL points at it),
// applies migrations, then runs the API with hot reload. `npm run db` starts
// only the database, e.g. for `npm run db:migrate` or Prisma Studio.
import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { startLocalPostgres, type LocalPostgres } from './local-postgres.js';

const LOCAL_PORT = Number(process.env.LOCAL_POSTGRES_PORT) || 5433;
const dbOnly = process.argv.includes('--db-only');

function usesLocalPostgres(url: string): { database: string } | null {
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1'].includes(parsed.hostname) && Number(parsed.port) === LOCAL_PORT;
    return local ? { database: parsed.pathname.replace(/^\//, '') || 'livingplus' } : null;
  } catch {
    return null;
  }
}

async function main() {
  const url = process.env.DATABASE_URL || '';
  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.error('DATABASE_URL must be a postgresql:// URL. See .env.example.');
    process.exit(1);
  }

  let db: LocalPostgres | null = null;
  const local = usesLocalPostgres(url);
  if (local) {
    db = await startLocalPostgres({ dir: '.local-postgres', port: LOCAL_PORT, database: local.database, persistent: true });
    console.log(`[db] Local PostgreSQL running on port ${LOCAL_PORT} (data in .local-postgres/)`);
  }

  const stop = async (code = 0) => {
    if (db) await db.stop().catch(() => undefined);
    process.exit(code);
  };
  process.on('SIGINT', () => void stop(0));
  process.on('SIGTERM', () => void stop(0));

  const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'inherit' });
  if (migrate.status !== 0) return stop(migrate.status ?? 1);

  if (dbOnly) {
    console.log('[db] Ready. Press Ctrl+C to stop.');
    return;
  }

  const api = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'watch', 'src/index.ts'], { stdio: 'inherit' });
  api.on('exit', (code) => void stop(code ?? 0));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
