import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getJwtSecret } from './utils/auth-config.js';

// Load .env before any other imports so env vars are available at module init time
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

// Imported after .env so LOG_LEVEL / LOG_FORMAT apply.
const { logger } = await import('./utils/logger.js');

getJwtSecret();

const [{ default: app, prisma }, { startMonthlyRentScheduler }, { startRentReminderScheduler }, { assignMissingPgSlugs }] = await Promise.all([
  import('./app.js'),
  import('./services/pg-rent-scheduler.js'),
  import('./services/pg-rent-reminders.js'),
  import('./utils/pg-slug.js')
]);

if (process.env.OTP_DEMO_MODE === 'true') {
  logger.warn('OTP_DEMO_MODE is on: verification codes are shown on screen. Use only for demos.');
}

const backfilledSlugs = await assignMissingPgSlugs(prisma);
if (backfilledSlugs) logger.info(`[PG host routing] Assigned ${backfilledSlugs} property slugs`);

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, async () => {
  logger.info(`Server is running on port ${PORT}`);
  // On Cloud Run, set SCHEDULER_MODE=external and trigger /internal/cron/* from
  // Cloud Scheduler: instances scale to zero and may run in parallel.
  if (process.env.SCHEDULER_MODE === 'external') {
    logger.info('[scheduler] External mode: jobs run via /internal/cron/*');
  } else {
    startMonthlyRentScheduler(prisma);
    startRentReminderScheduler(prisma);
    // Embed any listings that are new or changed since the last run.
    void import('./services/semantic-search.js')
      .then(({ indexProperties }) => indexProperties())
      .then((result) => { if (result.indexed) logger.info(`[search] Indexed ${result.indexed} listings`); })
      .catch((error) => logger.warn({ err: error }, '[search] Startup indexing failed'));
  }
});

server.on('error', (err) => {
  logger.error({ err: err }, 'Server error');
});

const shutdown = (signal: string): void => {
  logger.info(`${signal} received, shutting down...`);
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'HTTP server shutdown error');
      process.exitCode = 1;
    }
    void import('./services/ai-checkpointer.js').then(({ closeCheckpointer }) => closeCheckpointer());
    void prisma.$disconnect().catch((disconnectError) => {
      logger.error({ err: disconnectError }, 'Prisma shutdown error');
      process.exitCode = 1;
    });
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
