import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// Load .env before any other imports so env vars are available at module init time
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });
import app, { prisma } from './app.js';
import { startMonthlyRentScheduler } from './services/pg-rent-scheduler.js';
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    startMonthlyRentScheduler(prisma);
});
server.on('error', (err) => {
    console.error('Server error:', err);
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    server.close();
    process.exit(0);
});
//# sourceMappingURL=index.js.map