// Controlled backend tool catalogue (PG OS §8). The model may propose a
// call, but every executor re-validates arguments and enforces role +
// property scope server-side. Tool outputs are concise and structured; the
// model must never fabricate fields the tools did not return.

import { randomUUID } from 'crypto';
import { prisma } from '../app.js';
import { consumePhoneToken } from '../controllers/pg-auth.controller.js';
import { logAudit } from './pg-audit.js';
import { sendDueRentReminders } from './pg-rent-reminders.js';
import { createExpense, listExpenses } from './pg-expenses.js';

const db = new Proxy({} as Record<string, any>, {
  get: (_target, property) => (prisma as any)[property]
});

export interface Actor {
  userId: string | null;
  role: string;
  phones: string[];
  propertyIds: string[];
  isSuperAdmin: boolean;
}

export async function actorFromRequest(req: any): Promise<Actor> {
  const user = (req as any).user || {};
  const role = String(user.role || 'GUEST');
  const account = user.userId && user.userId !== 'env-admin'
    ? await db.user.findUnique({ where: { id: String(user.userId) }, select: { phone: true } }).catch(() => null)
    : null;
  const digits = String(account?.phone || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  const phones = [...new Set([digits, normalized].filter(Boolean))];
  const isSuperAdmin = role === 'SUPER_ADMIN';
  let propertyIds: string[] = [];
  if (isSuperAdmin) {
    const all = await db.pGProperty.findMany({ select: { id: true } });
    propertyIds = all.map((p: any) => p.id);
  } else if (user.userId) {
    const access = await db.pGPropertyAccess.findMany({ where: { userId: String(user.userId) }, select: { propertyId: true } });
    propertyIds = access.map((a: any) => a.propertyId);
  }
  return { userId: user.userId ? String(user.userId) : null, role, phones, propertyIds, isSuperAdmin };
}

export interface ToolExecutor {
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  roles: string[];
  execute: (actor: Actor, args: any) => Promise<unknown>;
}

const str = (v: unknown) => String(v || '').trim();

async function publicProperties() {
  return db.pGProperty.findMany({
    where: { status: 'ACTIVE' },
    include: { rooms: { where: { status: 'ACTIVE' }, include: { beds: true } } },
    orderBy: { createdAt: 'desc' }
  });
}

function compactProperty(property: any) {
  const rooms = property.rooms.map((room: any) => ({
    room_id: room.id,
    room_number: room.roomNumber,
    room_type: room.roomType,
    monthly_rent: room.monthlyRent,
    deposit_amount: room.depositAmount,
    has_ac: room.hasAc,
    food_included: room.foodIncluded,
    available_beds: room.beds.filter((b: any) => b.status === 'AVAILABLE').map((b: any) => ({ bed_id: b.id, label: b.label }))
  }));
  const rents = rooms.filter((r: any) => r.available_beds.length).map((r: any) => r.monthly_rent);
  return {
    property_id: property.id, name: property.name, locality: property.locality, city: property.city,
    gender_policy: property.genderPolicy, amenities: property.amenities, house_rules: property.houseRules,
    starting_rent: rents.length ? Math.min(...rents) : null, rooms
  };
}

export const toolCatalogue: Record<string, ToolExecutor> = {
  search_properties: {
    description: 'Find published PG properties matching location, budget, gender policy, room type, AC, food and amenities.',
    parameters: { type: 'object', properties: { location: { type: 'string' }, budget_max: { type: 'number' }, gender: { type: 'string', enum: ['MEN', 'WOMEN', 'ANY'] }, room_type: { type: 'string' }, ac: { type: 'boolean' }, food_included: { type: 'boolean' }, amenities: { type: 'array', items: { type: 'string' } } } },
    requiresConfirmation: false,
    roles: ['GUEST', 'PG_TENANT', 'PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (_actor, args = {}) => {
      const q = str(args.location).toLowerCase();
      const properties = await publicProperties();
      return properties
        .filter((p: any) => !q || `${p.name} ${p.locality} ${p.city} ${p.address}`.toLowerCase().includes(q))
        .filter((p: any) => !args.gender || p.genderPolicy === 'ANY' || p.genderPolicy === args.gender)
        .filter((p: any) => !Array.isArray(args.amenities) || args.amenities.every((a: string) => (p.amenities || []).includes(a)))
        .map(compactProperty)
        .filter((p: any) => p.rooms.some((r: any) =>
          r.available_beds.length &&
          (!args.room_type || r.room_type === args.room_type) &&
          (args.ac === undefined || r.has_ac === args.ac) &&
          (args.food_included === undefined || r.food_included === args.food_included) &&
          (!args.budget_max || r.monthly_rent <= Number(args.budget_max))))
        .slice(0, 10);
    }
  },

  get_property_details: {
    description: 'Verified details, rules and current availability for one published property.',
    parameters: { type: 'object', properties: { property_id: { type: 'string' } }, required: ['property_id'] },
    requiresConfirmation: false,
    roles: ['GUEST', 'PG_TENANT', 'PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (_actor, args) => {
      const property = await db.pGProperty.findFirst({
        where: { id: String(args.property_id), status: 'ACTIVE' },
        include: { rooms: { where: { status: 'ACTIVE' }, include: { beds: true } } }
      });
      if (!property) throw new Error('PROPERTY_NOT_FOUND');
      return compactProperty(property);
    }
  },

  check_bed_availability: {
    description: 'Fresh bed-level availability for a property, optionally one room.',
    parameters: { type: 'object', properties: { property_id: { type: 'string' }, room_id: { type: 'string' } }, required: ['property_id'] },
    requiresConfirmation: false,
    roles: ['GUEST', 'PG_TENANT', 'PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (_actor, args) => {
      const rooms = await db.pGRoom.findMany({
        where: { propertyId: String(args.property_id), status: 'ACTIVE', ...(args.room_id ? { id: String(args.room_id) } : {}) },
        include: { beds: true }
      });
      return rooms.map((room: any) => ({
        room_id: room.id, room_number: room.roomNumber,
        beds: room.beds.map((bed: any) => ({ bed_id: bed.id, label: bed.label, status: bed.status }))
      }));
    }
  },

  create_booking_request: {
    description: 'Create a PENDING booking request. Only call after the resident explicitly confirmed bed, date, rent and deposit.',
    parameters: {
      type: 'object',
      properties: {
        bed_id: { type: 'string' }, move_in_date: { type: 'string' }, resident_name: { type: 'string' },
        phone: { type: 'string' }, phone_token: { type: 'string' }, idempotency_key: { type: 'string' }
      },
      required: ['bed_id', 'move_in_date', 'resident_name', 'phone', 'phone_token']
    },
    requiresConfirmation: true,
    roles: ['GUEST', 'PG_TENANT'],
    execute: async (actor, args) => {
      const moveIn = new Date(String(args.move_in_date));
      if (Number.isNaN(moveIn.getTime())) throw new Error('INVALID_DATE');
      const digits = String(args.phone).replace(/\D/g, '');
      const normalized = digits.length === 10 ? `91${digits}` : digits;
      const idemKey = typeof args.idempotency_key === 'string' && args.idempotency_key.trim() ? args.idempotency_key.trim().slice(0, 80) : null;
      if (idemKey) {
        const existing = await db.pGBooking.findUnique({ where: { idempotencyKey: idemKey } });
        if (existing) return { booking_ref: existing.bookingRef, status: existing.status, move_in_date: existing.moveInDate, deduped: true };
      }
      if (!await consumePhoneToken(normalized, String(args.phone_token))) throw new Error('PHONE_NOT_VERIFIED');
      const booking = await db.$transaction(async (tx: any) => {
        const bed = await tx.pGBed.findFirst({
          where: { id: String(args.bed_id), status: 'AVAILABLE', room: { status: 'ACTIVE', property: { status: 'ACTIVE' } } },
          include: { room: { include: { property: true } } }
        });
        if (!bed) throw new Error('BED_UNAVAILABLE');
        const locked = await tx.pGBed.updateMany({ where: { id: bed.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
        if (locked.count !== 1) throw new Error('BED_UNAVAILABLE');
        const lockMinutes = bed.room.property.bookingLockMinutes || 120;
        return tx.pGBooking.create({
          data: {
            propertyId: bed.room.propertyId, bookingRef: `PG-${randomUUID().toUpperCase()}`, bedId: bed.id,
            residentName: str(args.resident_name), phone: digits, moveInDate: moveIn,
            lockExpiresAt: new Date(Date.now() + lockMinutes * 60 * 1000),
            idempotencyKey: idemKey
          }
        });
      });
      logAudit(booking.propertyId, actor.userId, 'BOOKING_CREATED_VIA_AI', 'PGBooking', booking.id, booking.residentName);
      return { booking_ref: booking.bookingRef, status: booking.status, move_in_date: booking.moveInDate };
    }
  },

  get_booking_status: {
    description: 'Status of the caller’s own booking. Never reveal whether other records exist.',
    parameters: { type: 'object', properties: { booking_ref: { type: 'string' }, phone: { type: 'string' } }, required: ['booking_ref', 'phone'] },
    requiresConfirmation: false,
    roles: ['GUEST', 'PG_TENANT', 'PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (_actor, args) => {
      const booking = await db.pGBooking.findUnique({
        where: { bookingRef: String(args.booking_ref) },
        include: { property: { select: { name: true, locality: true } }, bed: { include: { room: { select: { roomNumber: true } } } } }
      });
      const digits = String(args.phone).replace(/\D/g, '');
      if (!booking || booking.phone.replace(/\D/g, '') !== digits) throw new Error('BOOKING_NOT_FOUND');
      return {
        booking_ref: booking.bookingRef, status: booking.status, resident_name: booking.residentName,
        move_in_date: booking.moveInDate, property: booking.property?.name,
        room: booking.bed ? `Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : null,
        rejection_reason: (booking as any).rejectionReason || null
      };
    }
  },

  create_maintenance_ticket: {
    description: 'File a maintenance ticket for an authenticated resident’s property.',
    parameters: {
      type: 'object',
      properties: {
        property_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
        category: { type: 'string' }, image_key: { type: 'string' }
      },
      required: ['property_id', 'title', 'description']
    },
    requiresConfirmation: true,
    roles: ['PG_TENANT', 'PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args) => {
      const property = await db.pGProperty.findFirst({ where: { id: String(args.property_id), status: 'ACTIVE' }, select: { id: true } });
      if (!property) throw new Error('PROPERTY_NOT_FOUND');
      const tenant = actor.phones.length
        ? await db.pGTenant.findFirst({ where: { propertyId: property.id, phone: { in: actor.phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } }, select: { id: true } })
        : null;
      const ticket = await db.pGMaintenanceTicket.create({
        data: {
          propertyId: property.id, tenantId: tenant?.id || null, title: str(args.title).slice(0, 120),
          description: str(args.description).slice(0, 2000), category: str(args.category || 'OTHER').toUpperCase() || 'OTHER',
          imageUrl: str(args.image_key) || null
        }
      });
      logAudit(property.id, actor.userId, 'TICKET_CREATED_VIA_AI', 'PGMaintenanceTicket', ticket.id, ticket.title);
      return { ticket_id: ticket.id, status: ticket.status, category: ticket.category };
    }
  },

  get_occupancy_report: {
    description: 'Occupancy aggregates for properties the caller may access.',
    parameters: { type: 'object', properties: { property_id: { type: 'string' }, period: { type: 'string' } } },
    requiresConfirmation: false,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args) => {
      const scope = args.property_id ? [String(args.property_id)] : actor.propertyIds;
      if (args.property_id && !actor.propertyIds.includes(String(args.property_id))) throw new Error('FORBIDDEN');
      const [properties, activeTenants, pendingBookings] = await Promise.all([
        db.pGProperty.findMany({ where: { id: { in: scope } }, include: { rooms: { include: { beds: true } } } }),
        db.pGTenant.count({ where: { propertyId: { in: scope }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } } }),
        db.pGBooking.count({ where: { propertyId: { in: scope }, status: 'PENDING' } })
      ]);
      const totalBeds = properties.reduce((t: number, p: any) => t + p.rooms.reduce((r: number, room: any) => r + room.beds.length, 0), 0);
      const availableBeds = properties.reduce((t: number, p: any) => t + p.rooms.reduce((r: number, room: any) => r + room.beds.filter((b: any) => b.status === 'AVAILABLE').length, 0), 0);
      return {
        properties: properties.map((p: any) => ({ property_id: p.id, name: p.name })),
        total_beds: totalBeds, occupied_beds: activeTenants, available_beds: availableBeds,
        occupancy_rate: totalBeds ? Math.round((activeTenants / totalBeds) * 100) : 0,
        pending_bookings: pendingBookings, period: str(args.period) || new Date().toISOString().slice(0, 7)
      };
    }
  },

  get_pending_rent: {
    description: 'Outstanding rent for the caller’s properties. Owners only.',
    parameters: { type: 'object', properties: { property_id: { type: 'string' }, period: { type: 'string' } } },
    requiresConfirmation: false,
    roles: ['PG_OWNER', 'SUPER_ADMIN'],
    execute: async (actor, args) => {
      const scope = args.property_id ? [String(args.property_id)] : actor.propertyIds;
      if (args.property_id && !actor.propertyIds.includes(String(args.property_id))) throw new Error('FORBIDDEN');
      const entries = await db.pGRentEntry.findMany({
        where: { tenant: { propertyId: { in: scope } }, status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] }, ...(args.period ? { period: String(args.period) } : {}) },
        include: { tenant: { select: { name: true, property: { select: { name: true } } } } }
      });
      const outstanding = entries.reduce((t: number, e: any) => t + Math.max(0, e.amount - e.paidAmount), 0);
      return {
        outstanding_total: outstanding, entries_due: entries.length,
        entries: entries.slice(0, 20).map((e: any) => ({ tenant: e.tenant.name, property: e.tenant.property.name, period: e.period, amount: e.amount, paid: e.paidAmount, status: e.status }))
      };
    }
  },

  update_maintenance_status: {
    description: 'Move a maintenance ticket through its lifecycle. Staff only, audited.',
    parameters: { type: 'object', properties: { ticket_id: { type: 'string' }, status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] } }, required: ['ticket_id', 'status'] },
    requiresConfirmation: false,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args) => {
      const ticket = await db.pGMaintenanceTicket.findUnique({ where: { id: String(args.ticket_id) } });
      if (!ticket || !actor.propertyIds.includes(ticket.propertyId)) throw new Error('FORBIDDEN');
      const updated = await db.pGMaintenanceTicket.update({ where: { id: ticket.id }, data: { status: String(args.status) } });
      logAudit(ticket.propertyId, actor.userId, 'TICKET_STATUS_VIA_AI', 'PGMaintenanceTicket', ticket.id, updated.status);
      return { ticket_id: updated.id, status: updated.status };
    }
  },

  send_rent_reminders: {
    description: 'Send rent-due reminders for outstanding entries in the caller’s properties. Returns counts only; resident phone numbers stay server-side.',
    parameters: { type: 'object', properties: { property_id: { type: 'string' }, period: { type: 'string' }, force: { type: 'boolean' } } },
    requiresConfirmation: true,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args = {}) => {
      const scope = args.property_id ? [String(args.property_id)] : actor.propertyIds;
      if (args.property_id && !actor.propertyIds.includes(String(args.property_id))) throw new Error('FORBIDDEN');
      const summary = await sendDueRentReminders(db, {
        propertyIds: scope,
        period: typeof args.period === 'string' ? args.period : undefined,
        force: args.force === true,
        actorId: actor.userId
      });
      return { sent: summary.sent, skipped: summary.skipped, total: summary.total };
    }
  },

  log_expense: {
    description: 'Record a property expense (food, staff, maintenance, utilities). Only call after the owner explicitly confirmed amount, category and date.',
    parameters: {
      type: 'object',
      properties: {
        property_id: { type: 'string' }, category: { type: 'string' },
        amount: { type: 'number' }, spent_on: { type: 'string' }, note: { type: 'string' }
      },
      required: ['property_id', 'amount']
    },
    requiresConfirmation: true,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args = {}) => {
      if (!actor.propertyIds.includes(String(args.property_id))) throw new Error('FORBIDDEN');
      const expense = await createExpense(db, actor.userId, {
        propertyId: String(args.property_id),
        category: typeof args.category === 'string' ? args.category : 'OTHER',
        amount: Number(args.amount),
        spentOn: typeof args.spent_on === 'string' ? args.spent_on : undefined,
        note: typeof args.note === 'string' ? args.note : undefined
      });
      return { expense_id: expense.id, category: expense.category, amount: expense.amount };
    }
  },

  get_expense_summary: {
    description: 'Totaled expenses by category for the caller’s properties, optionally one month (YYYY-MM).',
    parameters: { type: 'object', properties: { property_id: { type: 'string' }, period: { type: 'string' } } },
    requiresConfirmation: false,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args = {}) => {
      const scope = args.property_id ? [String(args.property_id)] : actor.propertyIds;
      if (args.property_id && !actor.propertyIds.includes(String(args.property_id))) throw new Error('FORBIDDEN');
      const { total, byCategory } = await listExpenses(db, scope, typeof args.period === 'string' ? args.period : undefined);
      return { total, by_category: byCategory, period: (typeof args.period === 'string' && args.period) || 'all' };
    }
  },

  propose_electricity_split: {
    description: 'Compute a per-tenant electricity split for a property and period and save it as a reviewable DRAFT. Nothing is billed until approve_electricity_bill runs.',
    parameters: {
      type: 'object',
      properties: {
        property_id: { type: 'string' }, period: { type: 'string' }, total_amount: { type: 'number' }
      },
      required: ['property_id', 'period', 'total_amount']
    },
    requiresConfirmation: false,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args = {}) => {
      if (!actor.propertyIds.includes(String(args.property_id))) throw new Error('FORBIDDEN');
      const { proposeElectricityBill: propose } = await import('./pg-billing.js');
      const bill = await propose(db, actor.userId, {
        propertyId: String(args.property_id), period: String(args.period || ''), totalAmount: Number(args.total_amount)
      });
      const split = JSON.parse(bill.splitJson || '[]');
      return {
        bill_id: bill.id, period: bill.period, total: bill.totalAmount,
        tenants_billed: split.length,
        rows: split.map((r: any) => ({ tenant: r.tenantName, room: r.roomNumber, share: r.share }))
      };
    }
  },

  approve_electricity_bill: {
    description: 'Approve a DRAFT electricity bill, creating one ELECTRICITY ledger entry per tenant for the period. Only call after the owner explicitly confirmed the split.',
    parameters: { type: 'object', properties: { bill_id: { type: 'string' } }, required: ['bill_id'] },
    requiresConfirmation: true,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args = {}) => {
      const { approveElectricityBill: approve } = await import('./pg-billing.js');
      const result = await approve(db, actor.userId, String(args.bill_id), actor.propertyIds);
      return { bill_id: result.bill.id, status: result.bill.status, entries: result.entries };
    }
  },

  set_meal_preference: {
    description: 'Opt the caller’s own resident record in or out of the monthly food charge. Only call after explicit confirmation.',
    parameters: { type: 'object', properties: { opt_out: { type: 'boolean' } }, required: ['opt_out'] },
    requiresConfirmation: true,
    roles: ['PG_TENANT'],
    execute: async (actor, args = {}) => {
      const { setMealPreference } = await import('./pg-billing.js');
      return setMealPreference(db, actor, args.opt_out === true);
    }
  },

  send_notification: {
    description: 'Queue an approved transactional template message. Allowlisted templates only.',
    parameters: { type: 'object', properties: { recipient_phone: { type: 'string' }, template: { type: 'string', enum: ['booking_received', 'booking_approved', 'booking_rejected', 'rent_due', 'check_in_reminder'] } }, required: ['recipient_phone', 'template'] },
    requiresConfirmation: true,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args) => {
      if (process.env.ENABLE_WHATSAPP_CLOUD_API !== 'true') {
        return { sent: false, skipped: 'channel-disabled' };
      }
      logAudit(actor.propertyIds[0] || '', actor.userId, 'NOTIFICATION_QUEUED_VIA_AI', undefined, undefined, `${args.template} -> ${str(args.recipient_phone)}`);
      return { sent: false, skipped: 'transport-not-connected' };
    }
  }
};

export function toolDefinitionsFor(role: string): { name: string; description: string; parameters: Record<string, unknown> }[] {
  return Object.entries(toolCatalogue)
    .filter(([, tool]) => tool.roles.includes(role) || tool.roles.includes('GUEST'))
    .map(([name, tool]) => ({ name, description: tool.description, parameters: tool.parameters }));
}
