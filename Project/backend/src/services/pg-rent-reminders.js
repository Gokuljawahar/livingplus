// Rent-due reminders for owners and wardens. Outstanding entries are nudged
// through the approved WhatsApp template channel; with the channel disabled
// the run is a no-op summary so offline mode keeps working unchanged.
import { logAudit } from './pg-audit.js';
import { notifyWhatsAppTemplate } from './pg-notifications.js';
export const REMINDER_THROTTLE_MS = 3 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;
export async function sendDueRentReminders(db, input = {}, sender = notifyWhatsAppTemplate) {
    const entries = await db.pGRentEntry.findMany({
        where: {
            status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] },
            ...(input.period ? { period: String(input.period) } : {}),
            ...(input.propertyIds ? { tenant: { propertyId: { in: input.propertyIds } } } : {})
        },
        include: { tenant: { select: { name: true, phone: true, propertyId: true } } },
        orderBy: { dueDate: 'asc' }
    });
    const summary = { total: entries.length, sent: 0, skipped: 0, results: [] };
    for (const entry of entries.slice(0, BATCH_LIMIT)) {
        const outstanding = Math.max(0, (entry.amount || 0) - (entry.paidAmount || 0));
        if (outstanding <= 0) {
            summary.skipped += 1;
            summary.results.push({ entryId: entry.id, tenant: entry.tenant?.name || '', period: entry.period, amount: outstanding, outcome: 'settled' });
            continue;
        }
        const phone = String(entry.tenant?.phone || '').replace(/\D/g, '');
        if (!phone) {
            summary.skipped += 1;
            summary.results.push({ entryId: entry.id, tenant: entry.tenant?.name || '', period: entry.period, amount: outstanding, outcome: 'no-phone' });
            continue;
        }
        if (!input.force && entry.lastReminderAt && Date.now() - new Date(entry.lastReminderAt).getTime() < REMINDER_THROTTLE_MS) {
            summary.skipped += 1;
            summary.results.push({ entryId: entry.id, tenant: entry.tenant?.name || '', period: entry.period, amount: outstanding, outcome: 'throttled' });
            continue;
        }
        try {
            const result = await sender('RENT_DUE', phone, [entry.tenant?.name || 'Resident', String(outstanding), entry.period]);
            if (!result.sent) {
                summary.skipped += 1;
                summary.results.push({ entryId: entry.id, tenant: entry.tenant?.name || '', period: entry.period, amount: outstanding, outcome: 'skipped', detail: result.skipped });
                continue;
            }
        }
        catch {
            summary.skipped += 1;
            summary.results.push({ entryId: entry.id, tenant: entry.tenant?.name || '', period: entry.period, amount: outstanding, outcome: 'failed' });
            continue;
        }
        await db.pGRentEntry.update({ where: { id: entry.id }, data: { lastReminderAt: new Date() } });
        logAudit(entry.tenant?.propertyId || '', input.actorId ?? null, 'RENT_REMINDER_SENT', 'PGRentEntry', entry.id, `${entry.period} outstanding ${outstanding}`);
        summary.sent += 1;
        summary.results.push({ entryId: entry.id, tenant: entry.tenant?.name || '', period: entry.period, amount: outstanding, outcome: 'sent' });
    }
    return summary;
}
export function startRentReminderScheduler(db) {
    const tick = () => {
        void sendDueRentReminders(db, {})
            .then((summary) => console.log(`[PG billing] Rent reminders: ${summary.sent} sent, ${summary.skipped} skipped`))
            .catch((error) => console.error('[PG billing] Rent reminders failed:', error));
    };
    tick();
    const timer = setInterval(tick, 24 * 60 * 60 * 1000);
    timer.unref();
}
//# sourceMappingURL=pg-rent-reminders.js.map