import type { Request } from 'express';
import { MONEY_ROLES, phoneVariants } from '@livingplus/shared';
import { db } from '../../db/index.js';
import { asSystem } from '../../db/context.js';
import { ACTIVE_RESIDENT_STATUSES } from '../../utils/resident-search.js';

/** Money endpoints: owners and accountants (DESIGN: staff roles). */
export const MONEY_ACCESS_ROLES: string[] = [...MONEY_ROLES];

/** Shared money-and-operations endpoints (expenses, utilities, reminders): also wardens. */
export const OPERATIONS_MONEY_ROLES: string[] = ['OWNER', 'WARDEN', 'ACCOUNTANT'];

export function currentUser(req: Request): { id: string; role: string; propertyId?: string } | null {
  const user = (req as any).user;
  if (!user?.userId || !user?.role) return null;
  return {
    id: String(user.userId),
    role: String(user.role),
    ...(typeof user.propertyId === 'string' ? { propertyId: user.propertyId } : {})
  };
}

export function requestPropertyId(req: Request): string | undefined {
  return typeof (req as any).pgPropertyId === 'string' ? (req as any).pgPropertyId : undefined;
}

export async function createResidentNotification(
  dbClient: any,
  input: { propertyId: string; tenantId: string; type: string; title: string; message: string; entityId?: string }
) {
  return dbClient.pGResidentNotification.create({ data: input });
}

export async function residentScope(req: Request) {
  const user = currentUser(req);
  const propertyId = requestPropertyId(req) || user?.propertyId;
  if (!user || user.role !== 'PG_TENANT' || !propertyId || (user.propertyId && user.propertyId !== propertyId)) return null;
  const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
  const tenants = account?.phone ? await db.pGTenant.findMany({
    where: { propertyId, phone: { in: phoneVariants(account.phone) } },
    select: { id: true, status: true }
  }) : [];
  return { user, propertyId, tenantIds: tenants.map((tenant: { id: string }) => tenant.id), tenants };
}

/**
 * PGs the caller currently lives in as a resident. Room moves inside those
 * properties happen through the in-portal room change, so public search and
 * new bookings must not offer them back to the same resident.
 */
export async function ownStayPropertyIds(req: Request): Promise<string[]> {
  const user = currentUser(req);
  if (!user || user.role !== 'PG_TENANT') return [];
  const ids = new Set<string>();
  if (user.propertyId) ids.add(user.propertyId);
  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const phones = phoneVariants(String(account?.phone || '')).filter(Boolean);
    if (phones.length) {
      const stays = await db.pGTenant.findMany({
        where: { phone: { in: phones }, status: { in: [...ACTIVE_RESIDENT_STATUSES] } },
        select: { propertyId: true }
      });
      for (const stay of stays) {
        if (stay.propertyId) ids.add(stay.propertyId);
      }
    }
  } catch {
    // A failed stay lookup must not break public search; fall back to the token property.
  }
  return [...ids];
}

/** The signed-in resident's own stay, or null (same ownership rule as notices). */
export async function ownStay(req: Request, tenantId: string): Promise<any | null> {
  const user = currentUser(req);
  if (!user) return null;
  const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
  const tenant = await db.pGTenant.findUnique({ where: { id: tenantId }, include: { bed: { select: { roomId: true } } } });
  const scopedPropertyId = requestPropertyId(req) || user.propertyId;
  if (!tenant || (scopedPropertyId && tenant.propertyId !== scopedPropertyId)) return null;
  const mine = phoneVariants(String(account?.phone || '')).some((variant) => [tenant.phone, String(tenant.phone || '').replace(/\D/g, '')].includes(variant));
  return mine ? tenant : null;
}

export async function canManageProperty(req: Request, propertyId: string, roles = ['OWNER', 'WARDEN']): Promise<boolean> {
  const user = currentUser(req);
  if (!user) return false;
  const scopedPropertyId = requestPropertyId(req);
  if ((scopedPropertyId && scopedPropertyId !== propertyId) || (user.propertyId && user.propertyId !== propertyId)) return false;

  const access = await db.pGPropertyAccess.findFirst({
    where: { propertyId, userId: user.id, role: { in: roles } },
    select: { id: true }
  });
  return Boolean(access);
}

export async function accessiblePropertyIds(req: Request, roles = ['OWNER', 'WARDEN']): Promise<string[]> {
  const user = currentUser(req);
  if (!user) return [];
  const scopedPropertyId = requestPropertyId(req);
  if (user.propertyId && scopedPropertyId && user.propertyId !== scopedPropertyId) return [];
  const access = await db.pGPropertyAccess.findMany({
    where: { userId: user.id, role: { in: roles } },
    select: { propertyId: true }
  });
  const propertyIds = access.map((item: { propertyId: string }) => item.propertyId);
  if (scopedPropertyId) return propertyIds.includes(scopedPropertyId) ? [scopedPropertyId] : [];
  if (user.propertyId) return propertyIds.includes(user.propertyId) ? [user.propertyId] : [];
  return propertyIds;
}

export async function releaseExpiredBookingHolds(): Promise<void> {
  return asSystem('expire stale bed holds in every PG', () => releaseExpiredBookingHoldsNow());
}

async function releaseExpiredBookingHoldsNow(): Promise<void> {
  const expiredBookings = await db.pGBooking.findMany({
    where: { status: 'PENDING', lockExpiresAt: { lte: new Date() } },
    select: { id: true, bedId: true }
  });
  if (!expiredBookings.length) return;

  await db.$transaction(async (tx: any) => {
    for (const booking of expiredBookings) {
      const expired = await tx.pGBooking.updateMany({
        where: { id: booking.id, status: 'PENDING' },
        data: { status: 'EXPIRED' }
      });
      if (expired.count && booking.bedId) {
        await tx.pGBed.updateMany({
          where: { id: booking.bedId, status: 'RESERVED' },
          data: { status: 'AVAILABLE' }
        });
      }
    }
  });
}
