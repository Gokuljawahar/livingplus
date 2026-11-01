import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getJwtSecret } from './utils/auth-config.js';
// Load .env before any other imports so env vars are available at module init time
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });
getJwtSecret();
const [{ default: app, prisma }, { startMonthlyRentScheduler }, { startRentReminderScheduler }] = await Promise.all([
    import('./app.js'),
    import('./services/pg-rent-scheduler.js'),
    import('./services/pg-rent-reminders.js')
]);
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    startMonthlyRentScheduler(prisma);
    startRentReminderScheduler(prisma);
});
server.on('error', (err) => {
    console.error('Server error:', err);
});
const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close((error) => {
        if (error) {
            console.error('HTTP server shutdown error:', error);
            process.exitCode = 1;
        }
        void prisma.$disconnect().catch((disconnectError) => {
            console.error('Prisma shutdown error:', disconnectError);
            process.exitCode = 1;
        });
    });
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
//# sourceMappingURL=index.js.map