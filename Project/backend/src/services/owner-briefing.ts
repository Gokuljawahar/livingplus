// Owner voice session on Gemini Live. The owner taps "Brief me"; Gemini speaks
// a short briefing from that owner's real numbers and lists, then answers
// follow-up questions by voice and can do a few staff actions (see
// voice-actions.ts), each read back aloud and confirmed by voice first.
//
// Browsers can't send the sign-in header on a WebSocket, so the signed-in
// owner first gets a one-minute pass (a short-lived signed token) and the
// voice connection presents it.
import jwt from 'jsonwebtoken';
import { canSeeMoneyRole, cleanVibeAnswers, rupees, shortDate, vibeMatch, type VibeAnswers } from '@livingplus/shared';
import { prisma } from '../db/index.js';
import type { Actor } from './ai-tools.js';
import { asSystem } from '../db/context.js';
import { getJwtSecret } from '../utils/auth-config.js';
import { pulseStats } from '../controllers/insights.controller.js';

export const OWNER_BRIEFING_PATH = '/api/pg/owner/briefing/live';
const PURPOSE = 'owner-voice-briefing';
const day = (value: Date | string) => shortDate(value, 'Asia/Kolkata');

/** A one-minute pass for the briefing connection. */
export function issueBriefingPass(userId: string): string {
  return jwt.sign({ userId, purpose: PURPOSE }, getJwtSecret(), { expiresIn: '60s' });
}

/** The user id a pass belongs to, or null when it is missing, expired or for something else. */
export function readBriefingPass(pass: string | null): string | null {
  if (!pass) return null;
  try {
    const payload = jwt.verify(pass, getJwtSecret()) as { userId?: string; purpose?: string };
    return payload.purpose === PURPOSE && typeof payload.userId === 'string' ? payload.userId : null;
  } catch {
    return null;
  }
}

export interface AllotmentRoom {
  roomNumber: string;
  hasAc: boolean;
  availableBeds: string[];
  roommates: VibeAnswers[];
}

export interface AllotmentSuggestion {
  roomNumber: string;
  bedLabel: string;
  hasAc: boolean;
  score: number | null;
  consolidated: boolean;
}

/**
 * Recommends a vacant bed for the owner to review when allotting a stay request:
 * prioritizes highest roommate habit fit, then consolidating partially occupied
 * rooms ahead of opening empty rooms, and deterministic room order.
 */
export function suggestOwnerAllotment(guestAnswers: VibeAnswers, rooms: AllotmentRoom[]): AllotmentSuggestion | null {
  const hasGuestHabits = Object.keys(guestAnswers).length > 0;
  const candidates = rooms
    .filter((room) => room.availableBeds.length > 0)
    .map((room) => {
      const consolidated = room.roommates.length > 0;
      const score = hasGuestHabits && consolidated ? vibeMatch(guestAnswers, room.roommates).score : null;
      return {
        roomNumber: room.roomNumber,
        bedLabel: room.availableBeds[0]!,
        hasAc: room.hasAc,
        score,
        consolidated
      };
    });
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    if (a.consolidated !== b.consolidated) return a.consolidated ? -1 : 1;
    return a.roomNumber.localeCompare(b.roomNumber, 'en', { numeric: true });
  });
  return candidates[0]!;
}

/** Everything the briefing may talk about, for this person's PGs only. */
export async function briefingFacts(userId: string): Promise<{ firstName: string; facts: string } | null> {
  return asSystem('owner voice briefing reads the caller\'s own PGs', async () => {
    const [user, access] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.pGPropertyAccess.findMany({
        where: { userId, role: { in: ['OWNER', 'WARDEN', 'ACCOUNTANT'] } },
        select: { propertyId: true, role: true, property: { select: { name: true } } }
      })
    ]);
    if (!user || !access.length) return null;
    const scope = access.map((row) => row.propertyId);
    const moneyScope = access.filter((row) => canSeeMoneyRole(row.role)).map((row) => row.propertyId);
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
        select: {
          propertyId: true, residentName: true, moveInDate: true, vibeAnswers: true, vibeSummary: true,
          property: { select: { name: true } }, bed: { select: { label: true, room: { select: { roomNumber: true } } } }
        },
        orderBy: { createdAt: 'asc' }, take: 6
      }),
      prisma.pGMaintenanceTicket.findMany({
        where: { propertyId: { in: scope }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: { id: true, title: true, priority: true, status: true, createdAt: true, property: { select: { name: true } } },
        orderBy: { createdAt: 'asc' }, take: 6
      })
    ]);

    const requestPropertyIds = [...new Set(requests.map((request) => request.propertyId))];
    const roomsByProperty = new Map<string, AllotmentRoom[]>();
    if (requestPropertyIds.length) {
      const rooms = await prisma.pGRoom.findMany({
        where: { propertyId: { in: requestPropertyIds }, status: 'ACTIVE' },
        select: {
          propertyId: true,
          roomNumber: true,
          hasAc: true,
          beds: {
            select: {
              label: true,
              status: true,
              tenants: {
                where: { status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
                select: { vibeAnswers: true }
              }
            }
          }
        }
      });
      for (const room of rooms) {
        const list = roomsByProperty.get(room.propertyId) ?? [];
        const availableBeds = room.beds.filter((bed) => bed.status === 'AVAILABLE').map((bed) => bed.label);
        const roommates = room.beds
          .flatMap((bed) => bed.tenants.map((tenant) => cleanVibeAnswers(tenant.vibeAnswers)))
          .filter((answers): answers is VibeAnswers => answers !== null);
        list.push({ roomNumber: room.roomNumber, hasAc: room.hasAc, availableBeds, roommates });
        roomsByProperty.set(room.propertyId, list);
      }
    }

    const requestLines = requests.length
      ? requests.map((request) => {
        const guestAnswers = cleanVibeAnswers(request.vibeAnswers) ?? {};
        const advice = suggestOwnerAllotment(guestAnswers, roomsByProperty.get(request.propertyId) ?? []);
        const summary = request.vibeSummary ? `; Routine: ${request.vibeSummary}` : '';
        const adviceText = advice
          ? `. Owner allotment advice: Room ${advice.roomNumber}, Bed ${advice.bedLabel} (${advice.hasAc ? 'AC' : 'Non-AC'}${advice.score !== null ? `, ${advice.score}% habit fit` : ''}, ${advice.consolidated ? 'consolidates open room' : 'open room'}) — owner decides final bed in Bed requests`
          : '';
        return `- Stay request waiting: ${request.residentName} for ${request.property.name}, moving in ${day(request.moveInDate)}${summary}${adviceText}.`;
      })
      : ['No stay requests are waiting.'];

    const lines = [
      `Today is ${day(new Date())}. The owner runs ${access.length === 1 ? 'one PG' : `${access.length} PGs`}: ${access.map((row) => row.property.name).join(', ')}.`,
      `Beds: ${stats.occupied} of ${stats.beds} occupied. New residents this week: ${stats.newResidents}.`,
      `Maintenance: ${stats.ticketsOpen} open; this week ${stats.ticketsOpened} reported and ${stats.ticketsResolved} fixed${stats.avgFixHours !== null ? ` in about ${stats.avgFixHours} hours on average` : ''}.`,
      `Extra meals ordered this week: ${stats.mealOrders}.`,
      ...(seesMoney ? [`Overdue rent: ${stats.overdueCount ?? 0} bills, ${rupees(stats.overdueAmount ?? 0)} in total.`] : ['This person cannot see money details; do not discuss rent amounts.']),
      ...overdue.map((entry) => `- Overdue: ${entry.tenant.name} at ${entry.tenant.property.name}, ${entry.entryType.toLowerCase()} for ${entry.period}, ${rupees(entry.amount - entry.paidAmount)}, was due ${day(entry.dueDate)}.`),
      ...requestLines,
      ...(tickets.length ? tickets.map((ticket) => `- Open issue [ref ${ticket.id}]: ${ticket.title} at ${ticket.property.name}, ${ticket.priority.toLowerCase()} priority, reported ${day(ticket.createdAt)}.`) : ['No open maintenance issues.'])
    ];
    return { firstName: (user.name || 'there').split(' ')[0]!, facts: lines.join('\n') };
  });
}

/** Who the voice session acts as: the owner's own role and PGs, or null when they have no staff access. */
export async function briefingActor(userId: string): Promise<{ actor: Actor } | null> {
  return asSystem('owner voice session reads the caller\'s own PG access', async () => {
    const access = await prisma.pGPropertyAccess.findMany({ where: { userId, role: { in: ['OWNER', 'WARDEN'] } }, select: { propertyId: true, role: true } });
    if (!access.length) return null;
    const owner = access.some((row) => row.role === 'OWNER');
    const rows = access.filter((row) => (owner ? row.role === 'OWNER' : row.role === 'WARDEN'));
    return { actor: { userId, role: owner ? 'PG_OWNER' : 'PG_WARDEN', phones: [], propertyIds: rows.map((row) => row.propertyId) } };
  });
}

export function briefingInstruction(facts: string, canAct = false): string {
  return [
    "You are the PG owner's calm, sharp operations manager giving a spoken briefing over a voice call.",
    'First give a 20 to 30 second briefing: how full the PGs are, then what needs the owner today in order of urgency, then one suggestion. After that, answer follow-up questions.',
    'Use only the facts below. If something is not in them, say you do not have it. Speak naturally in short sentences; say amounts the way people speak them in India; never read out IDs or codes.',
    ...(canAct ? [
      'You can look up live property facts by voice: list_staff, get_occupancy_report, get_pending_rent (owners only), get_expense_summary, and list_room_change_requests.',
      'You can also execute day-to-day actions by voice: assign a maintenance ticket (call list_staff first if you do not know staff names), update a ticket status, post a resident notice, send rent-due reminders, and log a property expense. Use the ticket ref from the facts and the PG name; never read raw IDs or refs aloud—describe tickets by issue and PG instead.',
      'Every change is strictly two steps. First call the tool, which only prepares it and returns a read_back. Say the read_back aloud in the speaker\'s language, ask for a clear yes or no, and wait. Call confirm_action ONLY after the speaker clearly answers yes in a new turn. If they say no, want edits, or interrupt to correct you, call cancel_action and offer to prepare it again. Once confirm_action succeeds, confirm in one short spoken sentence.',
      'For high-risk financial or tenant decisions—marking rent paid, verifying KYC, approving bookings, or settling deposits—do NOT guess or improvise; call hand_off_to_workspace with target ("rent", "bookings", or "maintenance") and a short reason so the owner gets a one-tap workspace button.',
      'Room and bed allocation is always the owner\'s decision, never chosen by guests. When asked where to place a pending stay request, share the owner allotment advice (occupancy consolidation + roommate habit fit) from the facts and call hand_off_to_workspace with target "bookings" so the owner makes the final allotment in Bed requests.',
      'If background noise or unclear speech leaves a room number, amount, staff name, or PG ambiguous, politely ask them to repeat that detail instead of guessing.'
    ] : [
      'You cannot change anything. If the owner asks you to do something (send a reminder, approve a request, assign a repair), say they can do it from the workspace or ask the assistant there, which will check with them before acting.'
    ]),
    "Reply naturally in the speaker's language (Tamil, Hindi, English, Tanglish or Hinglish) and switch smoothly whenever they switch.",
    '',
    'Facts:',
    facts
  ].join('\n');
}
