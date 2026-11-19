import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../app.js';
import { featureFlags, notifyWhatsAppSafely } from '../services/pg-notifications.js';
import { consumePhoneToken } from './pg-auth.controller.js';
import { logAudit } from '../services/pg-audit.js';
import { sendDueRentReminders } from '../services/pg-rent-reminders.js';
import { createExpense, deleteExpense, listExpenses } from '../services/pg-expenses.js';
import { calculateMonthlyRent, ensureFoodEntries } from '../services/pg-billing.js';
import { createUniquePgSlug } from '../utils/pg-slug.js';
import { buildGuestBookingWhere, isPlaceholderResidentName } from '../utils/guest-bookings.js';
import { ACTIVE_RESIDENT_STATUSES, OWN_PROPERTY_BOOKING_MESSAGE, ownPropertyExclusionWhere } from '../utils/resident-search.js';
import { periodOf, periodRange } from '../utils/app-time.js';
import { firebaseWebConfig, googleSignInEnabled, otpProvider } from '../services/phone-verification.js';
import { INVALID_REQUEST, parseBody } from '../utils/validate.js';
import { minSemanticScore, scheduleSearchIndex, semanticScores, semanticSearchEnabled } from '../services/semantic-search.js';
import { bookingRequestBody, paymentClaimBody, paymentClaimReviewBody, rentEntryBody, rentPaymentBody } from '../validation/pg.schemas.js';
import { logger } from '../utils/logger.js';
import { isBloodGroup, isGenderPolicy, isKycType, isValidUpiId, LIMITS, MESSAGES } from '@livingplus/shared';
import { cancelBookingBody, checkOutTenantBody, createMaintenanceTicketBody, createOwnerExpenseBody, createPropertyBody, createPropertyStaffBody, createRoomBody, createTenantTicketBody, markDepositRefundedBody, proposeElectricityBillBody, sendRentRemindersBody, updateBedStatusBody, updateBookingStatusBody, updateMaintenanceStatusBody, updatePropertyBody, updateResidentProfileBody, updateTenantProfileBody } from '../validation/request.schemas.js';

function phoneVariants(phone: string): string[] {
  const digits = String(phone || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return [...new Set([digits, normalized, normalized.length > 10 ? normalized.slice(-10) : normalized])];
}

const db = new Proxy({} as Record<string, any>, {
  get: (_target, property) => (prisma as any)[property]
});

export function currentUser(req: Request): { id: string; role: string; propertyId?: string } | null {
  const user = (req as any).user;
  if (!user?.userId || !user?.role) return null;
  return {
    id: String(user.userId),
    role: String(user.role),
    ...(typeof user.propertyId === 'string' ? { propertyId: user.propertyId } : {})
  };
}

function requestPropertyId(req: Request): string | undefined {
  return typeof (req as any).pgPropertyId === 'string' ? (req as any).pgPropertyId : undefined;
}

async function createResidentNotification(dbClient: any, input: { propertyId: string; tenantId: string; type: string; title: string; message: string; entityId?: string }) {
  return dbClient.pGResidentNotification.create({ data: input });
}

async function residentScope(req: Request) {
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
// PGs the caller currently lives in as a resident. Room moves inside those
// properties happen through the in-portal room change, so public search and
// new bookings must not offer them back to the same resident.
async function ownStayPropertyIds(req: Request): Promise<string[]> {
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

export async function canManageProperty(req: Request, propertyId: string, roles = ['OWNER', 'WARDEN']): Promise<boolean> {
  const user = currentUser(req);
  if (!user) return false;
  const scopedPropertyId = requestPropertyId(req);
  if ((scopedPropertyId && scopedPropertyId !== propertyId) || (user.propertyId && user.propertyId !== propertyId)) return false;
  if (user.role === 'SUPER_ADMIN') return true;

  const access = await db.pGPropertyAccess.findFirst({
    where: { propertyId, userId: user.id, role: { in: roles } },
    select: { id: true }
  });
  return Boolean(access);
}

async function accessiblePropertyIds(req: Request, roles = ['OWNER', 'WARDEN']): Promise<string[]> {
  const user = currentUser(req);
  if (!user) return [];
  const scopedPropertyId = requestPropertyId(req);
  if (user.propertyId && scopedPropertyId && user.propertyId !== scopedPropertyId) return [];
  if (user.role === 'SUPER_ADMIN') {
    if (scopedPropertyId) return [scopedPropertyId];
    const properties = await db.pGProperty.findMany({ select: { id: true } });
    return properties.map((property: { id: string }) => property.id);
  }

  const access = await db.pGPropertyAccess.findMany({
    where: { userId: user.id, role: { in: roles } },
    select: { propertyId: true }
  });
  const propertyIds = access.map((item: { propertyId: string }) => item.propertyId);
  if (scopedPropertyId) return propertyIds.includes(scopedPropertyId) ? [scopedPropertyId] : [];
  if (user.propertyId) return propertyIds.includes(user.propertyId) ? [user.propertyId] : [];
  return propertyIds;
}

async function releaseExpiredBookingHolds(): Promise<void> {
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

export const getPublicConfig = async (_req: Request, res: Response): Promise<any> => {
  const provider = otpProvider();
  res.json({
    whatsappCloudApiEnabled: featureFlags.whatsappCloudApi,
    upiPaymentEnabled: featureFlags.upiPayment,
    phoneVerification: { provider, ...(provider === 'firebase' ? { firebase: firebaseWebConfig() } : {}) },
    googleSignIn: googleSignInEnabled() ? { firebase: firebaseWebConfig() } : null
  });
};

/**
 * Meaning-based search over published PGs. Returns ranked property ids; the
 * client combines them with its own keyword match and filters. Responds with
 * semantic: false (and no results) when semantic search is off or failing,
 * so the client simply keeps its keyword search.
 */
export const searchPropertiesSemantic = async (req: Request, res: Response): Promise<any> => {
  const query = String(req.query.q || '').trim().slice(0, 200);
  if (query.length < 2 || !semanticSearchEnabled()) return res.json({ semantic: false, results: [] });
  try {
    const hiddenPropertyIds = await ownStayPropertyIds(req);
    const where = {
      ...ownPropertyExclusionWhere(hiddenPropertyIds),
      ...(requestPropertyId(req) ? { id: requestPropertyId(req) } : {})
    };
    const scores = await semanticScores(query, where);
    const minimum = minSemanticScore();
    const results = [...scores.entries()]
      .filter(([, score]) => score >= minimum)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([propertyId, score]) => ({ propertyId, score: Math.round(score * 1000) / 1000 }));
    res.json({ semantic: true, results });
  } catch (error) {
    logger.warn({ err: error }, 'Semantic search failed; client falls back to keyword search');
    res.json({ semantic: false, results: [] });
  }
};

export const listProperties = async (req: Request, res: Response): Promise<any> => {
  const search = String(req.query.search || '').trim();
  const locality = String(req.query.locality || '').trim();
  const genderPolicy = String(req.query.genderPolicy || '').trim();

  try {
    await releaseExpiredBookingHolds();
    const hiddenPropertyIds = await ownStayPropertyIds(req);
    const properties = await db.pGProperty.findMany({
      where: {
        status: 'ACTIVE',
        ...ownPropertyExclusionWhere(hiddenPropertyIds),
        ...(requestPropertyId(req) ? { id: requestPropertyId(req) } : {}),
        ...(locality ? { locality: { contains: locality, mode: 'insensitive' } } : {}),
        ...(genderPolicy ? { genderPolicy: { in: [genderPolicy, 'ANY'] } } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { locality: { contains: search, mode: 'insensitive' } },
            { address: { contains: search, mode: 'insensitive' } }
          ]
        } : {})
      },
      include: {
        rooms: {
          where: { status: 'ACTIVE' },
          include: { beds: { where: { status: 'AVAILABLE' } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(properties.map((property: any) => {
      const ownerPhone = String(property.contactPhone || '').replace(/\D/g, '');
      return {
        ...property,
        managerPhone: ownerPhone.length === 10 ? `91${ownerPhone}` : ownerPhone || null,
        availableBeds: property.rooms.reduce((total: number, room: any) => total + room.beds.length, 0),
        rooms: property.rooms.map((room: any) => ({ ...room, availableBeds: room.beds.length }))
      };
    }));
  } catch (error) {
    logger.error({ err: error }, 'PG property search error');
    res.status(500).json({ message: 'Failed to search properties' });
  }
};

export const listOwnerProperties = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req);
    const properties = await db.pGProperty.findMany({
      where: { id: { in: propertyIds } },
      include: { rooms: { include: { beds: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(properties);
  } catch (error) {
    logger.error({ err: error }, 'PG owner property list error');
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
};

export const createProperty = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(createPropertyBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const user = currentUser(req);
  const { name, description, address, locality, contactPhone, upiId, landmark, city, pincode, latitude, longitude, genderPolicy, amenities, houseRules, photoUrls } = input;
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  if (!['SUPER_ADMIN', 'PG_OWNER'].includes(user.role)) {
    return res.status(403).json({ message: 'Only property owners can add properties' });
  }
  if (!name?.trim() || !address?.trim() || !locality?.trim()) {
    return res.status(400).json({ message: 'Property name, address and locality are required' });
  }
  if (upiId && !isValidUpiId(String(upiId))) {
    return res.status(400).json({ message: MESSAGES.upiId });
  }

  try {
    const property = await db.pGProperty.create({
      data: {
        slug: await createUniquePgSlug(db, name),
        name: name.trim(),
        description: description?.trim() || null,
        address: address.trim(),
        locality: locality.trim(),
        contactPhone: contactPhone ? String(contactPhone).replace(/\D/g, '') : null,
        upiId: upiId ? String(upiId).trim() : null,
        landmark: landmark?.trim() || null,
        city: city?.trim() || 'Chennai',
        pincode: pincode?.trim() || null,
        latitude: latitude !== undefined && latitude !== '' && Number.isFinite(Number(latitude)) ? Number(latitude) : null,
        longitude: longitude !== undefined && longitude !== '' && Number.isFinite(Number(longitude)) ? Number(longitude) : null,
        genderPolicy: isGenderPolicy(String(genderPolicy)) ? genderPolicy : 'ANY',
        amenities: Array.isArray(amenities) ? amenities : [],
        houseRules: Array.isArray(houseRules) ? houseRules : [],
        photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
        access: { create: { userId: user.id, role: 'OWNER' } }
      }
    });
    logAudit(property.id, user.id, 'PROPERTY_CREATED', 'PGProperty', property.id, property.name);
    scheduleSearchIndex(property.id);
    res.status(201).json(property);
  } catch (error) {
    logger.error({ err: error }, 'PG property creation error');
    res.status(500).json({ message: 'Failed to create property' });
  }
};

export const updateProperty = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(updatePropertyBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const inputFields = input as Record<string, any>;
  const propertyId = String(req.params.propertyId);
  if (!await canManageProperty(req, propertyId, ['OWNER'])) {
    return res.status(403).json({ message: 'You do not have access to this property' });
  }
  const fields = ['name', 'description', 'address', 'locality', 'contactPhone', 'upiId', 'landmark', 'city', 'pincode', 'latitude', 'longitude', 'genderPolicy', 'amenities', 'houseRules', 'photoUrls', 'status', 'bookingLockMinutes', 'rentDay', 'rentDueDay'];
  for (const numeric of ['bookingLockMinutes', 'rentDay', 'rentDueDay']) {
    if (inputFields[numeric] !== undefined) {
      const value = Number(inputFields[numeric]);
      if (!Number.isInteger(value) || value < 1 || value > 1440) {
        return res.status(400).json({ message: `${numeric} must be a whole number between 1 and 1440` });
      }
      inputFields[numeric] = value;
    }
  }
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (inputFields[field] !== undefined) data[field] = inputFields[field];
  }
  if (typeof data.name === 'string') data.name = data.name.trim();
  if (typeof data.address === 'string') data.address = data.address.trim();
  if (typeof data.locality === 'string') data.locality = data.locality.trim();
  if (typeof data.contactPhone === 'string') data.contactPhone = data.contactPhone.replace(/\D/g, '') || null;
  for (const [field, limit] of [['latitude', 90], ['longitude', 180]] as const) {
    if (data[field] === undefined) continue;
    const raw = data[field];
    if (raw === null || (typeof raw === 'string' && !raw.trim())) {
      data[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || Math.abs(value) > limit) {
      return res.status(400).json({ message: `Invalid ${field}` });
    }
    data[field] = value;
  }
  if (data.upiId !== undefined) {
    const upiId = String(data.upiId || '').trim();
    if (upiId && !isValidUpiId(upiId)) {
      return res.status(400).json({ message: MESSAGES.upiId });
    }
    data.upiId = upiId || null;
  }

  try {
    const updated = await db.pGProperty.update({ where: { id: propertyId }, data });
    scheduleSearchIndex(propertyId);
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG property update error');
    res.status(500).json({ message: 'Failed to update property' });
  }
};

export const deleteProperty = async (req: Request, res: Response): Promise<any> => {
  const propertyId = String(req.params.propertyId);
  if (!await canManageProperty(req, propertyId, ['OWNER'])) {
    return res.status(403).json({ message: 'You do not have access to this property' });
  }

  try {
    const [activeTenant, openBooking] = await Promise.all([
      db.pGTenant.findFirst({ where: { propertyId, status: { in: ['ACTIVE', 'RESERVED'] } }, select: { id: true } }),
      db.pGBooking.findFirst({ where: { propertyId, status: { in: ['PENDING', 'APPROVED', 'CHECKED_IN'] } }, select: { id: true } })
    ]);
    if (activeTenant || openBooking) {
      return res.status(409).json({ message: 'Resolve active tenants and bookings before deleting this property' });
    }
    await db.pGProperty.delete({ where: { id: propertyId } });
    res.json({ message: 'Property and archived records deleted' });
  } catch (error) {
    logger.error({ err: error }, 'PG property delete error');
    res.status(500).json({ message: 'Failed to delete property' });
  }
};

export const createRoom = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(createRoomBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { propertyId } = req.params;
  const { roomNumber, floor, block, roomType, monthlyRent, depositAmount, maintenanceFee, utilitiesSurcharge, hasAc, foodIncluded, foodCharge, numberOfBeds, bedLabels } = input;
  if (!await canManageProperty(req, String(propertyId), ['OWNER'])) {
    return res.status(403).json({ message: 'You do not have access to this property' });
  }
  const bedCount = Number(numberOfBeds);
  const rent = Number(monthlyRent);
  if (!roomNumber?.trim() || !Number.isFinite(rent) || rent <= 0 || !Number.isInteger(bedCount) || bedCount < 1 || bedCount > 20) {
    return res.status(400).json({ message: 'Room number, positive monthly rent and 1-20 beds are required' });
  }

  try {
    const room = await db.pGRoom.create({
      data: {
        propertyId: String(propertyId),
        roomNumber: roomNumber.trim(),
        block: block?.trim() || null,
        floor: Number.isInteger(Number(floor)) ? Number(floor) : null,
        roomType: roomType?.trim() || 'SHARED',
        monthlyRent: rent,
        depositAmount: Number(depositAmount) > 0 ? Number(depositAmount) : 0,
        maintenanceFee: Number(maintenanceFee) > 0 ? Number(maintenanceFee) : 0,
        utilitiesSurcharge: Number(utilitiesSurcharge) > 0 ? Number(utilitiesSurcharge) : 0,
        hasAc: Boolean(hasAc),
        foodIncluded: Boolean(foodIncluded),
        foodCharge: Number(foodCharge) > 0 ? Number(foodCharge) : 0,
        beds: { create: Array.from({ length: bedCount }, (_, index) => ({ label: Array.isArray(bedLabels) && bedLabels[index]?.trim() ? bedLabels[index].trim() : `Bed ${index + 1}` })) }
      },
      include: { beds: true }
    });
    logAudit(String(propertyId), currentUser(req)?.id, 'ROOM_CREATED', 'PGRoom', room.id, `${room.roomNumber} · ${bedCount} beds`);
    scheduleSearchIndex(String(propertyId));
    res.status(201).json(room);
  } catch (error) {
    logger.error({ err: error }, 'PG room creation error');
    res.status(500).json({ message: 'Failed to create room' });
  }
};

export const updateBedStatus = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(updateBedStatusBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const status = String(input.status || '').toUpperCase();
  if (!['AVAILABLE', 'MAINTENANCE'].includes(status)) {
    return res.status(400).json({ message: 'Beds can be marked available or under maintenance here' });
  }

  try {
    const bed = await db.pGBed.findUnique({ where: { id: String(req.params.bedId) }, include: { room: true } });
    if (!bed) return res.status(404).json({ message: 'Bed not found' });
    if (!await canManageProperty(req, bed.room.propertyId, ['OWNER'])) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    if (!['AVAILABLE', 'MAINTENANCE'].includes(bed.status)) {
      return res.status(409).json({ message: 'Reserved or occupied beds must be released through their booking or tenant record' });
    }
    const updated = await db.pGBed.update({ where: { id: bed.id }, data: { status, maintenanceNote: status === 'MAINTENANCE' ? input.note?.trim() || null : null } });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG bed status update error');
    res.status(500).json({ message: 'Failed to update bed status' });
  }
};

export const createBookingRequest = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(bookingRequestBody, req, res, 'Property, name, phone and move-in date are required');
  if (!body) return;
  const { propertyId, bedId, residentName, phone, email, moveInDate, notes, phoneToken } = body;
  const idemKey = String(body.idempotencyKey || req.headers['x-idempotency-key'] || '').trim().slice(0, 80) || null;
  if (isPlaceholderResidentName(residentName)) {
    return res.status(400).json({ message: 'Please enter the resident\u2019s real name as on their ID' });
  }
  if (requestPropertyId(req) && String(propertyId) !== requestPropertyId(req)) {
    return res.status(404).json({ message: 'Property is not available on this PG host' });
  }
  const moveIn = new Date(moveInDate);
  if (Number.isNaN(moveIn.getTime())) return res.status(400).json({ message: 'Move-in date is invalid' });

  try {
    const property = await db.pGProperty.findFirst({
      where: { id: String(propertyId), status: 'ACTIVE' },
      select: { id: true, bookingLockMinutes: true }
    });
    if (!property) return res.status(404).json({ message: 'Property is not available' });
    // Residents move rooms inside their own PG through the in-portal room
    // change, not through a new public booking.
    const bookingRequester = currentUser(req);
    if (bookingRequester?.role === 'PG_TENANT' && bookingRequester.propertyId === String(propertyId)) {
      return res.status(409).json({ message: OWN_PROPERTY_BOOKING_MESSAGE });
    }
    const ownStay = await db.pGTenant.findFirst({
      where: {
        propertyId: String(propertyId),
        phone: { in: phoneVariants(String(phone || '')).filter(Boolean) },
        status: { in: [...ACTIVE_RESIDENT_STATUSES] }
      },
      select: { id: true }
    });
    if (ownStay) {
      return res.status(409).json({ message: OWN_PROPERTY_BOOKING_MESSAGE });
    }

    if (idemKey) {
      const existing = await db.pGBooking.findUnique({ where: { idempotencyKey: idemKey } });
      if (existing) return res.status(200).json({ id: existing.id, bookingRef: existing.bookingRef, status: existing.status, deduped: true, message: 'Booking request already submitted' });
    }

    const digits = String(phone || '').replace(/\D/g, '');
    const normalizedPhone = digits.length === 10 ? `91${digits}` : digits;
    if (!await consumePhoneToken(normalizedPhone, phoneToken ? String(phoneToken) : undefined, 'BOOKING', requestPropertyId(req))) {
      return res.status(403).json({ message: 'Verify your phone number with the OTP code first' });
    }

    if (!bedId) return res.status(400).json({ message: 'Choose an available bed' });

    const booking = await db.$transaction(async (tx: any) => {
      const bed = await tx.pGBed.findFirst({
        where: { id: String(bedId), room: { propertyId: String(propertyId), status: 'ACTIVE' } },
        select: { id: true, status: true }
      });
      if (!bed || bed.status !== 'AVAILABLE') throw new Error('BED_UNAVAILABLE');

      const reserved = await tx.pGBed.updateMany({
        where: { id: bed.id, status: 'AVAILABLE' },
        data: { status: 'RESERVED' }
      });
      if (reserved.count !== 1) throw new Error('BED_UNAVAILABLE');

      return tx.pGBooking.create({
        data: {
          propertyId: String(propertyId),
          bookingRef: `PG-${randomUUID().toUpperCase()}`,
          bedId: bed.id,
          residentName: residentName.trim(),
          phone: phone.replace(/\D/g, ''),
          email: email?.trim() || null,
          moveInDate: moveIn,
          lockExpiresAt: new Date(Date.now() + (property.bookingLockMinutes || 120) * 60 * 1000),
          notes: notes?.trim() || null,
          idempotencyKey: idemKey
        }
      });
    });
    notifyWhatsAppSafely('BOOKING_RECEIVED', booking.phone, [booking.residentName, booking.bookingRef || booking.id]);
    res.status(201).json({ id: booking.id, bookingRef: booking.bookingRef, status: booking.status, message: 'Booking request sent for owner approval' });
  } catch (error) {
    if ((error as Error)?.message === 'BED_UNAVAILABLE') {
      return res.status(409).json({ message: 'This bed is no longer available' });
    }
    if ((error as any)?.code === 'P2002' && idemKey) {
      const existing = await db.pGBooking.findUnique({ where: { idempotencyKey: idemKey } });
      if (existing) return res.status(200).json({ id: existing.id, bookingRef: existing.bookingRef, status: existing.status, deduped: true, message: 'Booking request already submitted' });
    }
    logger.error({ err: error }, 'PG booking request error');
    res.status(500).json({ message: 'Failed to submit booking request' });
  }
};

export const cancelBookingRequest = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(cancelBookingBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const phone = String(input.phone || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ message: 'Phone number is required' });

  try {
    const booking = await db.pGBooking.findUnique({ where: { bookingRef: String(req.params.bookingRef) } });
    if (!booking) return res.status(404).json({ message: 'Booking request not found' });
    if (requestPropertyId(req) && booking.propertyId !== requestPropertyId(req)) return res.status(404).json({ message: 'Booking request not found' });
    if (booking.phone.replace(/\D/g, '') !== phone) return res.status(403).json({ message: 'Phone number does not match this booking' });
    if (booking.status !== 'PENDING') return res.status(409).json({ message: 'Only pending requests can be cancelled' });

    await db.$transaction(async (tx: any) => {
      await tx.pGBooking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
      if (booking.bedId) {
        await tx.pGBed.updateMany({ where: { id: booking.bedId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
      }
    });
    res.json({ message: 'Booking request cancelled' });
  } catch (error) {
    logger.error({ err: error }, 'PG booking cancellation error');
    res.status(500).json({ message: 'Failed to cancel booking request' });
  }
};

export const getPublicBookingStatus = async (req: Request, res: Response): Promise<any> => {
  const phone = String(req.query.phone || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ message: 'Phone number is required' });

  try {
    const booking = await db.pGBooking.findUnique({
      where: { bookingRef: String(req.params.bookingRef), ...(requestPropertyId(req) ? { propertyId: requestPropertyId(req) } : {}) },
      include: {
        property: { select: { name: true, address: true, locality: true, city: true } },
        bed: { include: { room: { select: { roomNumber: true } } } }
      }
    });
    if (!booking || booking.phone.replace(/\D/g, '') !== phone) {
      return res.status(404).json({ message: 'Booking not found for this phone number' });
    }
    res.json({
      id: booking.id,
      bookingRef: booking.bookingRef,
      status: booking.status,
      rejectionReason: booking.rejectionReason || null,
      residentName: booking.residentName,
      moveInDate: booking.moveInDate,
      property: booking.property,
      room: booking.bed?.room || null,
      bedLabel: booking.bed?.label || null
    });
  } catch (error) {
    logger.error({ err: error }, 'PG public booking status error');
    res.status(500).json({ message: 'Failed to fetch booking status' });
  }
};

export const listGuestBookings = async (req: Request, res: Response): Promise<any> => {
  const where = buildGuestBookingWhere(req.query.phone, requestPropertyId(req));
  if (!where) return res.status(400).json({ message: 'A valid phone number is required' });

  try {
    await releaseExpiredBookingHolds();
    const bookings = await db.pGBooking.findMany({
      where,
      include: {
        property: { select: { name: true, address: true, locality: true, city: true } },
        bed: { include: { room: { select: { roomNumber: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(bookings.map((booking: any) => ({
      id: booking.id,
      bookingRef: booking.bookingRef,
      status: booking.status,
      rejectionReason: booking.rejectionReason || null,
      residentName: booking.residentName,
      moveInDate: booking.moveInDate,
      property: booking.property,
      room: booking.bed?.room || null,
      bedLabel: booking.bed?.label || null
    })));
  } catch (error) {
    logger.error({ err: error }, 'PG guest booking list error');
    res.status(500).json({ message: 'Failed to fetch your booking requests' });
  }
};

export const listOwnerBookings = async (req: Request, res: Response): Promise<any> => {
  try {
    await releaseExpiredBookingHolds();
    const propertyIds = await accessiblePropertyIds(req);
    const bookings = await db.pGBooking.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: { select: { name: true, locality: true } }, bed: { include: { room: true } }, tenant: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(bookings);
  } catch (error) {
    logger.error({ err: error }, 'PG booking list error');
    res.status(500).json({ message: 'Failed to fetch booking requests' });
  }
};

export const updateBookingStatus = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(updateBookingStatusBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const status = String(input.status || '').toUpperCase();
  if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    return res.status(400).json({ message: 'Status must be APPROVED, REJECTED or CANCELLED' });
  }
  const rejectionReason = String(input.rejectionReason || '').trim();
  if (status === 'REJECTED' && !rejectionReason) {
    return res.status(400).json({ message: 'A reason is required when declining a booking' });
  }

  try {
    const booking = await db.pGBooking.findUnique({
      where: { id: String(req.params.bookingId) },
      include: { bed: { include: { room: true } } }
    });
    if (!booking) return res.status(404).json({ message: 'Booking request not found' });
    if (!await canManageProperty(req, booking.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    if (booking.status !== 'PENDING') return res.status(409).json({ message: 'Only pending requests can be updated' });

    const newBedId = input.newBedId ? String(input.newBedId) : null;
    const updated = await db.$transaction(async (tx: any) => {
      let assignedBedId = booking.bedId;
      if (status === 'APPROVED') {
        if (newBedId && newBedId !== booking.bedId) {
          const replacement = await tx.pGBed.findFirst({
            where: { id: newBedId, status: 'AVAILABLE', room: { propertyId: booking.propertyId, status: 'ACTIVE' } },
            include: { room: true }
          });
          if (!replacement) throw new Error('BED_UNAVAILABLE');
          if (booking.bedId) {
            await tx.pGBed.updateMany({ where: { id: booking.bedId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
          }
          const locked = await tx.pGBed.updateMany({ where: { id: replacement.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
          if (locked.count !== 1) throw new Error('BED_UNAVAILABLE');
          await tx.pGBooking.update({ where: { id: booking.id }, data: { bedId: replacement.id } });
          assignedBedId = replacement.id;
          booking.bed = { ...replacement, status: 'RESERVED' };
        }
        if (!assignedBedId || !booking.bed || booking.bed.status !== 'RESERVED') {
          throw new Error('BED_UNAVAILABLE');
        }
        const activeTenant = await tx.pGTenant.findFirst({
          where: { bedId: assignedBedId, status: { in: ['ACTIVE', 'RESERVED', 'NOTICE_PERIOD'] } },
          select: { id: true }
        });
        if (activeTenant) throw new Error('BED_UNAVAILABLE');

        await tx.pGTenant.create({
          data: {
            propertyId: booking.propertyId,
            bedId: assignedBedId as string,
            bookingId: booking.id,
            name: booking.residentName,
            phone: booking.phone,
            email: booking.email,
            moveInDate: booking.moveInDate,
            monthlyRent: booking.bed.room.monthlyRent,
            depositAmount: booking.bed.room.depositAmount,
            status: 'RESERVED'
          }
        });
      } else if (booking.bedId) {
        await tx.pGBed.updateMany({
          where: { id: booking.bedId, status: 'RESERVED' },
          data: { status: 'AVAILABLE' }
        });
      }

      return tx.pGBooking.update({ where: { id: booking.id }, data: { status, rejectionReason: status === 'REJECTED' ? rejectionReason : null } });
    });
    const actor = currentUser(req);
    if (status === 'APPROVED') notifyWhatsAppSafely('BOOKING_APPROVED', booking.phone, [booking.residentName, booking.bookingRef || booking.id]);
    if (status === 'REJECTED') notifyWhatsAppSafely('BOOKING_REJECTED', booking.phone, [booking.residentName, rejectionReason]);
    logAudit(booking.propertyId, actor?.id, status === 'APPROVED' ? 'BOOKING_APPROVED' : `BOOKING_${status}`, 'PGBooking', booking.id, status === 'REJECTED' ? rejectionReason : booking.residentName);
    res.json(updated);
  } catch (error: any) {
    if (error?.message === 'BED_UNAVAILABLE') {
      return res.status(409).json({ message: 'This bed is no longer available' });
    }
    logger.error({ err: error }, 'PG booking status update error');
    res.status(500).json({ message: 'Failed to update booking request' });
  }
};

export const checkInTenant = async (req: Request, res: Response): Promise<any> => {
  try {
    const tenant = await db.pGTenant.findUnique({
      where: { id: String(req.params.tenantId) },
      include: { bed: { include: { room: true } }, property: { select: { rentDueDay: true } } }
    });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    if (tenant.status !== 'RESERVED') return res.status(409).json({ message: 'Only approved tenants can be checked in' });

    const now = new Date();
  const rent = calculateMonthlyRent(tenant, now);
    const checkedIn = await db.$transaction(async (tx: any) => {
      if (tenant.bedId) {
        const occupied = await tx.pGBed.updateMany({
          where: { id: tenant.bedId, status: 'RESERVED' },
          data: { status: 'OCCUPIED' }
        });
        if (occupied.count !== 1) throw new Error('BED_UNAVAILABLE');
      }

      const transitioned = await tx.pGTenant.updateMany({
        where: { id: tenant.id, status: 'RESERVED' },
        data: { status: 'ACTIVE', checkedInAt: now }
      });
      if (transitioned.count !== 1) throw new Error('TENANT_STATE_CHANGED');
      const activeTenant = await tx.pGTenant.findUniqueOrThrow({ where: { id: tenant.id } });
      const tenantDigits = String(tenant.phone || '').replace(/\D/g, '');
      const tenantNormalized = tenantDigits.length === 10 ? `91${tenantDigits}` : tenantDigits;
      const existingLogin = await tx.user.findFirst({ where: { phone: { in: [tenantDigits, tenantNormalized] } }, select: { id: true } });
      if (!existingLogin) {
        const hashedPassword = await bcrypt.hash(randomUUID(), 10);
        await tx.user.create({ data: { name: tenant.name, phone: tenantNormalized, password: hashedPassword, role: 'PG_TENANT' } });
      }
      if (tenant.bookingId) {
        await tx.pGBooking.update({ where: { id: tenant.bookingId }, data: { status: 'CHECKED_IN' } });
      }

      await tx.pGRentEntry.upsert({
        where: { tenantId_period_entryType: { tenantId: tenant.id, period: rent.period, entryType: 'RENT' } },
        update: {},
        create: {
          tenantId: tenant.id,
          period: rent.period,
          amount: rent.amount,
          dueDate: rent.dueDate,
          entryType: 'RENT',
          invoiceCode: `RENT-${rent.period}-${tenant.id.slice(0, 8).toUpperCase()}`
        }
      });
      await ensureFoodEntries(tx, tenant, rent.period, rent.dueDate);
      if (tenant.depositAmount > 0) {
        await tx.pGRentEntry.upsert({
          where: { tenantId_period_entryType: { tenantId: tenant.id, period: 'DEPOSIT', entryType: 'DEPOSIT' } },
          update: {},
          create: {
            tenantId: tenant.id,
            period: 'DEPOSIT',
            entryType: 'DEPOSIT',
            amount: tenant.depositAmount,
            dueDate: now,
            invoiceCode: `DEP-${tenant.id.slice(0, 8)}`
          }
        });
      }
      return activeTenant;
    });
    logAudit(tenant.propertyId, currentUser(req)?.id, 'TENANT_CHECKED_IN', 'PGTenant', tenant.id, tenant.name);
    res.json(checkedIn);
  } catch (error: any) {
    if (error?.message === 'BED_UNAVAILABLE') return res.status(409).json({ message: 'This bed is no longer reserved for the tenant' });
    if (error?.message === 'TENANT_STATE_CHANGED') return res.status(409).json({ message: 'Tenant status changed; refresh and try again' });
    logger.error({ err: error }, 'PG tenant check-in error');
    res.status(500).json({ message: 'Failed to check in tenant' });
  }
};

export const checkOutTenant = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(checkOutTenantBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const depositDeductions = input?.depositDeductions === undefined ? 0 : Number(input.depositDeductions);
  if (!Number.isFinite(depositDeductions) || depositDeductions < 0) {
    return res.status(400).json({ message: 'Deposit deductions must be a non-negative amount' });
  }
  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    if (tenant.status !== 'ACTIVE') return res.status(409).json({ message: 'Only active tenants can be checked out' });
    if (depositDeductions > tenant.depositReceived) {
      return res.status(400).json({ message: 'Deductions cannot exceed the deposit received' });
    }
    const depositRefundAmount = Math.max(0, tenant.depositReceived - depositDeductions);
    const depositRefundStatus = tenant.depositReceived <= 0 ? 'NOT_APPLICABLE' : depositRefundAmount > 0 ? 'PENDING' : 'SETTLED';

    const now = new Date();
    const checkedOut = await db.$transaction(async (tx: any) => {
      if (tenant.bedId) {
        const released = await tx.pGBed.updateMany({
          where: { id: tenant.bedId, status: 'OCCUPIED' },
          data: { status: 'AVAILABLE' }
        });
        if (released.count !== 1) throw new Error('BED_STATE_INVALID');
      }
      const updatedTenant = await tx.pGTenant.update({
        where: { id: tenant.id },
        data: { status: 'CHECKED_OUT', moveOutDate: now, checkedOutAt: now, depositDeductions, depositRefundAmount, depositRefundStatus, checkoutNote: String(input?.checkoutNote || '').trim() || null }
      });
      if (tenant.bookingId) {
        await tx.pGBooking.update({ where: { id: tenant.bookingId }, data: { status: 'CHECKED_OUT', moveOutDate: now } });
      }
      return updatedTenant;
    });
    logAudit(tenant.propertyId, currentUser(req)?.id, 'TENANT_CHECKED_OUT', 'PGTenant', tenant.id, `${tenant.name} · deductions ${depositDeductions}`);
    res.json(checkedOut);
  } catch (error: any) {
    if (error?.message === 'BED_STATE_INVALID') return res.status(409).json({ message: 'Bed status changed; refresh and try again' });
    logger.error({ err: error }, 'PG tenant check-out error');
    res.status(500).json({ message: 'Failed to check out tenant' });
  }
};

export const listTenantStays = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  const scopedPropertyId = requestPropertyId(req);
  if (user.propertyId && scopedPropertyId && user.propertyId !== scopedPropertyId) {
    return res.status(403).json({ message: 'This resident session belongs to a different PG' });
  }
  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const phones = phoneVariants(String(account?.phone || ''));
    const tenants = await db.pGTenant.findMany({
      where: {
        phone: { in: phones },
        ...((scopedPropertyId || user.propertyId) ? { propertyId: scopedPropertyId || user.propertyId } : {})
      },
      include: {
        property: { select: { id: true, name: true, address: true, locality: true, city: true, contactPhone: true, upiId: true } },
        bed: { include: { room: { select: { roomNumber: true, roomType: true, foodIncluded: true, foodCharge: true } } } },
        rentEntries: { orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tenants);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant stay list error');
    res.status(500).json({ message: 'Failed to fetch your stays' });
  }
};

export const submitTenantNotice = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
    const scopedPropertyId = requestPropertyId(req) || user.propertyId;
    if (!tenant || (scopedPropertyId && tenant.propertyId !== scopedPropertyId) || !phoneVariants(String(account?.phone || '')).some((variant) => [tenant.phone, String(tenant.phone || '').replace(/\D/g, '')].includes(variant))) {
      return res.status(404).json({ message: 'Stay not found' });
    }
    if (tenant.status !== 'ACTIVE') return res.status(409).json({ message: 'Only active stays can start a notice period' });
    const updated = await db.pGTenant.update({ where: { id: tenant.id }, data: { status: 'NOTICE_PERIOD', noticeDate: new Date() } });
    logAudit(tenant.propertyId, user.id, 'NOTICE_SUBMITTED', 'PGTenant', tenant.id, tenant.name);
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant notice error');
    res.status(500).json({ message: 'Failed to submit notice' });
  }
};

export const cancelTenantNotice = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
    const scopedPropertyId = requestPropertyId(req) || user.propertyId;
    if (!tenant || (scopedPropertyId && tenant.propertyId !== scopedPropertyId) || !phoneVariants(String(account?.phone || '')).some((variant) => [tenant.phone, String(tenant.phone || '').replace(/\D/g, '')].includes(variant))) {
      return res.status(404).json({ message: 'Stay not found' });
    }
    if (tenant.status !== 'NOTICE_PERIOD') return res.status(409).json({ message: 'No active notice on this stay' });
    const updated = await db.pGTenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE', noticeDate: null } });
    logAudit(tenant.propertyId, user.id, 'NOTICE_CANCELLED', 'PGTenant', tenant.id, tenant.name);
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant notice cancel error');
    res.status(500).json({ message: 'Failed to cancel notice' });
  }
};

export const listAuditLogs = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req);
    const logs = await db.pHAuditLog.findMany({
      where: { propertyId: { in: propertyIds } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    const actorIds = [...new Set(logs.map((log: any) => log.actorId).filter(Boolean))];
    const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(actors.map((actor: { id: string; name: string }) => [actor.id, actor.name]));
    res.json(logs.map((log: any) => ({ ...log, actorName: log.actorId ? names.get(log.actorId) || 'Guest' : 'System' })));
  } catch (error) {
    logger.error({ err: error }, 'PG audit list error');
    res.status(500).json({ message: 'Failed to fetch activity' });
  }
};

export const markDepositRefunded = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(markDepositRefundedBody, req, res, INVALID_REQUEST);
  if (!input) return;
  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId, ['OWNER'])) {
      return res.status(403).json({ message: 'Only property owners can mark a deposit refund' });
    }
    if (tenant.status !== 'CHECKED_OUT' || tenant.depositRefundStatus !== 'PENDING') {
      return res.status(409).json({ message: 'No pending deposit refund for this tenant' });
    }
    const updated = await db.pGTenant.update({
      where: { id: tenant.id },
      data: {
        depositRefundStatus: 'REFUNDED',
        depositRefundReference: String(input?.reference || '').trim() || null,
        depositRefundedAt: new Date()
      }
    });
    logAudit(tenant.propertyId, currentUser(req)?.id, 'DEPOSIT_REFUNDED', 'PGTenant', tenant.id, String(input?.reference || '').trim() || null);
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG deposit refund error');
    res.status(500).json({ message: 'Failed to record deposit refund' });
  }
};

export const listOwnerTenants = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req);
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const tenants = await db.pGTenant.findMany({
      where: {
        propertyId: { in: propertyIds },
        ...(status ? { status } : {})
      },
      include: {
        property: { select: { name: true, locality: true } },
        bed: { include: { room: { select: { roomNumber: true } } } }
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }]
    });
    res.json(tenants);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant list error');
    res.status(500).json({ message: 'Failed to fetch tenants' });
  }
};

export const updateTenantProfile = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(updateTenantProfileBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const inputFields = input as Record<string, any>;
  const allowedFields = [
    'permanentAddress',
    'bloodGroup',
    'institutionOrEmployer',
    'emergencyName',
    'emergencyPhone',
    'kycType',
    'kycDocumentUrl'
  ];
  const verifyKyc = input.kycVerified;

  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const data: Record<string, string | null | boolean | Date> = {};
    for (const field of allowedFields) {
      if (inputFields[field] !== undefined) data[field] = String(inputFields[field]).trim() || null;
    }
    if (verifyKyc !== undefined) {
      data.kycVerified = Boolean(verifyKyc);
      data.kycVerifiedAt = verifyKyc ? new Date() : null;
    }
    if (input.foodOptOut !== undefined) {
      data.foodOptOut = Boolean(input.foodOptOut);
    }
    const updated = await db.pGTenant.update({ where: { id: tenant.id }, data });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant profile update error');
    res.status(500).json({ message: 'Failed to update tenant profile' });
  }
};

export const listPropertyStaff = async (req: Request, res: Response): Promise<any> => {
  try {
    const ownerPropertyIds = await accessiblePropertyIds(req, ['OWNER']);
    const propertyId = req.query.propertyId ? String(req.query.propertyId) : undefined;
    if (propertyId && !ownerPropertyIds.includes(propertyId)) {
      return res.status(403).json({ message: 'Only property owners can manage staff' });
    }
    const staff = await db.pGPropertyAccess.findMany({
      where: {
        propertyId: { in: propertyId ? [propertyId] : ownerPropertyIds },
        role: 'WARDEN'
      },
      include: {
        property: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, phone: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(staff.map((access: any) => ({
      ...access.user,
      role: access.role,
      property: access.property
    })));
  } catch (error) {
    logger.error({ err: error }, 'PG staff list error');
    res.status(500).json({ message: 'Failed to fetch property staff' });
  }
};

export const createPropertyStaff = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(createPropertyStaffBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const owner = currentUser(req);
  const { propertyId, name, email, phone, password } = input;
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!owner || !propertyId || !name?.trim() || normalizedPhone.length < 10 || !password) {
    return res.status(400).json({ message: 'Property, staff name, valid phone and password are required' });
  }
  if (!await canManageProperty(req, String(propertyId), ['OWNER'])) {
    return res.status(403).json({ message: 'Only property owners can add staff' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const staff = await db.$transaction(async (tx: any) => {
      const newUser = await tx.user.create({
        data: {
          name: name.trim(),
          email: email?.trim() || null,
          phone: normalizedPhone,
          password: hashedPassword,
          role: 'PG_WARDEN'
        },
        select: { id: true, name: true, phone: true, email: true }
      });
      await tx.pGPropertyAccess.create({ data: { propertyId: String(propertyId), userId: newUser.id, role: 'WARDEN' } });
      return newUser;
    });
    res.status(201).json({ ...staff, propertyId: String(propertyId), role: 'WARDEN' });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ message: 'A user with this phone or email already exists' });
    logger.error({ err: error }, 'PG staff creation error');
    res.status(500).json({ message: 'Failed to create property staff account' });
  }
};

export const removePropertyStaff = async (req: Request, res: Response): Promise<any> => {
  const { propertyId, userId } = req.params;
  if (!await canManageProperty(req, String(propertyId), ['OWNER'])) {
    return res.status(403).json({ message: 'Only property owners can remove staff' });
  }

  try {
    const access = await db.pGPropertyAccess.findFirst({
      where: { propertyId: String(propertyId), userId: String(userId), role: 'WARDEN' },
      select: { id: true }
    });
    if (!access) return res.status(404).json({ message: 'Staff access not found' });
    await db.pGPropertyAccess.delete({ where: { id: access.id } });
    const otherAccess = await db.pGPropertyAccess.count({ where: { userId: String(userId) } });
    if (!otherAccess) await db.user.delete({ where: { id: String(userId) } });
    res.json({ message: 'Staff access removed' });
  } catch (error) {
    logger.error({ err: error }, 'PG staff removal error');
    res.status(500).json({ message: 'Failed to remove staff access' });
  }
};

export const listOwnerRentEntries = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, ['OWNER']);
    const period = req.query.period ? String(req.query.period) : undefined;
    const entries = await db.pGRentEntry.findMany({
      where: {
        tenant: { propertyId: { in: propertyIds } },
        ...(period ? { period } : {})
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            phone: true,
            property: { select: { id: true, name: true } },
            bed: { include: { room: { select: { roomNumber: true } } } }
          }
        }
      },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }]
    });
    res.json(entries);
  } catch (error) {
    logger.error({ err: error }, 'PG rent ledger list error');
    res.status(500).json({ message: 'Failed to fetch rent ledger' });
  }
};

export const createRentEntry = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(rentEntryBody, req, res, 'Tenant, period, positive amount and due date are required');
  if (!body) return;
  const { tenantId, period, amount: value, dueDate, entryType, notes } = body;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return res.status(400).json({ message: 'Tenant, period, positive amount and due date are required' });
  }

  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(tenantId) } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId, ['OWNER'])) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const type = ['RENT', 'DEPOSIT', 'UTILITY'].includes(String(entryType || '').toUpperCase())
      ? String(entryType).toUpperCase()
      : 'RENT';
    const entry = await db.pGRentEntry.create({
      data: {
        tenantId: tenant.id,
        period: String(period).trim(),
        entryType: type,
        amount: value,
        dueDate: due,
        invoiceCode: `PG-${Date.now()}`,
        notes: notes || null
      }
    });
    res.status(201).json(entry);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ message: 'A ledger entry already exists for this tenant and period' });
    logger.error({ err: error }, 'PG rent ledger create error');
    res.status(500).json({ message: 'Failed to create ledger entry' });
  }
};

export const sendRentReminders = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(sendRentRemindersBody, req, res, INVALID_REQUEST);
  if (!input) return;
  try {
    const propertyIds = await accessiblePropertyIds(req, ['OWNER', 'WARDEN']);
    const summary = await sendDueRentReminders(db, {
      propertyIds,
      period: input?.period ? String(input.period) : undefined,
      force: input?.force === true || input?.force === 'true',
      actorId: (req as any).user?.userId ? String((req as any).user.userId) : null
    });
    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'PG rent reminders error');
    res.status(500).json({ message: 'Failed to send rent reminders' });
  }
};

export const listOwnerExpenses = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, ['OWNER', 'WARDEN']);
    const period = req.query.period ? String(req.query.period) : undefined;
    res.json(await listExpenses(db, propertyIds, period));
  } catch (error) {
    logger.error({ err: error }, 'PG expense list error');
    res.status(500).json({ message: 'Failed to load expenses' });
  }
};

export const createOwnerExpense = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(createOwnerExpenseBody, req, res, INVALID_REQUEST);
  if (!input) return;
  try {
    const propertyId = String(input?.propertyId || '');
    if (!propertyId || !await canManageProperty(req, propertyId, ['OWNER', 'WARDEN'])) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const expense = await createExpense(db, (req as any).user?.userId ? String((req as any).user.userId) : null, {
      propertyId,
      category: input?.category,
      amount: input?.amount,
      spentOn: input?.spentOn,
      note: input?.note
    });
    res.status(201).json(expense);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (['INVALID_PROPERTY', 'INVALID_AMOUNT', 'INVALID_CATEGORY', 'INVALID_DATE'].includes(code)) {
      return res.status(400).json({ message: 'Expense needs a valid amount, category and date' });
    }
    if (code === 'PROPERTY_NOT_FOUND') return res.status(404).json({ message: 'Property is not available' });
    logger.error({ err: error }, 'PG expense create error');
    res.status(500).json({ message: 'Failed to record expense' });
  }
};

export const deleteOwnerExpense = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, ['OWNER']);
    await deleteExpense(db, (req as any).user?.userId ? String((req as any).user.userId) : null, String(req.params.expenseId), propertyIds);
    res.json({ message: 'Expense removed' });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'EXPENSE_NOT_FOUND') return res.status(404).json({ message: 'Expense not found' });
    if (code === 'FORBIDDEN') return res.status(403).json({ message: 'You do not have access to this expense' });
    logger.error({ err: error }, 'PG expense delete error');
    res.status(500).json({ message: 'Failed to remove expense' });
  }
};

export const listElectricityBills = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, ['OWNER', 'WARDEN']);
    const period = req.query.period ? String(req.query.period) : undefined;
    const { listElectricityBills: listBills } = await import('../services/pg-billing.js');
    res.json(await listBills(db, propertyIds, period));
  } catch (error) {
    logger.error({ err: error }, 'PG electricity bill list error');
    res.status(500).json({ message: 'Failed to load electricity bills' });
  }
};

export const proposeElectricityBill = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(proposeElectricityBillBody, req, res, INVALID_REQUEST);
  if (!input) return;
  try {
    const propertyId = String(input?.propertyId || '');
    if (!propertyId || !await canManageProperty(req, propertyId, ['OWNER', 'WARDEN'])) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const { proposeElectricityBill: propose } = await import('../services/pg-billing.js');
    const bill = await propose(db, (req as any).user?.userId ? String((req as any).user.userId) : null, {
      propertyId, period: input?.period, totalAmount: input?.totalAmount, imageUrl: input?.imageUrl
    });
    res.status(201).json(bill);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (['INVALID_PROPERTY', 'INVALID_PERIOD', 'INVALID_AMOUNT'].includes(code)) {
      return res.status(400).json({ message: 'Bill needs a property, a YYYY-MM period and a positive total' });
    }
    if (code === 'PROPERTY_NOT_FOUND') return res.status(404).json({ message: 'Property is not available' });
    if (code === 'ALREADY_BILLED') return res.status(409).json({ message: 'This period is already billed' });
    if (code === 'NO_OCCUPANTS') return res.status(409).json({ message: 'No active tenants to split across' });
    logger.error({ err: error }, 'PG electricity bill propose error');
    res.status(500).json({ message: 'Failed to propose electricity bill' });
  }
};

export const approveElectricityBill = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, ['OWNER', 'WARDEN']);
    const { approveElectricityBill: approve } = await import('../services/pg-billing.js');
    const result = await approve(db, (req as any).user?.userId ? String((req as any).user.userId) : null, String(req.params.billId), propertyIds);
    res.json(result);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'BILL_NOT_FOUND') return res.status(404).json({ message: 'Bill not found' });
    if (code === 'FORBIDDEN') return res.status(403).json({ message: 'You do not have access to this bill' });
    logger.error({ err: error }, 'PG electricity bill approve error');
    res.status(500).json({ message: 'Failed to approve electricity bill' });
  }
};

export const recordRentPayment = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(rentPaymentBody, req, res, 'A positive payment amount and valid payment method are required');
  if (!body) return;
  const { amount, method } = body;

  try {
    const entry = await db.pGRentEntry.findUnique({
      where: { id: String(req.params.entryId) },
      include: { tenant: true }
    });
    if (!entry) return res.status(404).json({ message: 'Ledger entry not found' });
    if (!await canManageProperty(req, entry.tenant.propertyId, ['OWNER'])) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const updated = await db.$transaction(async (tx: any) => {
      // Lock the ledger row so concurrent payments apply one after another
      // instead of the later one failing its compare-and-swap below.
      await tx.$queryRaw`SELECT 1 FROM "PGRentEntry" WHERE "id" = ${entry.id} FOR UPDATE`;
      const current = await tx.pGRentEntry.findUnique({ where: { id: entry.id } });
      if (!current) throw new Error('LEDGER_ENTRY_NOT_FOUND');

      const paidAmount = Math.min(current.amount, current.paidAmount + amount);
      const status = paidAmount >= current.amount ? 'PAID' : 'PARTIAL';
      const changed = await tx.pGRentEntry.updateMany({
        where: { id: current.id, paidAmount: current.paidAmount, status: current.status },
        data: {
          paidAmount,
          status,
          method,
          reference: body.reference || current.reference,
          paidAt: status === 'PAID' ? new Date() : current.paidAt
        }
      });
      if (changed.count !== 1) throw new Error('PAYMENT_CONFLICT');
      if (entry.entryType === 'DEPOSIT') {
        await tx.pGTenant.update({
          where: { id: entry.tenantId },
          data: { depositReceived: { increment: paidAmount - current.paidAmount } }
        });
      }
      return tx.pGRentEntry.findUniqueOrThrow({ where: { id: current.id } });
    });
    logAudit(entry.tenant.propertyId, currentUser(req)?.id, 'RENT_PAYMENT_RECORDED', 'PGRentEntry', entry.id, `${updated.paidAmount}/${entry.amount} via ${method}`);
    res.json(updated);
  } catch (error) {
    if ((error as Error)?.message === 'PAYMENT_CONFLICT') {
      return res.status(409).json({ message: 'Payment changed concurrently; refresh the ledger and retry' });
    }
    logger.error({ err: error }, 'PG rent payment record error');
    res.status(500).json({ message: 'Failed to record payment' });
  }
};

export const getOwnerReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, ['OWNER']);
    const propertyId = req.query.propertyId ? String(req.query.propertyId) : undefined;
    if (propertyId && !propertyIds.includes(propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const scope = propertyId ? [propertyId] : propertyIds;
    const period = String(req.query.period || periodOf());
    const [year, month] = period.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) return res.status(400).json({ message: 'Period must be YYYY-MM' });
    const { gte: periodStart, lt: periodEnd } = periodRange(period);
    const [properties, tenants, entries, bookings] = await Promise.all([
      db.pGProperty.findMany({ where: { id: { in: scope } }, include: { rooms: { include: { beds: true } } } }),
      db.pGTenant.findMany({ where: { propertyId: { in: scope } }, select: { id: true, status: true, propertyId: true } }),
      db.pGRentEntry.findMany({
        where: { tenant: { propertyId: { in: scope } }, period },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              property: { select: { id: true, name: true } },
              bed: { include: { room: { select: { roomNumber: true } } } }
            }
          }
        }
      }),
      db.pGBooking.count({ where: { propertyId: { in: scope }, createdAt: { gte: periodStart, lt: periodEnd } } })
    ]);
    const totalBeds = properties.reduce((total: number, property: any) => total + property.rooms.reduce((roomTotal: number, room: any) => roomTotal + room.beds.length, 0), 0);
    const occupiedBeds = tenants.filter((tenant: any) => tenant.status === 'ACTIVE').length;
    const charged = entries.reduce((total: number, entry: any) => total + entry.amount, 0);
    const collected = entries.reduce((total: number, entry: any) => total + entry.paidAmount, 0);

    res.json({
      period,
      properties: properties.length,
      totalBeds,
      occupiedBeds,
      availableBeds: properties.reduce((total: number, property: any) => total + property.rooms.reduce((roomTotal: number, room: any) => roomTotal + room.beds.filter((bed: any) => bed.status === 'AVAILABLE').length, 0), 0),
      occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      activeTenants: occupiedBeds,
      newBookings: bookings,
      rentCharged: charged,
      rentCollected: collected,
      outstanding: Math.max(0, charged - collected),
      entries
    });
  } catch (error) {
    logger.error({ err: error }, 'PG owner report error');
    res.status(500).json({ message: 'Failed to generate report' });
  }
};

export const getOwnerSummary = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    const propertyIds = await accessiblePropertyIds(req);
    const ownerPropertyIds = await accessiblePropertyIds(req, ['OWNER']);
    const canManageStaff = user.role === 'SUPER_ADMIN' || user.role === 'PG_OWNER' || ownerPropertyIds.length > 0;
    const propertyId = req.query.propertyId ? String(req.query.propertyId) : undefined;
    if (propertyId && !propertyIds.includes(propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const scope = propertyId ? [propertyId] : propertyIds;
    const [properties, activeTenants, pendingBookings, openTickets, rentEntries] = await Promise.all([
      db.pGProperty.findMany({ where: { id: { in: scope } }, include: { rooms: { include: { beds: true } } } }),
      db.pGTenant.count({ where: { propertyId: { in: scope }, status: 'ACTIVE' } }),
      db.pGBooking.count({ where: { propertyId: { in: scope }, status: 'PENDING' } }),
      db.pGMaintenanceTicket.count({ where: { propertyId: { in: scope }, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      canManageStaff
        ? db.pGRentEntry.findMany({ where: { tenant: { propertyId: { in: scope } }, status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] } }, select: { amount: true, paidAmount: true } })
        : Promise.resolve([])
    ]);
    const totalBeds = properties.reduce((total: number, property: any) => total + property.rooms.reduce((roomTotal: number, room: any) => roomTotal + room.beds.length, 0), 0);
    const rentOutstanding = rentEntries.reduce((total: number, entry: any) => total + Math.max(0, entry.amount - entry.paidAmount), 0);

    res.json({
      properties: properties.length,
      totalBeds,
      occupiedBeds: activeTenants,
      occupancyRate: totalBeds ? Math.round((activeTenants / totalBeds) * 100) : 0,
      pendingBookings,
      openTickets,
      rentOutstanding,
      canManageStaff
    });
  } catch (error) {
    logger.error({ err: error }, 'PG owner summary error');
    res.status(500).json({ message: 'Failed to fetch owner summary' });
  }
};

export const listOwnerTickets = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req);
    const tickets = await db.pGMaintenanceTicket.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: { select: { name: true } }, tenant: { select: { name: true, phone: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
    });
    const assignedIds = [...new Set(tickets.map((ticket: any) => ticket.assignedTo).filter(Boolean))];
    const assignedUsers = assignedIds.length ? await db.user.findMany({ where: { id: { in: assignedIds } }, select: { id: true, name: true } }) : [];
    const assignedNames = new Map(assignedUsers.map((assigned: { id: string; name: string }) => [assigned.id, assigned.name]));
    res.json(tickets.map((ticket: any) => ({ ...ticket, assignedName: ticket.assignedTo ? assignedNames.get(ticket.assignedTo) || null : null })));
  } catch (error) {
    logger.error({ err: error }, 'PG maintenance list error');
    res.status(500).json({ message: 'Failed to fetch maintenance tickets' });
  }
};

export const listTenantTickets = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  const propertyId = requestPropertyId(req) || user?.propertyId;
  if (!user || user.role !== 'PG_TENANT') return res.status(403).json({ message: 'Resident access is required' });
  if (!propertyId || (user.propertyId && user.propertyId !== propertyId)) {
    return res.status(403).json({ message: 'This resident session belongs to a different PG' });
  }

  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const phones = phoneVariants(String(account?.phone || ''));
    const tenants = await db.pGTenant.findMany({
      where: { propertyId, phone: { in: phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
      select: { id: true }
    });
    const tickets = await db.pGMaintenanceTicket.findMany({
      where: { propertyId, tenantId: { in: tenants.map((tenant: { id: string }) => tenant.id) } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tickets);
  } catch (error) {
    logger.error({ err: error }, 'PG resident maintenance list error');
    res.status(500).json({ message: 'Failed to fetch maintenance requests' });
  }
};

export const createTenantTicket = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(createTenantTicketBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const user = currentUser(req);
  const propertyId = requestPropertyId(req) || user?.propertyId;
  const { tenantId, title, description, category } = input;
  if (!user || user.role !== 'PG_TENANT') return res.status(403).json({ message: 'Resident access is required' });
  if (!propertyId || (user.propertyId && user.propertyId !== propertyId)) {
    return res.status(403).json({ message: 'This resident session belongs to a different PG' });
  }
  if (!tenantId || !title?.trim() || !description?.trim()) {
    return res.status(400).json({ message: 'Stay, title and description are required' });
  }
  if (title.trim().length > LIMITS.ticketTitle || description.trim().length > LIMITS.ticketDetails) {
    return res.status(400).json({ message: `Title must be ${LIMITS.ticketTitle} characters or less and description ${LIMITS.ticketDetails.toLocaleString('en-IN')} characters or less` });
  }
  const allowedCategories = ['PLUMBING', 'ELECTRICAL', 'APPLIANCE', 'CLEANING', 'SAFETY', 'PEST', 'OTHER'];
  const ticketCategory = String(category || 'OTHER').toUpperCase();
  if (!allowedCategories.includes(ticketCategory)) return res.status(400).json({ message: 'Invalid maintenance category' });

  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const phones = phoneVariants(String(account?.phone || ''));
    const tenant = await db.pGTenant.findFirst({
      where: {
        id: String(tenantId),
        propertyId,
        phone: { in: phones },
        status: { in: ['ACTIVE', 'NOTICE_PERIOD'] }
      },
      select: { id: true, bedId: true }
    });
    if (!tenant) return res.status(404).json({ message: 'Active stay not found for this resident on this PG' });

    const ticket = await db.pGMaintenanceTicket.create({
      data: {
        propertyId,
        tenantId: tenant.id,
        bedId: tenant.bedId,
        title: title.trim(),
        description: description.trim(),
        category: ticketCategory,
        priority: 'NORMAL'
      }
    });
    res.status(201).json(ticket);
  } catch (error) {
    logger.error({ err: error }, 'PG resident maintenance creation error');
    res.status(500).json({ message: 'Failed to create maintenance request' });
  }
};

export const updateResidentProfile = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(updateResidentProfileBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const inputFields = input as Record<string, any>;
  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const tenant = await db.pGTenant.findFirst({
      where: {
        id: { equals: String(req.params.tenantId), in: scope.tenantIds },
        propertyId: scope.propertyId,
        status: { in: ['ACTIVE', 'NOTICE_PERIOD'] }
      }
    });
    if (!tenant) return res.status(404).json({ message: 'Active stay not found' });

    const allowedFields = ['permanentAddress', 'institutionOrEmployer', 'emergencyName', 'emergencyPhone'];
    const data: Record<string, string | null | boolean | Date> = {};
    for (const field of allowedFields) {
      if (inputFields[field] === undefined) continue;
      const value = String(inputFields[field]).trim();
      if (value.length > LIMITS.profileText) return res.status(400).json({ message: `${field} must be ${LIMITS.profileText} characters or less` });
      data[field] = value || null;
    }
    if (input.bloodGroup !== undefined) {
      const bloodGroup = String(input.bloodGroup).toUpperCase();
      if (bloodGroup && !isBloodGroup(bloodGroup)) {
        return res.status(400).json({ message: MESSAGES.bloodGroup });
      }
      data.bloodGroup = bloodGroup || null;
    }
    if (input.kycType !== undefined) {
      const kycType = String(input.kycType).toUpperCase();
      if (kycType && !isKycType(kycType)) {
        return res.status(400).json({ message: MESSAGES.kycType });
      }
      data.kycType = kycType || null;
    }
    if (input.kycDocumentUrl !== undefined) {
      const fileKey = String(input.kycDocumentUrl || '').trim();
      if (fileKey && !/^(?:local\/[0-9a-f-]{36}\.(?:webp|pdf)|uploads\/[a-zA-Z0-9._-]+)$/i.test(fileKey)) {
        return res.status(400).json({ message: 'Invalid KYC document reference' });
      }
      data.kycDocumentUrl = fileKey || null;
      data.kycVerified = false;
      data.kycVerifiedAt = null;
    }
    if (input.foodOptOut !== undefined) data.foodOptOut = Boolean(input.foodOptOut);

    const updated = await db.pGTenant.update({ where: { id: tenant.id }, data });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG resident profile update error');
    res.status(500).json({ message: 'Failed to update resident profile' });
  }
};

export const listResidentNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const notifications = await db.pGResidentNotification.findMany({
      where: { propertyId: scope.propertyId, tenantId: { in: scope.tenantIds } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ notifications, unreadCount: notifications.filter((notification: any) => !notification.readAt).length });
  } catch (error) {
    logger.error({ err: error }, 'PG resident notification list error');
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

export const createResidentPaymentClaim = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(paymentClaimBody, req, res, 'Enter a positive amount and a valid UPI transaction reference');
  if (!body) return;
  const { amount, reference } = body;

  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const tenant = scope.tenants.find((item: any) => item.id === String(body.tenantId) && ['ACTIVE', 'NOTICE_PERIOD'].includes(item.status));
    if (!tenant) return res.status(404).json({ message: 'Active stay not found' });
    const entry = await db.pGRentEntry.findFirst({
      where: {
        id: String(body.rentEntryId || ''),
        tenantId: tenant.id,
        entryType: { in: ['RENT', 'DEPOSIT', 'UTILITY', 'ELECTRICITY', 'FOOD'] },
        status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] }
      }
    });
    if (!entry) return res.status(404).json({ message: 'Outstanding rent entry not found' });
    if (amount > Math.round((entry.amount - entry.paidAmount) * 100) / 100) {
      return res.status(400).json({ message: 'Amount cannot exceed the outstanding balance' });
    }
    const property = await db.pGProperty.findUnique({ where: { id: scope.propertyId }, select: { upiId: true } });
    if (!property?.upiId) return res.status(409).json({ message: 'Online UPI payment is not set up for this PG yet' });
    const existing = await db.pGPaymentClaim.findFirst({ where: { rentEntryId: entry.id, status: 'PENDING' } });
    if (existing) return res.status(409).json({ message: 'A payment claim is already awaiting review for this rent entry' });

    const claim = await db.pGPaymentClaim.create({
      data: { propertyId: scope.propertyId, tenantId: tenant.id, rentEntryId: entry.id, amount, reference }
    });
    res.status(201).json({ ...claim, upiId: property.upiId });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ message: 'This transaction reference has already been submitted' });
    logger.error({ err: error }, 'PG resident payment claim error');
    res.status(500).json({ message: 'Failed to submit payment claim' });
  }
};

export const listResidentPaymentClaims = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const claims = await db.pGPaymentClaim.findMany({
      where: { propertyId: scope.propertyId, tenantId: { in: scope.tenantIds } },
      include: { rentEntry: { select: { id: true, entryType: true, period: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(claims);
  } catch (error) {
    logger.error({ err: error }, 'PG resident payment claim list error');
    res.status(500).json({ message: 'Failed to fetch payment claims' });
  }
};

export const markResidentNotificationRead = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const updated = await db.pGResidentNotification.updateMany({
      where: {
        id: String(req.params.notificationId),
        propertyId: scope.propertyId,
        tenantId: { in: scope.tenantIds },
        readAt: null
      },
      data: { readAt: new Date() }
    });
    if (!updated.count) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    logger.error({ err: error }, 'PG resident notification update error');
    res.status(500).json({ message: 'Failed to update notification' });
  }
};

export const createMaintenanceTicket = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(createMaintenanceTicketBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { propertyId, tenantId, title, description, category, priority, imageUrl, assignedTo } = input;
  if (!propertyId || !title?.trim() || !description?.trim()) {
    return res.status(400).json({ message: 'Property, title and description are required' });
  }
  if (!await canManageProperty(req, String(propertyId))) {
    return res.status(403).json({ message: 'You do not have access to this property' });
  }

  try {
    if (assignedTo) {
      const staffAccess = await db.pGPropertyAccess.findFirst({
        where: { propertyId: String(propertyId), userId: String(assignedTo), role: 'WARDEN' },
        select: { id: true }
      });
      if (!staffAccess) return res.status(400).json({ message: 'Assigned warden must have access to this property' });
    }
    const ticket = await db.pGMaintenanceTicket.create({
      data: {
        propertyId: String(propertyId),
        tenantId: tenantId || null,
        title: title.trim(),
        description: description.trim(),
        category: category?.trim() || 'OTHER',
        priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority) ? priority : 'NORMAL',
        imageUrl: imageUrl?.trim() || null,
        assignedTo: assignedTo ? String(assignedTo) : null
      }
    });
    res.status(201).json(ticket);
  } catch (error) {
    logger.error({ err: error }, 'PG maintenance creation error');
    res.status(500).json({ message: 'Failed to create maintenance ticket' });
  }
};

export const updateMaintenanceStatus = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(updateMaintenanceStatusBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const status = String(input.status || '').toUpperCase();
  if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
    return res.status(400).json({ message: 'Invalid maintenance status' });
  }

  try {
    const ticket = await db.pGMaintenanceTicket.findUnique({ where: { id: String(req.params.ticketId) } });
    if (!ticket) return res.status(404).json({ message: 'Maintenance ticket not found' });
    if (!await canManageProperty(req, ticket.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const updated = await db.$transaction(async (tx: any) => {
      const changed = await tx.pGMaintenanceTicket.updateMany({
        where: { id: ticket.id, status: ticket.status },
        data: { status }
      });
      if (changed.count !== 1) throw new Error('TICKET_STATUS_CHANGED');
      if (ticket.tenantId && ticket.status !== status) {
        await createResidentNotification(tx, {
          propertyId: ticket.propertyId,
          tenantId: ticket.tenantId,
          type: 'MAINTENANCE_STATUS',
          title: 'Maintenance request updated',
          message: `Your request "${ticket.title}" is now ${status.toLowerCase().replace('_', ' ')}.`,
          entityId: ticket.id
        });
      }
      return tx.pGMaintenanceTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    });
    res.json(updated);
  } catch (error) {
    if ((error as Error)?.message === 'TICKET_STATUS_CHANGED') return res.status(409).json({ message: 'Ticket status changed; refresh and try again' });
    logger.error({ err: error }, 'PG maintenance status update error');
    res.status(500).json({ message: 'Failed to update maintenance ticket' });
  }
};

export const listOwnerPaymentClaims = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, ['OWNER']);
    const claims = await db.pGPaymentClaim.findMany({
      where: { propertyId: { in: propertyIds } },
      include: {
        tenant: { select: { id: true, name: true, phone: true } },
        rentEntry: { select: { id: true, entryType: true, period: true, amount: true, paidAmount: true, status: true } },
        property: { select: { id: true, name: true } }
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100
    });
    res.json(claims);
  } catch (error) {
    logger.error({ err: error }, 'PG payment claim list error');
    res.status(500).json({ message: 'Failed to fetch payment claims' });
  }
};

export const reviewPaymentClaim = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(paymentClaimReviewBody, req, res, 'Choose approve or reject');
  if (!body) return;
  const { status, responseNote } = body;
  if (status === 'REJECTED' && !responseNote) return res.status(400).json({ message: 'A reason is required when rejecting a payment claim' });

  try {
    const claim = await db.pGPaymentClaim.findUnique({
      where: { id: String(req.params.claimId) },
      include: { rentEntry: true, tenant: true }
    });
    if (!claim) return res.status(404).json({ message: 'Payment claim not found' });
    if (!await canManageProperty(req, claim.propertyId, ['OWNER'])) return res.status(403).json({ message: 'Only the property owner can verify a payment claim' });
    if (claim.status !== 'PENDING') return res.status(409).json({ message: 'This payment claim has already been reviewed' });

    const updated = await db.$transaction(async (tx: any) => {
      if (status === 'APPROVED') {
        const remaining = Math.max(0, claim.rentEntry.amount - claim.rentEntry.paidAmount);
        if (claim.amount > remaining || claim.rentEntry.status === 'PAID') throw new Error('PAYMENT_EXCEEDS_BALANCE');
        const paidAmount = claim.rentEntry.paidAmount + claim.amount;
        const ledgerUpdate = await tx.pGRentEntry.updateMany({
          where: { id: claim.rentEntryId, paidAmount: claim.rentEntry.paidAmount, status: claim.rentEntry.status },
          data: {
            paidAmount,
            status: paidAmount >= claim.rentEntry.amount ? 'PAID' : 'PARTIAL',
            paidAt: paidAmount >= claim.rentEntry.amount ? new Date() : claim.rentEntry.paidAt,
            method: 'UPI',
            reference: claim.reference
          }
        });
        if (ledgerUpdate.count !== 1) throw new Error('PAYMENT_CONFLICT');
        if (claim.rentEntry.entryType === 'DEPOSIT') {
          await tx.pGTenant.update({ where: { id: claim.tenantId }, data: { depositReceived: { increment: claim.amount } } });
        }
      }

      const reviewed = await tx.pGPaymentClaim.updateMany({
        where: { id: claim.id, status: 'PENDING' },
        data: { status, reviewedBy: currentUser(req)?.id || null, reviewedAt: new Date(), responseNote: responseNote || null }
      });
      if (reviewed.count !== 1) throw new Error('CLAIM_ALREADY_REVIEWED');
      await createResidentNotification(tx, {
        propertyId: claim.propertyId,
        tenantId: claim.tenantId,
        type: 'PAYMENT_CLAIM',
        title: status === 'APPROVED' ? 'Payment confirmed' : 'Payment needs attention',
        message: status === 'APPROVED' ? `Your UPI payment of Rs ${claim.amount} was confirmed.` : `Your payment claim was not confirmed. ${responseNote}`,
        entityId: claim.id
      });
      return tx.pGPaymentClaim.findUniqueOrThrow({ where: { id: claim.id } });
    });
    logAudit(claim.propertyId, currentUser(req)?.id, `PAYMENT_CLAIM_${status}`, 'PGPaymentClaim', claim.id, claim.reference);
    res.json(updated);
  } catch (error) {
    const code = String((error as Error)?.message || '');
    if (code === 'PAYMENT_EXCEEDS_BALANCE') return res.status(409).json({ message: 'The outstanding balance changed; refresh the ledger before reviewing this claim' });
    if (code === 'PAYMENT_CONFLICT' || code === 'CLAIM_ALREADY_REVIEWED') return res.status(409).json({ message: 'Payment data changed; refresh and try again' });
    logger.error({ err: error }, 'PG payment claim review error');
    res.status(500).json({ message: 'Failed to review payment claim' });
  }
};