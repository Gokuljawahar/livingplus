// Controlled backend tool catalogue (PG OS §8). The model may propose a
// call, but every executor re-validates arguments and enforces role +
// property scope server-side. Tool outputs are concise and structured; the
// model must never fabricate fields the tools did not return.

import { randomUUID } from 'crypto';
import { prisma } from '../app.js';
import { consumePhoneToken } from '../controllers/pg-auth.controller.js';
import {
  ACTIVE_ROOM_CHANGE_STATUSES,
  canTransitionRoomChange,
  maskSwapPartner,
  parseRoomPreferences,
  roomPreferencesCompatible
} from '../utils/room-change.js';
import { logAudit } from './pg-audit.js';
import { sendDueRentReminders } from './pg-rent-reminders.js';
import { createExpense, listExpenses } from './pg-expenses.js';
import { notifyWhatsAppTemplate } from './pg-notifications.js';

const db = new Proxy({} as Record<string, any>, {
  get: (_target, property) => (prisma as any)[property]
});

export interface Actor {
  userId: string | null;
  role: string;
  phones: string[];
  propertyIds: string[];
  isSuperAdmin: boolean;
  propertyId?: string;
}

export async function actorFromRequest(req: any): Promise<Actor> {
  const user = (req as any).user || {};
  const role = String(user.role || 'GUEST');
  const account = user.userId && user.userId !== 'env-admin'
    ? await db.user.findUnique({ where: { id: String(user.userId) }, select: { phone: true } }).catch(() => null)
    : null;
  const digits = String(account?.phone || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  const phoneVariants = digits.length > 10 ? digits.slice(-10) : digits;
  const phones = [...new Set([digits, normalized, phoneVariants].filter(Boolean))];
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const hostPropertyId = typeof req.pgPropertyId === 'string' ? req.pgPropertyId : undefined;
  let propertyIds: string[] = [];
  if (isSuperAdmin) {
    if (hostPropertyId) propertyIds = [hostPropertyId];
    else {
      const all = await db.pGProperty.findMany({ select: { id: true } });
      propertyIds = all.map((p: any) => p.id);
    }
  } else if (role === 'PG_TENANT' && phones.length && (hostPropertyId || user.propertyId)) {
    const tenantPropertyId = hostPropertyId || String(user.propertyId);
    const stays = await db.pGTenant.findMany({
      where: { propertyId: tenantPropertyId, phone: { in: phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
      select: { propertyId: true }
    });
    if (stays.length) propertyIds = [tenantPropertyId];
  } else if (user.userId) {
    const access = await db.pGPropertyAccess.findMany({ where: { userId: String(user.userId) }, select: { propertyId: true } });
    propertyIds = access.map((a: any) => a.propertyId).filter((id: string) => !hostPropertyId || id === hostPropertyId);
  }
  const tokenPropertyId = typeof user.propertyId === 'string' ? user.propertyId : undefined;
  const effectivePropertyId = hostPropertyId || (role === 'PG_TENANT' ? tokenPropertyId : undefined);
  return { userId: user.userId ? String(user.userId) : null, role, phones, propertyIds, isSuperAdmin, ...(effectivePropertyId ? { propertyId: effectivePropertyId } : {}) };
}

export interface ToolExecutor {
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  roles: string[];
  execute: (actor: Actor, args: any) => Promise<unknown>;
}

const str = (v: unknown) => String(v || '').trim();

// Room-swap handshake helpers: resolve the caller's own active stay and
// render beds the way swap candidates see them (room context, no people).
async function residentRoomTenant(actor: Actor) {
  const propertyId = actor.propertyId;
  if (!propertyId || !actor.propertyIds.includes(propertyId) || !actor.phones.length) throw new Error('FORBIDDEN');
  const tenant = await db.pGTenant.findFirst({
    where: { propertyId, phone: { in: actor.phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
    select: { id: true, bedId: true, name: true }
  });
  if (!tenant) throw new Error('NO_TENANT_RECORD');
  return { propertyId, tenant };
}

function offeredBedView(bed: any) {
  if (!bed) return null;
  return {
    bed_id: bed.id, label: bed.label,
    room_number: bed.room?.roomNumber || null, floor: bed.room?.floor ?? null,
    room_type: bed.room?.roomType || null, monthly_rent: bed.room?.monthlyRent ?? null
  };
}

async function publicProperties(where: Record<string, unknown> = {}) {
  return db.pGProperty.findMany({
    where: { status: 'ACTIVE', ...where },
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
    execute: async (actor, args = {}) => {
      const q = str(args.location).toLowerCase();
      const properties = await publicProperties(actor.role === 'PG_TENANT' && actor.propertyId ? { id: actor.propertyId } : {});
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
    parameters: { type: 'object', properties: { property_id: { type: 'string' } } },
    requiresConfirmation: false,
    roles: ['GUEST', 'PG_TENANT', 'PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args) => {
      const requestedPropertyId = String(args.property_id || actor.propertyId || '');
      if (!requestedPropertyId) throw new Error('PROPERTY_REQUIRED');
      if (['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'].includes(actor.role) && !actor.propertyIds.includes(requestedPropertyId)) throw new Error('FORBIDDEN');
      const property = await db.pGProperty.findFirst({
        where: { id: requestedPropertyId, status: 'ACTIVE' },
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
    execute: async (actor, args) => {
      const requestedPropertyId = actor.role === 'PG_TENANT' && actor.propertyId ? actor.propertyId : String(args.property_id || '');
      if (!requestedPropertyId) throw new Error('PROPERTY_REQUIRED');
      if (['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'].includes(actor.role) && !actor.propertyIds.includes(requestedPropertyId)) throw new Error('FORBIDDEN');
      const rooms = await db.pGRoom.findMany({
        where: { propertyId: requestedPropertyId, status: 'ACTIVE', ...(args.room_id ? { id: String(args.room_id) } : {}) },
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
      if (actor.role === 'PG_TENANT' && actor.propertyId) {
        const bed = await db.pGBed.findUnique({ where: { id: String(args.bed_id) }, select: { room: { select: { propertyId: true } } } });
        if (!bed || bed.room.propertyId !== actor.propertyId) throw new Error('FORBIDDEN');
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
    execute: async (actor, args) => {
      const booking = await db.pGBooking.findUnique({
        where: { bookingRef: String(args.booking_ref) },
        include: { property: { select: { name: true, locality: true } }, bed: { include: { room: { select: { roomNumber: true } } } } }
      });
      const digits = String(args.phone).replace(/\D/g, '');
      if (!booking || booking.phone.replace(/\D/g, '') !== digits ||
        (actor.role === 'PG_TENANT' && actor.propertyId && booking.propertyId !== actor.propertyId) ||
        (['PG_OWNER', 'PG_WARDEN'].includes(actor.role) && !actor.propertyIds.includes(booking.propertyId))) throw new Error('BOOKING_NOT_FOUND');
      return {
        booking_ref: booking.bookingRef, status: booking.status, resident_name: booking.residentName,
        move_in_date: booking.moveInDate, property: booking.property?.name,
        room: booking.bed ? `Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : null,
        rejection_reason: (booking as any).rejectionReason || null
      };
    }
  },

  get_my_stay: {
    description: 'Show the signed-in resident’s stay, room and rent balance on the current PG host. Residents only.',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    roles: ['PG_TENANT'],
    execute: async (actor) => {
      if (!actor.propertyId || !actor.phones.length || !actor.propertyIds.includes(actor.propertyId)) throw new Error('RESIDENT_HOST_REQUIRED');
      const tenant = await db.pGTenant.findFirst({
        where: { propertyId: actor.propertyId, phone: { in: actor.phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'] } },
        include: {
          property: { select: { name: true, locality: true, city: true } },
          bed: { include: { room: { select: { roomNumber: true, roomType: true } } } },
          rentEntries: { where: { status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] } }, orderBy: { dueDate: 'asc' }, take: 20 }
        }
      });
      if (!tenant) throw new Error('NO_TENANT_RECORD');
      return {
        resident: tenant.name,
        property: tenant.property.name,
        locality: tenant.property.locality,
        city: tenant.property.city,
        room: tenant.bed ? `Room ${tenant.bed.room.roomNumber}, ${tenant.bed.label} (${tenant.bed.room.roomType})` : null,
        status: tenant.status,
        monthly_rent: tenant.monthlyRent,
        outstanding_total: tenant.rentEntries.reduce((total: number, entry: any) => total + Math.max(0, entry.amount - entry.paidAmount), 0),
        outstanding_entries: tenant.rentEntries.map((entry: any) => ({ period: entry.period, type: entry.entryType, amount_due: Math.max(0, entry.amount - entry.paidAmount), status: entry.status, due_date: entry.dueDate }))
      };
    }
  },

  get_my_maintenance_requests: {
    description: 'List the signed-in resident’s maintenance requests and statuses on the current PG host.',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    roles: ['PG_TENANT'],
    execute: async (actor) => {
      if (!actor.propertyId || !actor.phones.length || !actor.propertyIds.includes(actor.propertyId)) throw new Error('RESIDENT_HOST_REQUIRED');
      const tenant = await db.pGTenant.findFirst({
        where: { propertyId: actor.propertyId, phone: { in: actor.phones } },
        select: { id: true }
      });
      if (!tenant) throw new Error('NO_TENANT_RECORD');
      return db.pGMaintenanceTicket.findMany({
        where: { propertyId: actor.propertyId, tenantId: tenant.id },
        select: { title: true, description: true, category: true, status: true, priority: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 25
      });
    }
  },

  create_maintenance_ticket: {
    description: 'File a maintenance ticket for the resident’s own active stay on this PG host.',
    parameters: {
      type: 'object',
      properties: {
        property_id: { type: 'string', description: 'Optional; the current resident PG host is used automatically.' }, title: { type: 'string' }, description: { type: 'string' },
        category: { type: 'string' }, image_key: { type: 'string' }
      },
      required: ['title', 'description']
    },
    requiresConfirmation: true,
    roles: ['PG_TENANT'],
    execute: async (actor, args) => {
      const propertyId = actor.propertyId;
      if (!propertyId || !actor.propertyIds.includes(propertyId) || (args.property_id && String(args.property_id) !== propertyId) || !actor.phones.length) throw new Error('FORBIDDEN');
      const tenant = await db.pGTenant.findFirst({ where: { propertyId, phone: { in: actor.phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } }, select: { id: true, bedId: true } });
      if (!tenant) throw new Error('NO_TENANT_RECORD');
      const category = str(args.category || 'OTHER').toUpperCase();
      if (!['PLUMBING', 'ELECTRICAL', 'APPLIANCE', 'CLEANING', 'SAFETY', 'PEST', 'OTHER'].includes(category)) throw new Error('INVALID_CATEGORY');
      const ticket = await db.pGMaintenanceTicket.create({
        data: {
          propertyId, tenantId: tenant.id, bedId: tenant.bedId, title: str(args.title).slice(0, 120),
          description: str(args.description).slice(0, 2000), category,
          imageUrl: str(args.image_key) || null
        }
      });
      logAudit(propertyId, actor.userId, 'TICKET_CREATED_VIA_AI', 'PGMaintenanceTicket', ticket.id, ticket.title);
      return { ticket_id: ticket.id, status: ticket.status, category: ticket.category };
    }
  },

  request_room_change: {
    description: 'Open a room swap or room move request for the signed-in resident’s own active stay. Swaps match with another resident; moves target a vacant bed.',
    parameters: {
      type: 'object',
      properties: {
        request_type: { type: 'string', enum: ['SWAP', 'MOVE'] },
        to_bed_id: { type: 'string', description: 'Required for MOVE: a vacant bed id from find_room_change_matches. Never set for SWAP.' },
        preferences: { type: 'object', description: 'Swap preferences such as floor or room type; unstated means flexible.' },
        reason: { type: 'string' }
      },
      required: ['request_type']
    },
    requiresConfirmation: true,
    roles: ['PG_TENANT'],
    execute: async (actor, args) => {
      const { propertyId, tenant } = await residentRoomTenant(actor);
      const requestType = str(args.request_type).toUpperCase();
      if (requestType !== 'SWAP' && requestType !== 'MOVE') throw new Error('INVALID_REQUEST_TYPE');
      if (!tenant.bedId) throw new Error('NO_BED_ASSIGNED');
      const existing = await db.pGRoomChangeRequest.findFirst({
        where: { propertyId, requesterId: tenant.id, status: { in: [...ACTIVE_ROOM_CHANGE_STATUSES] } },
        select: { id: true, status: true, requestType: true }
      });
      if (existing) return { request_id: existing.id, status: existing.status, already_open: true };
      let toBedId: string | null = null;
      if (requestType === 'MOVE') {
        toBedId = str(args.to_bed_id);
        if (!toBedId) throw new Error('BED_REQUIRED');
        const bed = await db.pGBed.findFirst({
          where: { id: toBedId, status: 'AVAILABLE', room: { propertyId, status: 'ACTIVE' } },
          select: { id: true }
        });
        if (!bed) throw new Error('BED_UNAVAILABLE');
      } else if (str(args.to_bed_id)) {
        throw new Error('SWAP_MATCHES_LATER');
      }
      const preferences = parseRoomPreferences(args.preferences);
      const row = await db.pGRoomChangeRequest.create({
        data: {
          propertyId, requesterId: tenant.id, requestType, fromBedId: tenant.bedId, toBedId,
          preferences: Object.keys(preferences).length ? JSON.stringify(preferences) : null,
          reason: str(args.reason).slice(0, 500) || null
        }
      });
      logAudit(propertyId, actor.userId, 'ROOM_CHANGE_REQUESTED_VIA_AI', 'PGRoomChangeRequest', row.id, requestType);
      return { request_id: row.id, status: row.status, request_type: row.requestType };
    }
  },

  get_my_room_change_requests: {
    description: 'List the signed-in resident’s room swap / move requests, including proposals awaiting their answer.',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    roles: ['PG_TENANT'],
    execute: async (actor) => {
      const { propertyId, tenant } = await residentRoomTenant(actor);
      const rows = await db.pGRoomChangeRequest.findMany({
        where: { propertyId, OR: [{ requesterId: tenant.id }, { partnerId: tenant.id }] },
        include: {
          requester: { select: { name: true } },
          partner: { select: { name: true } },
          toBed: { include: { room: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 25
      });
      return rows.map((row: any) => {
        const mine = row.requesterId === tenant.id;
        const otherName = mine ? row.partner?.name : row.requester?.name;
        return {
          request_id: row.id, mine, request_type: row.requestType, status: row.status,
          reason: row.reason, preferences: parseRoomPreferences(row.preferences),
          counterparty: row.partnerId || !mine ? maskSwapPartner({ name: otherName }) : null,
          offered_bed: offeredBedView(row.toBed),
          created_at: row.createdAt, updated_at: row.updatedAt
        };
      });
    }
  },

  find_room_change_matches: {
    description: 'Find candidates for the resident’s open request: compatible swap partners (identity masked) or vacant beds for a move.',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    roles: ['PG_TENANT'],
    execute: async (actor) => {
      const { propertyId, tenant } = await residentRoomTenant(actor);
      const mine = await db.pGRoomChangeRequest.findFirst({
        where: { propertyId, requesterId: tenant.id, status: { in: [...ACTIVE_ROOM_CHANGE_STATUSES] } },
        select: { id: true, requestType: true, preferences: true }
      });
      if (!mine) throw new Error('NO_OPEN_REQUEST');
      if (mine.requestType === 'MOVE') {
        const beds = await db.pGBed.findMany({
          where: { status: 'AVAILABLE', room: { propertyId, status: 'ACTIVE' } },
          include: { room: true },
          orderBy: { label: 'asc' },
          take: 20
        });
        return { request_id: mine.id, request_type: 'MOVE', vacant_beds: beds.map(offeredBedView) };
      }
      const prefs = parseRoomPreferences(mine.preferences);
      const others = await db.pGRoomChangeRequest.findMany({
        where: { propertyId, requestType: 'SWAP', status: 'PENDING_MATCH', requesterId: { not: tenant.id } },
        include: {
          requester: { select: { id: true, name: true } },
          fromBed: { include: { room: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      return {
        request_id: mine.id,
        request_type: 'SWAP',
        candidates: others.filter((row: any) => row.fromBedId).map((row: any) => ({
          their_request_id: row.id,
          partner: maskSwapPartner({
            name: row.requester?.name,
            roomNumber: row.fromBed?.room?.roomNumber,
            floor: row.fromBed?.room?.floor,
            roomType: row.fromBed?.room?.roomType
          }),
          offered_bed: offeredBedView(row.fromBed),
          compatibility: roomPreferencesCompatible(prefs, parseRoomPreferences(row.preferences)) ? 'MATCH' : 'OPEN'
        }))
      };
    }
  },

  propose_room_swap: {
    description: 'Propose a swap to another resident’s pending request. The partner accepts or declines; nothing moves until staff confirm.',
    parameters: {
      type: 'object',
      properties: { my_request_id: { type: 'string' }, their_request_id: { type: 'string' } },
      required: ['my_request_id', 'their_request_id']
    },
    requiresConfirmation: true,
    roles: ['PG_TENANT'],
    execute: async (actor, args) => {
      const { propertyId, tenant } = await residentRoomTenant(actor);
      const mine = await db.pGRoomChangeRequest.findUnique({ where: { id: String(args.my_request_id) } });
      if (!mine || mine.propertyId !== propertyId || mine.requesterId !== tenant.id) throw new Error('FORBIDDEN');
      if (!canTransitionRoomChange(mine.status, 'PROPOSED', 'REQUESTER', mine.requestType)) throw new Error('INVALID_STATE');
      const theirs = await db.pGRoomChangeRequest.findUnique({
        where: { id: String(args.their_request_id) },
        include: { requester: { select: { id: true, name: true } }, fromBed: { include: { room: true } } }
      });
      if (!theirs || theirs.propertyId !== propertyId || theirs.requestType !== 'SWAP' ||
        theirs.status !== 'PENDING_MATCH' || theirs.requesterId === tenant.id || !theirs.fromBedId) {
        throw new Error('PARTNER_UNAVAILABLE');
      }
      const updated = await db.pGRoomChangeRequest.update({
        where: { id: mine.id },
        data: { partnerId: theirs.requesterId, toBedId: theirs.fromBedId, status: 'PROPOSED' }
      });
      logAudit(propertyId, actor.userId, 'ROOM_SWAP_PROPOSED_VIA_AI', 'PGRoomChangeRequest', mine.id, theirs.id);
      return {
        request_id: updated.id,
        status: updated.status,
        partner: maskSwapPartner({
          name: theirs.requester?.name,
          roomNumber: theirs.fromBed?.room?.roomNumber,
          floor: theirs.fromBed?.room?.floor,
          roomType: theirs.fromBed?.room?.roomType
        }),
        offered_bed: offeredBedView(theirs.fromBed)
      };
    }
  },

  respond_room_swap: {
    description: 'Answer a swap proposal addressed to the signed-in resident. Accepting sends it to staff for the final move.',
    parameters: {
      type: 'object',
      properties: { request_id: { type: 'string' }, decision: { type: 'string', enum: ['ACCEPT', 'DECLINE'] } },
      required: ['request_id', 'decision']
    },
    requiresConfirmation: true,
    roles: ['PG_TENANT'],
    execute: async (actor, args) => {
      const { propertyId, tenant } = await residentRoomTenant(actor);
      const row = await db.pGRoomChangeRequest.findUnique({ where: { id: String(args.request_id) } });
      if (!row || row.propertyId !== propertyId || row.partnerId !== tenant.id) throw new Error('FORBIDDEN');
      const decision = str(args.decision).toUpperCase();
      if (decision !== 'ACCEPT' && decision !== 'DECLINE') throw new Error('INVALID_DECISION');
      const next = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
      if (!canTransitionRoomChange(row.status, next, 'PARTNER', row.requestType)) throw new Error('INVALID_STATE');
      const updated = await db.pGRoomChangeRequest.update({ where: { id: row.id }, data: { status: next } });
      logAudit(propertyId, actor.userId, 'ROOM_SWAP_RESPONDED_VIA_AI', 'PGRoomChangeRequest', row.id, updated.status);
      return {
        request_id: updated.id,
        status: updated.status,
        next: updated.status === 'ACCEPTED' ? 'Waiting for your warden or owner to confirm the move.' : null
      };
    }
  },

  list_room_change_requests: {
    description: 'List room swap and move requests across the caller’s properties, newest first. Staff only; resident phone numbers are never returned.',
    parameters: { type: 'object', properties: { status: { type: 'string', description: 'Optional status filter such as ACCEPTED or PENDING_MATCH.' } } },
    requiresConfirmation: false,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args = {}) => {
      if (!actor.propertyIds.length) throw new Error('FORBIDDEN');
      const status = str(args.status).toUpperCase();
      const rows = await db.pGRoomChangeRequest.findMany({
        where: {
          propertyId: { in: actor.propertyIds },
          ...(status ? { status } : {})
        },
        include: {
          property: { select: { name: true } },
          requester: { select: { name: true } },
          partner: { select: { name: true } },
          fromBed: { include: { room: true } },
          toBed: { include: { room: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      return rows.map((row: any) => ({
        request_id: row.id, request_type: row.requestType, status: row.status,
        property: row.property?.name || null,
        requester: row.requester?.name || null, partner: row.partner?.name || null,
        from_bed: offeredBedView(row.fromBed), to_bed: offeredBedView(row.toBed),
        reason: row.reason, decided_at: row.decidedAt, created_at: row.createdAt, updated_at: row.updatedAt
      }));
    }
  },

  decide_room_change: {
    description: 'Staff decision on a room swap or move. Approving moves the residents to their new beds atomically. Staff only, audited.',
    parameters: {
      type: 'object',
      properties: { request_id: { type: 'string' }, decision: { type: 'string', enum: ['APPROVE_AND_MOVE', 'DECLINE'] }, note: { type: 'string' } },
      required: ['request_id', 'decision']
    },
    requiresConfirmation: true,
    roles: ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'],
    execute: async (actor, args) => {
      const row = await db.pGRoomChangeRequest.findUnique({
        where: { id: String(args.request_id) },
        include: { requester: true, partner: true }
      });
      if (!row || !actor.propertyIds.includes(row.propertyId)) throw new Error('FORBIDDEN');
      const decision = str(args.decision).toUpperCase();
      if (decision !== 'APPROVE_AND_MOVE' && decision !== 'DECLINE') throw new Error('INVALID_DECISION');
      const target = decision === 'APPROVE_AND_MOVE' ? 'COMPLETED' : 'DECLINED';
      if (!canTransitionRoomChange(row.status, target, 'STAFF', row.requestType)) throw new Error('INVALID_STATE');
      if (decision === 'DECLINE') {
        const updated = await db.pGRoomChangeRequest.update({
          where: { id: row.id },
          data: { status: 'DECLINED', decidedBy: actor.userId, decidedAt: new Date() }
        });
        logAudit(row.propertyId, actor.userId, 'ROOM_CHANGE_DECLINED_VIA_AI', 'PGRoomChangeRequest', row.id, str(args.note).slice(0, 200));
        return { request_id: updated.id, status: updated.status };
      }
      const requester = await db.pGTenant.findFirst({
        where: { id: row.requesterId, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } }
      });
      if (!requester || !requester.bedId || requester.bedId !== row.fromBedId) throw new Error('STALE_BEDS');
      if (row.requestType === 'SWAP') {
        const partner = await db.pGTenant.findFirst({
          where: { id: row.partnerId || '', status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } }
        });
        if (!partner || !partner.bedId || partner.bedId !== row.toBedId) throw new Error('STALE_BEDS');
        const [, , updated] = await db.$transaction([
          db.pGTenant.update({ where: { id: requester.id }, data: { bedId: partner.bedId } }),
          db.pGTenant.update({ where: { id: partner.id }, data: { bedId: requester.bedId } }),
          db.pGRoomChangeRequest.update({
            where: { id: row.id },
            data: { status: 'COMPLETED', decidedBy: actor.userId, decidedAt: new Date() }
          }),
          db.pGRoomChangeRequest.updateMany({
            where: {
              propertyId: row.propertyId, id: { not: row.id },
              requesterId: { in: [requester.id, partner.id] },
              status: { in: [...ACTIVE_ROOM_CHANGE_STATUSES] }
            },
            data: { status: 'WITHDRAWN' }
          })
        ]);
        logAudit(row.propertyId, actor.userId, 'ROOM_SWAP_COMPLETED_VIA_AI', 'PGRoomChangeRequest', row.id, str(args.note).slice(0, 200));
        return { request_id: updated.id, status: updated.status };
      }
      const bed = await db.pGBed.findFirst({
        where: { id: row.toBedId || '', status: 'AVAILABLE', room: { propertyId: row.propertyId, status: 'ACTIVE' } }
      });
      if (!bed) throw new Error('BED_UNAVAILABLE');
      const ops: any[] = [
        db.pGRoomChangeRequest.update({
          where: { id: row.id },
          data: { status: 'COMPLETED', decidedBy: actor.userId, decidedAt: new Date() }
        }),
        db.pGTenant.update({ where: { id: requester.id }, data: { bedId: bed.id } }),
        db.pGBed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } }),
        db.pGRoomChangeRequest.updateMany({
          where: {
            propertyId: row.propertyId, id: { not: row.id },
            requesterId: requester.id, status: { in: [...ACTIVE_ROOM_CHANGE_STATUSES] }
          },
          data: { status: 'WITHDRAWN' }
        })
      ];
      if (requester.bedId) ops.push(db.pGBed.update({ where: { id: requester.bedId }, data: { status: 'AVAILABLE' } }));
      const [updated] = await db.$transaction(ops);
      logAudit(row.propertyId, actor.userId, 'ROOM_MOVE_COMPLETED_VIA_AI', 'PGRoomChangeRequest', row.id, str(args.note).slice(0, 200));
      return { request_id: updated.id, status: updated.status };
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
      const eventByTemplate: Record<string, 'BOOKING_RECEIVED' | 'BOOKING_APPROVED' | 'BOOKING_REJECTED' | 'CHECK_IN_REMINDER' | 'RENT_DUE'> = {
        booking_received: 'BOOKING_RECEIVED', booking_approved: 'BOOKING_APPROVED', booking_rejected: 'BOOKING_REJECTED',
        check_in_reminder: 'CHECK_IN_REMINDER', rent_due: 'RENT_DUE'
      };
      const event = eventByTemplate[String(args.template)];
      const digits = str(args.recipient_phone).replace(/\D/g, '');
      if (!event || !digits || !actor.propertyIds.length) throw new Error('FORBIDDEN');
      const phoneVariants = [...new Set([digits, digits.length === 10 ? `91${digits}` : digits, digits.length > 10 ? digits.slice(-10) : digits])];
      const [tenant, booking] = await Promise.all([
        db.pGTenant.findFirst({ where: { propertyId: { in: actor.propertyIds }, phone: { in: phoneVariants } }, select: { id: true, propertyId: true } }),
        db.pGBooking.findFirst({ where: { propertyId: { in: actor.propertyIds }, phone: { in: phoneVariants } }, select: { id: true, propertyId: true } })
      ]);
      const recipient = tenant || booking;
      if (!recipient) throw new Error('RECIPIENT_OUTSIDE_PROPERTY_SCOPE');
      const result = await notifyWhatsAppTemplate(event, digits);
      if (result.sent) logAudit(recipient.propertyId, actor.userId, 'NOTIFICATION_SENT_VIA_AI', tenant ? 'PGTenant' : 'PGBooking', recipient.id, String(args.template));
      return result;
    }
  }
};

export function toolDefinitionsFor(role: string): { name: string; description: string; parameters: Record<string, unknown> }[] {
  return Object.entries(toolCatalogue)
    .filter(([name, tool]) => tool.roles.includes(role) && (name !== 'send_notification' || (
      process.env.ENABLE_WHATSAPP_CLOUD_API === 'true' && Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
    )))
    .map(([name, tool]) => ({ name, description: tool.description, parameters: tool.parameters }));
}
