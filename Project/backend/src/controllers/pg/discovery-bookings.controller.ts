import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { cleanVibeAnswers, cleanVibeSummary, phoneVariants, vibeMatch } from '@livingplus/shared';
import { db } from '../../db/index.js';
import { asSystem } from '../../db/context.js';
import { featureFlags, notifyWhatsAppSafely } from '../../services/pg-notifications.js';
import { consumePhoneToken } from '../pg-auth.controller.js';
import { logAudit } from '../../services/pg-audit.js';
import { firebaseWebConfig, googleSignInEnabled, otpProvider } from '../../services/phone-verification.js';
import { minSemanticScore, semanticScores, semanticSearchEnabled, type SemanticSearchDeps } from '../../services/semantic-search.js';
import { buildGuestBookingWhere, isPlaceholderResidentName } from '../../utils/guest-bookings.js';
import { guestPhoneFrom } from '../../utils/guest-token.js';
import { ACTIVE_RESIDENT_STATUSES, OWN_PROPERTY_BOOKING_MESSAGE, ownPropertyExclusionWhere } from '../../utils/resident-search.js';
import { INVALID_REQUEST, parseBody } from '../../utils/validate.js';
import { logger } from '../../utils/logger.js';
import { bookingRequestBody } from '../../validation/pg.schemas.js';
import { cancelBookingBody, updateBookingStatusBody } from '../../validation/request.schemas.js';
import { accessiblePropertyIds, canManageProperty, currentUser, ownStayPropertyIds, releaseExpiredBookingHolds, requestPropertyId } from './access.js';
import { roommateAnswersByRoom } from './vibecheck.controller.js';

const SITE_SELECT = { slug: true, name: true, locality: true, city: true } as const;

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
export function createSearchPropertiesSemanticHandler(deps: SemanticSearchDeps = {}) {
  return async (req: Request, res: Response): Promise<any> => {
    const query = String(req.query.q || '').trim().slice(0, 200);
    if (query.length < 2 || !semanticSearchEnabled()) return res.json({ semantic: false, results: [] });
    try {
      const hiddenPropertyIds = await ownStayPropertyIds(req);
      const where = {
        ...ownPropertyExclusionWhere(hiddenPropertyIds),
        ...(requestPropertyId(req) ? { id: requestPropertyId(req) } : {})
      };
      const scores = await semanticScores(query, where, deps);
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
}

export const searchPropertiesSemantic = createSearchPropertiesSemanticHandler();

/** Public directory of PG resident sites (/stay/<slug>): name and place only. */
export const listPgSites = async (req: Request, res: Response): Promise<any> => {
  const search = String(req.query.search || '').trim().slice(0, 80);
  try {
    const sites = await db.pGProperty.findMany({
      where: {
        slug: { not: null },
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { locality: { contains: search, mode: 'insensitive' } },
            { city: { contains: search, mode: 'insensitive' } }
          ]
        } : {})
      },
      select: SITE_SELECT,
      orderBy: { name: 'asc' },
      take: 50
    });
    res.json(sites);
  } catch (error) {
    logger.error({ err: error }, 'PG site list error');
    res.status(500).json({ message: 'Failed to list PG sites' });
  }
};

/** One PG resident site by slug, for the resident site header. */
export const getPgSite = async (req: Request, res: Response): Promise<any> => {
  try {
    const site = await db.pGProperty.findFirst({ where: { slug: String(req.params.slug).toLowerCase() }, select: SITE_SELECT });
    if (!site) return res.status(404).json({ message: 'PG site not found' });
    res.json(site);
  } catch (error) {
    logger.error({ err: error }, 'PG site lookup error');
    res.status(500).json({ message: 'Failed to load PG site' });
  }
};

export const listProperties = async (req: Request, res: Response): Promise<any> => {
  const search = String(req.query.search || '').trim();
  const locality = String(req.query.locality || '').trim();
  const genderPolicy = String(req.query.genderPolicy || '').trim();

  try {
    await releaseExpiredBookingHolds();
    const hiddenPropertyIds = await ownStayPropertyIds(req);
    const scopedId = requestPropertyId(req);
    const properties = await db.pGProperty.findMany({
      where: {
        status: 'ACTIVE',
        ...ownPropertyExclusionWhere(hiddenPropertyIds),
        ...(scopedId ? { id: scopedId } : {}),
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

    const verifiedOwners: Array<{ propertyId: string }> = await asSystem('listing badge: does the owner have a verified phone', () => db.pGPropertyAccess.findMany({
      where: { role: 'OWNER', propertyId: { in: properties.map((property: any) => property.id) }, user: { phoneVerifiedAt: { not: null } } },
      select: { propertyId: true }
    }));
    const verified = new Set(verifiedOwners.map((row) => row.propertyId));
    res.json(properties.map((property: any) => {
      const ownerPhone = String(property.contactPhone || '').replace(/\D/g, '');
      return {
        ...property,
        ownerVerified: verified.has(property.id),
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
    const bookingRequester = currentUser(req);
    if (bookingRequester?.role === 'PG_TENANT' && bookingRequester.propertyId === String(propertyId)) {
      return res.status(409).json({ message: OWN_PROPERTY_BOOKING_MESSAGE });
    }
    const ownStayRow = await db.pGTenant.findFirst({
      where: {
        propertyId: String(propertyId),
        phone: { in: phoneVariants(String(phone || '')).filter(Boolean) },
        status: { in: [...ACTIVE_RESIDENT_STATUSES] }
      },
      select: { id: true }
    });
    if (ownStayRow) {
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
          idempotencyKey: idemKey,
          ...(cleanVibeAnswers(body.vibeAnswers) ? { vibeAnswers: cleanVibeAnswers(body.vibeAnswers)!, vibeSummary: cleanVibeSummary(body.vibeSummary) } : {})
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
  const input: any = parseBody(cancelBookingBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const phone = guestPhoneFrom(req);
  if (!phone) return res.status(401).json({ code: 'GUEST_VERIFICATION_REQUIRED', message: 'Verify your phone number to manage your requests' });

  try {
    const booking = await db.pGBooking.findUnique({ where: { bookingRef: String(req.params.bookingRef) } });
    if (!booking) return res.status(404).json({ message: 'Booking request not found' });
    if (requestPropertyId(req) && booking.propertyId !== requestPropertyId(req)) return res.status(404).json({ message: 'Booking request not found' });
    if (booking.phone.replace(/\D/g, '').slice(-10) !== phone) return res.status(404).json({ message: 'Booking request not found' });
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
    const scopedId = requestPropertyId(req);
    const booking = await db.pGBooking.findFirst({
      where: { bookingRef: String(req.params.bookingRef), ...(scopedId ? { propertyId: scopedId } : {}) },
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
  const phone = guestPhoneFrom(req);
  if (!phone) return res.status(401).json({ code: 'GUEST_VERIFICATION_REQUIRED', message: 'Verify your phone number to see your requests' });
  const where = buildGuestBookingWhere(phone, requestPropertyId(req));
  if (!where) return res.status(401).json({ code: 'GUEST_VERIFICATION_REQUIRED', message: 'Verify your phone number to see your requests' });

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
    const pending = bookings.filter((booking: any) => booking.status === 'PENDING' && booking.vibeAnswers && booking.bed);
    const rooms = await roommateAnswersByRoom(pending.map((booking: any) => booking.bed.roomId));
    res.json(bookings.map((booking: any) => {
      const answers = cleanVibeAnswers(booking.vibeAnswers);
      const vibe = booking.status === 'PENDING' && answers && booking.bed ? vibeMatch(answers, rooms.get(booking.bed.roomId) ?? []) : null;
      const { vibeAnswers: _private, vibeSummary: _privateSummary, ...rest } = booking;
      return { ...rest, vibe };
    }));
  } catch (error) {
    logger.error({ err: error }, 'PG booking list error');
    res.status(500).json({ message: 'Failed to fetch booking requests' });
  }
};

export const updateBookingStatus = async (req: Request, res: Response): Promise<any> => {
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
            status: 'RESERVED',
            ...(booking.vibeAnswers ? { vibeAnswers: booking.vibeAnswers, vibeSummary: booking.vibeSummary } : {})
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
