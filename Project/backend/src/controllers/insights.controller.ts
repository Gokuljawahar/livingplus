// Owner insights (buildathon answers Q4, Q10, Q12):
// - PG pulse: a readable timeline of what happened, every action the assistant
//   took with who confirmed it, and a Gemini-written weekly brief with one
//   suggested next step (plain numbers if AI is off).
// - Kitchen forecast: how many plates each meal really needs, from food-plan
//   residents, opt-outs, actual orders and residents' routines (VibeCheck wake
//   time and schedule), so the cook makes less waste. Gemini estimates; simple
//   rules stand in when AI is off. Plate counts only, never names.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { accessiblePropertyIds, currentUser } from './pg.controller.js';
import { issueBriefingPass } from '../services/owner-briefing.js';
import { vibeLiveEnabled } from '../services/vibe-live.js';
import { aiEnabled, generateStructured } from '../services/ai-provider.js';
import { cleanVibeAnswers, MONEY_ROLES, rupees } from '@livingplus/shared';
import { LRUCache } from 'lru-cache';

/** AI answers are reused while their inputs are unchanged; a new payment or order changes the key. */
const AI_ANSWER_TTL_MS = 6 * 60 * 60 * 1000;

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- pulse

const ACTION_TEXT: Record<string, string> = {
  RENT_PAYMENT_RECORDED: 'recorded a rent payment',
  RENT_REMINDER_SENT: 'sent rent reminders',
  TENANT_CHECKED_IN: 'checked a resident in',
  TENANT_CHECKED_OUT: 'checked a resident out',
  DEPOSIT_REFUNDED: 'refunded a deposit',
  BOOKING_CREATED_VIA_AI: 'sent a bed request',
  BOOKING_APPROVED: 'approved a bed request',
  BOOKING_REJECTED: 'declined a bed request',
  TICKET_CREATED_VIA_AI: 'reported a maintenance issue',
  TICKET_STATUS_VIA_AI: 'updated a maintenance issue',
  TICKET_ASSIGNED_VIA_AI: 'assigned a maintenance issue to staff',
  NOTICE_POSTED_VIA_AI: 'posted a notice to residents',
  NOTIFICATION_SENT_VIA_AI: 'sent a WhatsApp notification',
  EXPENSE_CREATED: 'logged an expense',
  EXPENSE_DELETED: 'removed an expense',
  ELECTRICITY_BILL_PROPOSED: 'drafted an electricity split',
  ELECTRICITY_BILL_APPROVED: 'approved an electricity bill',
  MEAL_PREFERENCE_SET: 'changed a meal preference',
  ROOM_CHANGE_REQUESTED_VIA_AI: 'asked for a room change',
  ROOM_MOVE_COMPLETED_VIA_AI: 'moved a resident to a new bed',
  ROOM_SWAP_COMPLETED_VIA_AI: 'completed a room swap',
  SERVICES_UPDATED: 'changed the services on offer',
  ROOM_CREATED: 'added a room',
  PROPERTY_CREATED: 'added a PG',
  NOTICE_SUBMITTED: 'gave a vacating notice',
  NOTICE_CANCELLED: 'withdrew a vacating notice'
};

function describe(action: string): string {
  return ACTION_TEXT[action] ?? action.replace(/_VIA_AI$/, '').toLowerCase().replace(/_/g, ' ');
}

async function scopeFor(req: Request): Promise<string[]> {
  const ids = await accessiblePropertyIds(req);
  const wanted = typeof req.query.propertyId === 'string' ? req.query.propertyId : typeof req.body?.propertyId === 'string' ? req.body.propertyId : '';
  return wanted ? ids.filter((id) => id === wanted) : ids;
}

export interface PulseStats {
  beds: number;
  occupied: number;
  newResidents: number;
  pendingRequests: number;
  overdueCount: number | null;
  overdueAmount: number | null;
  ticketsOpen: number;
  ticketsOpened: number;
  ticketsResolved: number;
  avgFixHours: number | null;
  mealOrders: number;
  aiActions: number;
}

export async function pulseStats(scope: string[], seesMoney: boolean): Promise<PulseStats> {
  const since = new Date(Date.now() - 7 * DAY);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const [beds, occupied, newResidents, pendingRequests, overdue, ticketsOpen, ticketsOpened, resolved, mealOrders, aiActions] = await Promise.all([
    db.pGBed.count({ where: { room: { propertyId: { in: scope }, status: 'ACTIVE' } } }),
    db.pGBed.count({ where: { room: { propertyId: { in: scope }, status: 'ACTIVE' }, status: 'OCCUPIED' } }),
    db.pGTenant.count({ where: { propertyId: { in: scope }, createdAt: { gte: since }, status: { in: ['ACTIVE', 'RESERVED', 'NOTICE_PERIOD'] } } }),
    db.pGBooking.count({ where: { propertyId: { in: scope }, status: 'PENDING' } }),
    seesMoney ? db.pGRentEntry.findMany({ where: { tenant: { propertyId: { in: scope } }, status: { not: 'PAID' }, dueDate: { lt: today } }, select: { amount: true, paidAmount: true } }) : Promise.resolve(null),
    db.pGMaintenanceTicket.count({ where: { propertyId: { in: scope }, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    db.pGMaintenanceTicket.count({ where: { propertyId: { in: scope }, createdAt: { gte: since } } }),
    db.pGMaintenanceTicket.findMany({ where: { propertyId: { in: scope }, status: { in: ['RESOLVED', 'CLOSED'] }, updatedAt: { gte: since } }, select: { createdAt: true, updatedAt: true } }),
    db.pGServiceOrder.count({ where: { propertyId: { in: scope }, type: 'MEAL', createdAt: { gte: since }, status: { not: 'CANCELLED' } } }),
    db.pHAuditLog.count({ where: { propertyId: { in: scope }, createdAt: { gte: since }, action: { endsWith: '_VIA_AI' } } })
  ]);
  const hours = resolved.map((ticket: any) => (new Date(ticket.updatedAt).getTime() - new Date(ticket.createdAt).getTime()) / 3_600_000);
  return {
    beds, occupied, newResidents, pendingRequests,
    overdueCount: overdue ? overdue.length : null,
    overdueAmount: overdue ? overdue.reduce((sum: number, entry: any) => sum + Math.max(0, entry.amount - entry.paidAmount), 0) : null,
    ticketsOpen, ticketsOpened, ticketsResolved: resolved.length,
    avgFixHours: hours.length ? Math.round((hours.reduce((a: number, b: number) => a + b, 0) / hours.length) * 10) / 10 : null,
    mealOrders, aiActions
  };
}

/** Timeline, assistant actions and this week's numbers for the caller's PGs. */
export const getPulse = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await scopeFor(req);
    const seesMoney = (await accessiblePropertyIds(req, [...MONEY_ROLES])).some((id) => scope.includes(id));
    const logs = scope.length ? await db.pHAuditLog.findMany({
      where: { propertyId: { in: scope }, createdAt: { gte: new Date(Date.now() - 14 * DAY) } },
      orderBy: { createdAt: 'desc' },
      take: 60
    }) : [];
    const actorIds = [...new Set(logs.map((log: any) => log.actorId).filter(Boolean))];
    const [actors, properties] = await Promise.all([
      actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [],
      scope.length ? db.pGProperty.findMany({ where: { id: { in: scope } }, select: { id: true, name: true } }) : []
    ]);
    const names = new Map(actors.map((actor: any) => [actor.id, actor.name]));
    const pgNames = new Map(properties.map((property: any) => [property.id, property.name]));
    const timeline = logs.map((log: any) => ({
      id: log.id,
      at: log.createdAt,
      who: log.actorId ? names.get(log.actorId) || 'Someone' : /BOOKING_CREATED/.test(log.action) ? 'A guest' : /TICKET_CREATED|MEAL_PREFERENCE|ROOM_CHANGE_REQUESTED|ROOM_SWAP|NOTICE_SUBMITTED|NOTICE_CANCELLED/.test(log.action) ? 'A resident' : 'System',
      what: describe(log.action),
      viaAssistant: log.action.endsWith('_VIA_AI'),
      detail: log.detail ? String(log.detail).slice(0, 140) : null,
      pg: pgNames.get(log.propertyId) || null
    }));
    res.json({ timeline, stats: scope.length ? await pulseStats(scope, seesMoney) : null });
  } catch (error) {
    logger.error({ err: error }, 'PG pulse error');
    res.status(500).json({ message: 'Could not load the PG pulse' });
  }
};

const briefSchema = z.object({
  headline: z.string().describe('One upbeat or honest line about the week, at most 12 words'),
  points: z.array(z.string()).describe('Two to four short facts that matter, each under 20 words, with numbers'),
  suggestion: z.object({
    text: z.string().describe('One concrete next step for the owner, under 15 words'),
    action: z.enum(['SEND_RENT_REMINDERS', 'REVIEW_BED_REQUESTS', 'OPEN_MAINTENANCE', 'NONE'])
  })
});
export type WeeklyBrief = z.infer<typeof briefSchema> & { ai: boolean };

/** The same brief from plain numbers, when AI is off or fails. */
export function plainBrief(stats: PulseStats): WeeklyBrief {
  const occupancy = stats.beds ? Math.round((stats.occupied / stats.beds) * 100) : 0;
  const points = [
    `${stats.occupied} of ${stats.beds} beds occupied (${occupancy}%)${stats.newResidents ? `, ${stats.newResidents} new this week` : ''}.`,
    stats.ticketsOpened || stats.ticketsResolved
      ? `${stats.ticketsOpened} issues reported, ${stats.ticketsResolved} fixed${stats.avgFixHours !== null ? ` in ${stats.avgFixHours} h on average` : ''}.`
      : 'No maintenance issues this week.',
    ...(stats.overdueCount ? [`${stats.overdueCount} rent ${stats.overdueCount === 1 ? 'bill is' : 'bills are'} overdue (${rupees(stats.overdueAmount ?? 0)}).`] : []),
    ...(stats.pendingRequests ? [`${stats.pendingRequests} bed ${stats.pendingRequests === 1 ? 'request is' : 'requests are'} waiting for you.`] : [])
  ];
  const suggestion: WeeklyBrief['suggestion'] = stats.overdueCount
    ? { text: 'Send a friendly rent reminder', action: 'SEND_RENT_REMINDERS' }
    : stats.pendingRequests ? { text: 'Review the waiting bed requests', action: 'REVIEW_BED_REQUESTS' }
      : stats.ticketsOpen ? { text: 'Check the open maintenance issues', action: 'OPEN_MAINTENANCE' }
        : { text: 'All calm. Nothing needs you right now.', action: 'NONE' };
  return { headline: occupancy >= 80 ? 'A full and steady week' : 'Here is your week at a glance', points: points.slice(0, 4), suggestion, ai: false };
}

export interface WeeklyBriefDeps {
  writeBrief?: (stats: PulseStats) => Promise<unknown>;
}

/** Gemini's weekly brief for the owner, from this week's numbers only. */
export function createWeeklyBriefHandler(deps: WeeklyBriefDeps = {}) {
  const briefs = new LRUCache<string, z.infer<typeof briefSchema>>({ max: 500, ttl: AI_ANSWER_TTL_MS });
  return async (req: Request, res: Response): Promise<any> => {
    try {
      const scope = await scopeFor(req);
      if (!scope.length) return res.status(404).json({ message: 'No PG to summarise' });
      const seesMoney = (await accessiblePropertyIds(req, [...MONEY_ROLES])).some((id) => scope.includes(id));
      const stats = await pulseStats(scope, seesMoney);
      if (!deps.writeBrief && !aiEnabled()) return res.json({ brief: plainBrief(stats), stats });
      const key = JSON.stringify({ scope: [...scope].sort(), stats, fresh: req.body?.fresh === true ? Date.now() : 0 });
      const cached = briefs.get(key);
      if (cached) return res.json({ brief: { ...cached, ai: true }, stats });
      try {
        const raw = deps.writeBrief ? await deps.writeBrief(stats) : await generateStructured({
          system: [
            'You write a short weekly brief for the owner of a paying-guest (PG) housing business in India.',
            'Use only the numbers given. Be warm, plain and specific, like a good manager talking to the owner; no jargon, no emojis, no invented facts.',
            'Write money with the rupee sign and Indian grouping, e.g. ₹21,100, and occupancy as "9 of 20 beds". The headline and each point must say different things; never repeat a fact.',
            'Pick the single most useful next step. Never mention residents by name.'
          ].join(' '),
          parts: [{ text: `This week's numbers (null means not available to this person):\n${JSON.stringify(stats, null, 2)}` }],
          schema: briefSchema
        });
        const brief = briefSchema.parse(raw);
        briefs.set(key, brief);
        res.json({ brief: { ...brief, ai: true }, stats });
      } catch (error) {
        logger.warn({ err: error }, 'Weekly brief fell back to plain numbers');
        res.json({ brief: plainBrief(stats), stats });
      }
    } catch (error) {
      logger.error({ err: error }, 'Weekly brief error');
      res.status(500).json({ message: 'Could not write the weekly brief' });
    }
  };
}

export const postWeeklyBrief = createWeeklyBriefHandler();

// ---------------------------------------------------------------- kitchen forecast

const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
type Meal = (typeof MEALS)[number];
const plateCost = () => Math.max(1, Number(process.env.KITCHEN_PLATE_COST) || 60);

export interface KitchenSignals {
  date: string;
  weekday: string;
  planResidents: number;
  orders: Record<Meal, number>;
  lateRisers: number;
  dayWorkers: number;
  nightWorkers: number;
  sameWeekdayOrders: number[];
}

const forecastSchema = z.object({
  BREAKFAST: z.object({ plates: z.number(), why: z.string() }),
  LUNCH: z.object({ plates: z.number(), why: z.string() }),
  DINNER: z.object({ plates: z.number(), why: z.string() }),
  tip: z.string().describe('One practical tip for the cook, under 20 words')
});

/** Rule-of-thumb forecast when AI is off. */
export function ruleForecast(signals: KitchenSignals): z.infer<typeof forecastSchema> {
  const weekend = signals.weekday === 'Saturday' || signals.weekday === 'Sunday';
  const plan = signals.planResidents;
  const breakfast = plan - Math.round(signals.lateRisers * 0.7);
  const lunch = weekend ? plan - Math.round(plan * 0.3) : plan - Math.round(signals.dayWorkers * 0.8);
  const dinner = weekend ? plan - Math.round(plan * 0.2) : plan - Math.round(signals.nightWorkers * 0.5);
  return {
    BREAKFAST: { plates: breakfast + signals.orders.BREAKFAST, why: signals.lateRisers ? `${signals.lateRisers} late risers usually skip it` : 'Everyone on the plan is usually in' },
    LUNCH: { plates: lunch + signals.orders.LUNCH, why: weekend ? 'Weekends: many eat out' : signals.dayWorkers ? `${signals.dayWorkers} are at work or college in the day` : 'Most are in for lunch' },
    DINNER: { plates: dinner + signals.orders.DINNER, why: weekend ? 'Some are out on weekend evenings' : signals.nightWorkers ? `${signals.nightWorkers} work evenings` : 'Dinner is the busiest meal' },
    tip: 'Keep a little extra rice and dal ready for late arrivals.'
  };
}

export interface KitchenForecastDeps {
  forecast?: (signals: KitchenSignals) => Promise<unknown>;
}

/** Plates per meal for one PG and day, with the reason and the food saved. */
export function createKitchenForecastHandler(deps: KitchenForecastDeps = {}) {
  const forecasts = new LRUCache<string, z.infer<typeof forecastSchema>>({ max: 500, ttl: AI_ANSWER_TTL_MS });
  return async (req: Request, res: Response): Promise<any> => {
    try {
      const allowed = await accessiblePropertyIds(req, ['OWNER', 'WARDEN', 'COOK']);
      const propertyId = String(req.query.propertyId || allowed[0] || '');
      if (!propertyId || !allowed.includes(propertyId)) return res.status(404).json({ message: 'PG not found' });
      const dateText = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : new Date(Date.now() + DAY).toISOString().slice(0, 10);
      const date = new Date(`${dateText}T00:00:00.000Z`);
      const weekday = date.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });

      const residents = await db.pGTenant.findMany({
        where: { propertyId, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] }, foodOptOut: false },
        select: { vibeAnswers: true, bed: { select: { room: { select: { foodIncluded: true, foodCharge: true } } } } }
      });
      const onPlan = residents.filter((resident: any) => resident.bed?.room && (resident.bed.room.foodIncluded || (resident.bed.room.foodCharge ?? 0) > 0));
      const habits = onPlan.map((resident: any) => cleanVibeAnswers(resident.vibeAnswers) ?? {});
      const orders = await db.pGServiceOrder.groupBy({
        by: ['slot'], where: { propertyId, type: 'MEAL', forDate: date, status: { not: 'CANCELLED' } }, _sum: { quantity: true }
      });
      const ordered = Object.fromEntries(MEALS.map((meal) => [meal, 0])) as Record<Meal, number>;
      for (const row of orders) if ((MEALS as readonly string[]).includes(row.slot)) ordered[row.slot as Meal] = row._sum.quantity ?? 0;
      const past = await Promise.all([1, 2, 3, 4].map((weeks) => db.pGServiceOrder.count({
        where: { propertyId, type: 'MEAL', forDate: new Date(date.getTime() - weeks * 7 * DAY), status: { not: 'CANCELLED' } }
      })));
      const signals: KitchenSignals = {
        date: dateText, weekday,
        planResidents: onPlan.length,
        orders: ordered,
        lateRisers: habits.filter((answers: any) => answers.wake === 2).length,
        dayWorkers: habits.filter((answers: any) => answers.schedule === 0).length,
        nightWorkers: habits.filter((answers: any) => answers.schedule === 2).length,
        sameWeekdayOrders: past
      };

      let forecast = ruleForecast(signals);
      let ai = false;
      const forecastKey = JSON.stringify({ propertyId, signals });
      const known = forecasts.get(forecastKey);
      if (known) {
        forecast = known;
        ai = true;
      } else if (deps.forecast || aiEnabled()) {
        try {
          const raw = deps.forecast ? await deps.forecast(signals) : await generateStructured({
            system: [
              'You help the cook of an Indian paying-guest (PG) kitchen decide how many plates to make for each meal tomorrow, to cut food waste without anyone going hungry.',
              'Residents on the food plan eat by default; orders are extra plates already booked. Use the routine counts: late risers often skip breakfast, day workers or students often miss lunch on weekdays, evening workers may miss dinner, weekends are lighter.',
              'Give whole plates per meal with a short reason (under 12 words) and one practical tip. Never go below the booked orders.'
            ].join(' '),
            parts: [{ text: JSON.stringify(signals) }],
            schema: forecastSchema
          });
          forecast = forecastSchema.parse(raw);
          forecasts.set(forecastKey, forecast);
          ai = true;
        } catch (error) {
          logger.warn({ err: error }, 'Kitchen forecast fell back to rules');
        }
      }

      const meals = MEALS.map((meal) => {
        const cookingForAll = signals.planResidents + ordered[meal];
        const plates = Math.max(ordered[meal], Math.min(cookingForAll, Math.round(forecast[meal].plates)));
        return { meal, plates, cookingForAll, orders: ordered[meal], why: forecast[meal].why.slice(0, 120) };
      });
      const platesSaved = meals.reduce((sum, meal) => sum + (meal.cookingForAll - meal.plates), 0);
      res.json({
        propertyId, date: dateText, weekday, ai,
        planResidents: signals.planResidents,
        meals,
        tip: forecast.tip.slice(0, 160),
        saved: { plates: platesSaved, rupees: platesSaved * plateCost(), perMonth: platesSaved * plateCost() * 30, plateCost: plateCost() }
      });
    } catch (error) {
      logger.error({ err: error }, 'Kitchen forecast error');
      res.status(500).json({ message: 'Could not forecast the kitchen' });
    }
  };
}

export const getKitchenForecast = createKitchenForecastHandler();

/** A one-minute pass for the owner's live voice briefing. */
export const postBriefingPass = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Sign in again to continue' });
  if (!vibeLiveEnabled()) return res.status(503).json({ message: 'Voice briefing is not available right now. The written brief is above.' });
  const scope = await accessiblePropertyIds(req, ['OWNER', 'WARDEN', 'ACCOUNTANT']);
  if (!scope.length) return res.status(404).json({ message: 'There is no PG to brief you on yet' });
  res.json({ pass: issueBriefingPass(user.id) });
};
