// Scheduled jobs as authenticated HTTP endpoints, for Google Cloud Scheduler
// (or any external cron). Mounted outside /api: no payload encryption or PG
// host routing applies. Set SCHEDULER_MODE=external so the API process does not
// also run its in-process timers.
//
// Authentication, in order of preference:
//   1. CRON_OIDC_AUDIENCE (+ CRON_SERVICE_ACCOUNT): Cloud Scheduler attaches a
//      Google-signed OIDC token for a service account; we verify it.
//   2. CRON_SECRET: a shared bearer secret, for local testing or other crons.
// With neither configured the endpoints are disabled.
import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { generateMonthlyRentEntries } from '../services/pg-rent-scheduler.js';
import { sendDueRentReminders } from '../services/pg-rent-reminders.js';
import { periodOf } from '../utils/app-time.js';
const oidcClient = new OAuth2Client();
function bearer(req) {
    const header = String(req.headers.authorization || '');
    return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}
function secretMatches(given, expected) {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}
export async function authorizeCron(req, res, next) {
    const audience = process.env.CRON_OIDC_AUDIENCE;
    const secret = process.env.CRON_SECRET;
    const token = bearer(req);
    if (!audience && !secret) {
        res.status(404).json({ message: 'Not found' });
        return;
    }
    if (!token) {
        res.status(401).json({ message: 'Missing credentials' });
        return;
    }
    if (secret && secretMatches(token, secret))
        return next();
    if (audience) {
        try {
            const ticket = await oidcClient.verifyIdToken({ idToken: token, audience });
            const payload = ticket.getPayload();
            const allowed = process.env.CRON_SERVICE_ACCOUNT;
            if (payload?.email_verified && (!allowed || payload.email === allowed))
                return next();
        }
        catch {
            /* fall through to 403 */
        }
    }
    res.status(403).json({ message: 'Forbidden' });
}
export function cronRoutes(prisma) {
    const router = Router();
    router.use(authorizeCron);
    router.post('/monthly-rent', async (_req, res) => {
        try {
            const now = new Date();
            const tenants = await generateMonthlyRentEntries(prisma, now);
            res.json({ job: 'monthly-rent', period: periodOf(now), tenants });
        }
        catch (error) {
            console.error('[cron] monthly-rent failed:', error);
            res.status(500).json({ job: 'monthly-rent', message: 'failed' });
        }
    });
    router.post('/rent-reminders', async (_req, res) => {
        try {
            const summary = await sendDueRentReminders(prisma, {});
            res.json({ job: 'rent-reminders', sent: summary.sent, skipped: summary.skipped });
        }
        catch (error) {
            console.error('[cron] rent-reminders failed:', error);
            res.status(500).json({ job: 'rent-reminders', message: 'failed' });
        }
    });
    return router;
}
//# sourceMappingURL=cron.routes.js.map