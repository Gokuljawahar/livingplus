// Owner voice briefing on Gemini Live (buildathon answers Q12: hands-free
// operational briefings). The owner taps "Brief me"; Gemini speaks a short
// briefing from that owner's real numbers and lists, then answers follow-up
// questions by voice. Read-only: it never changes anything; actions stay with
// the confirm-first assistant in the workspace.
//
// Browsers can't send the sign-in header on a WebSocket, so the signed-in
// owner first gets a one-minute pass (a short-lived signed token) and the
// voice connection presents it.
import jwt from 'jsonwebtoken';
import { prisma } from '../app.js';
import { asSystem } from '../db/context.js';
import { getJwtSecret } from '../utils/auth-config.js';
import { pulseStats } from '../controllers/insights.controller.js';
export const OWNER_BRIEFING_PATH = '/api/pg/owner/briefing/live';
const PURPOSE = 'owner-voice-briefing';
const rupees = (amount) => `₹${Math.round(amount).toLocaleString('en-IN')}`;
const day = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
/** A one-minute pass for the briefing connection. */
export function issueBriefingPass(userId) {
    return jwt.sign({ userId, purpose: PURPOSE }, getJwtSecret(), { expiresIn: '60s' });
}
/** The user id a pass belongs to, or null when it is missing, expired or for something else. */
export function readBriefingPass(pass) {
    if (!pass)
        return null;
    try {
        const payload = jwt.verify(pass, getJwtSecret());
        return payload.purpose === PURPOSE && typeof payload.userId === 'string' ? payload.userId : null;
    }
    catch {
        return null;
    }
}
/** Everything the briefing may talk about, for this person's PGs only. */
export async function briefingFacts(userId) {
    return asSystem('owner voice briefing reads the caller\'s own PGs', async () => {
        const [user, access] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
            prisma.pGPropertyAccess.findMany({
                where: { userId, role: { in: ['OWNER', 'WARDEN', 'ACCOUNTANT'] } },
                select: { propertyId: true, role: true, property: { select: { name: true } } }
            })
        ]);
        if (!user || !access.length)
            return null;
        const scope = access.map((row) => row.propertyId);
        const moneyScope = access.filter((row) => row.role === 'OWNER' || row.role === 'ACCOUNTANT').map((row) => row.propertyId);
        const seesMoney = moneyScope.length > 0;
        const today = new Date(new Date().toISOString().slice(0, 10));
        const [stats, overdue, requests, tickets] = await Promise.all([
            pulseStats(scope, seesMoney),
            seesMoney ? prisma.pGRentEntry.findMany({
                where: { tenant: { propertyId: { in: moneyScope } }, status: { not: 'PAID' }, dueDate: { lt: today } },
                select: { amount: true, paidAmount: true, entryType: true, period: true, dueDate: true, tenant: { select: { name: true, property: { select: { name: true } } } } },
                orderBy: { dueDate: 'asc' }, take: 8
            }) : Promise.resolve([]),
            prisma.pGBooking.findMany({
                where: { propertyId: { in: scope }, status: 'PENDING' },
                select: { residentName: true, moveInDate: true, property: { select: { name: true } }, bed: { select: { label: true, room: { select: { roomNumber: true } } } } },
                orderBy: { createdAt: 'asc' }, take: 6
            }),
            prisma.pGMaintenanceTicket.findMany({
                where: { propertyId: { in: scope }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
                select: { title: true, priority: true, status: true, createdAt: true, property: { select: { name: true } } },
                orderBy: { createdAt: 'asc' }, take: 6
            })
        ]);
        const lines = [
            `Today is ${day(new Date())}. The owner runs ${access.length === 1 ? 'one PG' : `${access.length} PGs`}: ${access.map((row) => row.property.name).join(', ')}.`,
            `Beds: ${stats.occupied} of ${stats.beds} occupied. New residents this week: ${stats.newResidents}.`,
            `Maintenance: ${stats.ticketsOpen} open; this week ${stats.ticketsOpened} reported and ${stats.ticketsResolved} fixed${stats.avgFixHours !== null ? ` in about ${stats.avgFixHours} hours on average` : ''}.`,
            `Extra meals ordered this week: ${stats.mealOrders}.`,
            ...(seesMoney ? [`Overdue rent: ${stats.overdueCount ?? 0} bills, ${rupees(stats.overdueAmount ?? 0)} in total.`] : ['This person cannot see money details; do not discuss rent amounts.']),
            ...overdue.map((entry) => `- Overdue: ${entry.tenant.name} at ${entry.tenant.property.name}, ${entry.entryType.toLowerCase()} for ${entry.period}, ${rupees(entry.amount - entry.paidAmount)}, was due ${day(entry.dueDate)}.`),
            ...(requests.length ? requests.map((request) => `- Bed request waiting: ${request.residentName} for ${request.property.name}${request.bed ? `, room ${request.bed.room.roomNumber}` : ''}, moving in ${day(request.moveInDate)}.`) : ['No bed requests are waiting.']),
            ...(tickets.length ? tickets.map((ticket) => `- Open issue: ${ticket.title} at ${ticket.property.name}, ${ticket.priority.toLowerCase()} priority, reported ${day(ticket.createdAt)}.`) : ['No open maintenance issues.'])
        ];
        return { firstName: (user.name || 'there').split(' ')[0], facts: lines.join('\n') };
    });
}
export function briefingInstruction(facts) {
    return [
        "You are the PG owner's calm, sharp operations manager giving a spoken briefing over a voice call.",
        'First give a 20 to 30 second briefing: how full the PGs are, then what needs the owner today in order of urgency, then one suggestion. After that, answer follow-up questions.',
        'Use only the facts below. If something is not in them, say you do not have it. Speak naturally in short sentences; say amounts the way people speak them in India; never read out IDs or codes.',
        'You cannot change anything. If the owner asks you to do something (send a reminder, approve a request, assign a repair), say they can do it from the workspace or ask the assistant there, which will check with them before acting.',
        "Reply in the owner's language (Tamil, Hindi, English or a mix) and switch when they switch.",
        '',
        'Facts:',
        facts
    ].join('\n');
}
//# sourceMappingURL=owner-briefing.js.map