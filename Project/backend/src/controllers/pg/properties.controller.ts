import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { isGenderPolicy, isPropertyType, isStaffRole, isValidUpiId, MESSAGES } from '@livingplus/shared';
import { db } from '../../db/index.js';
import { asSystem } from '../../db/context.js';
import { logAudit } from '../../services/pg-audit.js';
import { scheduleSearchIndex } from '../../services/semantic-search.js';
import { getPlatformCatalog } from '../../services/platform-catalog.js';
import { createUniquePgSlug } from '../../utils/pg-slug.js';
import { INVALID_REQUEST, parseBody } from '../../utils/validate.js';
import { logger } from '../../utils/logger.js';
import {
  createPropertyBody,
  createPropertyStaffBody,
  createRoomBody,
  updateBedStatusBody,
  updatePropertyBody
} from '../../validation/request.schemas.js';
import { accessiblePropertyIds, canManageProperty, currentUser } from './access.js';

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
  const input: any = parseBody(createPropertyBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const user = currentUser(req);
  const {
    name, description, address, locality, contactPhone, upiId, landmark, city, pincode,
    latitude, longitude, genderPolicy, propertyType, tagline, foodDetails,
    amenities, highlights, nearbyPlaces, houseRules, photoUrls
  } = input;
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  if (user.role !== 'PG_OWNER') {
    return res.status(403).json({ message: 'Only property owners can add properties' });
  }
  if (!name?.trim() || !address?.trim() || !locality?.trim()) {
    return res.status(400).json({ message: 'Property name, address and locality are required' });
  }
  if (upiId && !isValidUpiId(String(upiId))) {
    return res.status(400).json({ message: MESSAGES.upiId });
  }

  try {
    const catalog = await getPlatformCatalog();
    const allowedPropertyTypes = catalog.propertyTypes.map((p) => p.value);
    const allowedGenderPolicies = catalog.genderPolicies.map((g) => g.value);
    const property: any = await asSystem('an owner provisions a new PG workspace', async () => db.pGProperty.create({
      data: {
        slug: await createUniquePgSlug(db, name),
        name: name.trim(),
        description: description?.trim() || null,
        tagline: tagline?.trim() || null,
        foodDetails: foodDetails?.trim() || null,
        address: address.trim(),
        locality: locality.trim(),
        contactPhone: contactPhone ? String(contactPhone).replace(/\D/g, '') : null,
        upiId: upiId ? String(upiId).trim() : null,
        landmark: landmark?.trim() || null,
        city: city?.trim() || catalog.defaultCity,
        pincode: pincode?.trim() || null,
        latitude: latitude !== undefined && latitude !== '' && Number.isFinite(Number(latitude)) ? Number(latitude) : null,
        longitude: longitude !== undefined && longitude !== '' && Number.isFinite(Number(longitude)) ? Number(longitude) : null,
        genderPolicy: isGenderPolicy(String(genderPolicy), allowedGenderPolicies) ? genderPolicy : 'ANY',
        propertyType: isPropertyType(String(propertyType), allowedPropertyTypes) ? propertyType : 'PG',
        amenities: Array.isArray(amenities) ? amenities : [],
        highlights: Array.isArray(highlights) ? highlights : [],
        nearbyPlaces: Array.isArray(nearbyPlaces) ? nearbyPlaces : [],
        houseRules: Array.isArray(houseRules) ? houseRules : [],
        photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
        access: { create: { userId: user.id, role: 'OWNER' } }
      }
    }));
    logAudit(property.id, user.id, 'PROPERTY_CREATED', 'PGProperty', property.id, property.name);
    scheduleSearchIndex(property.id);
    res.status(201).json(property);
  } catch (error) {
    logger.error({ err: error }, 'PG property creation error');
    res.status(500).json({ message: 'Failed to create property' });
  }
};

export const updateProperty = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(updatePropertyBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const inputFields = input as Record<string, any>;
  const propertyId = String(req.params.propertyId);
  if (!await canManageProperty(req, propertyId, ['OWNER'])) {
    return res.status(403).json({ message: 'You do not have access to this property' });
  }
  const fields = [
    'name', 'description', 'tagline', 'foodDetails', 'address', 'locality', 'contactPhone',
    'upiId', 'landmark', 'city', 'pincode', 'latitude', 'longitude', 'genderPolicy',
    'propertyType', 'amenities', 'highlights', 'nearbyPlaces', 'houseRules', 'photoUrls',
    'status', 'bookingLockMinutes', 'rentDay', 'rentDueDay'
  ];
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
  if (typeof data.tagline === 'string') data.tagline = data.tagline.trim() || null;
  if (typeof data.foodDetails === 'string') data.foodDetails = data.foodDetails.trim() || null;
  if (typeof data.address === 'string') data.address = data.address.trim();
  if (typeof data.locality === 'string') data.locality = data.locality.trim();
  if (typeof data.contactPhone === 'string') data.contactPhone = data.contactPhone.replace(/\D/g, '') || null;
  if (data.propertyType !== undefined) {
    data.propertyType = isPropertyType(String(data.propertyType)) ? String(data.propertyType) : 'PG';
  }
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
  const input: any = parseBody(createRoomBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { propertyId } = req.params;
  const { roomNumber, floor, block, roomType, monthlyRent, depositAmount, maintenanceFee, utilitiesSurcharge, hasAc, foodIncluded, foodCharge, numberOfBeds, bedLabels, description, amenities, photoUrls } = input;
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
        description: description?.trim() || null,
        amenities: Array.isArray(amenities) ? amenities : [],
        photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
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
        role: { in: ['WARDEN', 'COOK', 'HOUSEKEEPING', 'ACCOUNTANT'] }
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
  const input: any = parseBody(createPropertyStaffBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const owner = currentUser(req);
  const { propertyId, name, email, phone, password } = input;
  const staffRole = isStaffRole(String(input.role || 'WARDEN').toUpperCase()) ? String(input.role || 'WARDEN').toUpperCase() : null;
  if (!staffRole) return res.status(400).json({ message: 'Choose warden, cook, housekeeping or accountant' });
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
      await tx.pGPropertyAccess.create({ data: { propertyId: String(propertyId), userId: newUser.id, role: staffRole } });
      return newUser;
    });
    res.status(201).json({ ...staff, propertyId: String(propertyId), role: staffRole });
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
      where: { propertyId: String(propertyId), userId: String(userId), role: { in: ['WARDEN', 'COOK', 'HOUSEKEEPING', 'ACCOUNTANT'] } },
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

export const getOwnerSummary = async (req: Request, res: Response): Promise<any> => {
  try {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    const propertyIds = await accessiblePropertyIds(req);
    const ownerPropertyIds = await accessiblePropertyIds(req, ['OWNER']);
    const accessRows = await db.pGPropertyAccess.findMany({ where: { userId: user.id }, select: { role: true } });
    const staffRoles = [...new Set(accessRows.map((row: { role: string }) => row.role))];
    const canManageStaff = user.role === 'PG_OWNER' || ownerPropertyIds.length > 0;
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
      canManageStaff,
      staffRoles
    });
  } catch (error) {
    logger.error({ err: error }, 'PG owner summary error');
    res.status(500).json({ message: 'Failed to fetch owner summary' });
  }
};
