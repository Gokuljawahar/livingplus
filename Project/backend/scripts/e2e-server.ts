// End-to-end test server: a throwaway PostgreSQL with migrations and demo
// seed data, then the API on E2E_API_PORT. Started by the frontend's
// Playwright config; stops (and deletes the database) on exit.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startLocalPostgres } from './local-postgres.js';

const apiPort = Number(process.env.E2E_API_PORT) || 4100;
const dbPort = Number(process.env.E2E_DB_PORT) || 5544;
const dir = path.resolve('tests/.tmp-postgres-e2e');

fs.rmSync(dir, { recursive: true, force: true });
const db = await startLocalPostgres({ dir, port: dbPort, database: 'livingplus_e2e', persistent: false });

const env = {
  ...process.env,
  DATABASE_URL: db.url,
  PORT: String(apiPort),
  NODE_ENV: 'development',
  JWT_SECRET: 'e2e-secret-for-playwright-tests-32-bytes!',
  LIVINGPLUS_ROOT_DOMAIN: 'livingplus.com',
  SCHEDULER_MODE: 'external',
  ENABLE_AI_ORCHESTRATOR: 'false',
  ENABLE_SEMANTIC_SEARCH: 'false',
  OTP_PROVIDER: 'sms',
  SMS_API_URL: '',
  LOG_LEVEL: 'warn'
};

const prisma = (args: string[]) => spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { env, stdio: 'inherit' });
if (prisma(['migrate', 'reset', '--force', '--skip-seed', '--skip-generate']).status !== 0) throw new Error('migrate failed');
if (spawnSync(process.execPath, ['--import', 'tsx', 'prisma/seed-pg.ts'], { env, stdio: 'inherit' }).status !== 0) throw new Error('seed failed');
if (spawnSync(process.execPath, ['--import', 'tsx', 'scripts/e2e-fixtures.ts'], { env, stdio: 'inherit' }).status !== 0) throw new Error('fixtures failed');

const api = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { env, stdio: 'inherit' });
const shutdown = async () => {
  api.kill('SIGTERM');
  await db.stop().catch(() => undefined);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
api.on('exit', () => void shutdown());
