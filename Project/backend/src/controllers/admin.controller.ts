import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  isGenderPolicy,
  isLeadStatus,
  isPropertyType,
  isStrongPassword,
  isValidPhone,
  isValidUpiId,
  MESSAGES,
  normalizeIndianPhone,
  phoneVariants
} from '@livingplus/shared';
import { asSystem, db } from '../db/index.js';
import { logAudit } from '../services/pg-audit.js';
import { scheduleSearchIndex } from '../services/semantic-search.js';
import { logger } from '../utils/logger.js';
import { createUniquePgSlug } from '../utils/pg-slug.js';
import { INVALID_REQUEST, parseBody } from '../utils/validate.js';
import {
  adminCreateRoomBody,
  adminOnboardBody,
  adminUpdatePropertyBody,
  updateOwnerLeadBody
} from '../validation/request.schemas.js';
import { currentUser, requestPropertyId } from './pg/access.js';

function cleanList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function optionalCoord(raw: unknown, limit: number): { ok: true; value: number | null } | { ok: false } {
  if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return { ok: false };
  return { ok: true, value: n };
}

/** Ensures only Living Plus internal onboarding ops (PLATFORM_ADMIN) on the main host may access /admin APIs. */
export const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ message: 'Authorization token required' });
    return;
  }
  if (user.role !== 'PLATFORM_ADMIN' || requestPropertyId(req) || user.propertyId) {
    res.status(403).json({ message: 'Living Plus onboarding ops access is required' });
    return;
  }
  next();
};

export const getAdminOverview = async (_req: Request, res: Response): Promise<any> => {
  try {
    const [leads, properties, ownersCount, beds, recentLeads] = await Promise.all([
      db.ownerLead.groupBy({ by: ['status'], _count: { _all: true } }),
      db.pGProperty.groupBy({ by: ['status'], _count: { _all: true } }),
      asSystem('admin overview owner count', () => db.user.count({ where: { role: 'PG_OWNER' } })),
      db.pGBed.groupBy({ by: ['status'], _count: { _all: true } }),
      db.ownerLead.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
    ]);

    const leadCounts: Record<string, number> = { NEW: 0, CONTACTED: 0, IN_PROGRESS: 0, PUBLISHED: 0, ARCHIVED: 0 };
    for (const row of leads) leadCounts[row.status] = row._count._all;

    let activeProperties = 0;
    let draftProperties = 0;
    for (const row of properties) {
      if (row.status === 'ACTIVE') activeProperties += row._count._all;
      else draftProperties += row._count._all;
    }

    let totalBeds = 0;
    let availableBeds = 0;
    let occupiedBeds = 0;
    for (const row of beds) {
      totalBeds += row._count._all;
      if (row.status === 'AVAILABLE') availableBeds += row._count._all;
      if (row.status === 'OCCUPIED') occupiedBeds += row._count._all;
    }

    res.json({
      leadCounts,
      totalLeads: Object.values(leadCounts).reduce((sum, n) => sum + n, 0),
      activeProperties,
      draftProperties,
      totalProperties: activeProperties + draftProperties,
      ownersCount,
      totalBeds,
      availableBeds,
      occupiedBeds,
      recentLeads
    });
  } catch (error) {
    logger.error({ err: error }, 'Admin overview error');
    res.status(500).json({ message: 'Failed to load onboarding overview' });
  }
};

export const listOwnerLeads = async (req: Request, res: Response): Promise<any> => {
  const status = String(req.query.status || '').trim().toUpperCase();
  const search = String(req.query.search || '').trim();
  try {
    const leads = await db.ownerLead.findMany({
      where: {
        ...(isLeadStatus(status) ? { status } : {}),
        ...(search ? {
          OR: [
            { ownerName: { contains: search, mode: 'insensitive' } },
            { propertyName: { contains: search, mode: 'insensitive' } },
            { locality: { contains: search, mode: 'insensitive' } },
            { city: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search.replace(/\D/g, '') || search, mode: 'insensitive' } }
          ]
        } : {})
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(leads);
  } catch (error) {
    logger.error({ err: error }, 'Admin lead list error');
    res.status(500).json({ message: 'Failed to fetch owner leads' });
  }
};

export const updateOwnerLead = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(updateOwnerLeadBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const leadId = String(req.params.leadId || '');
  const data: Record<string, unknown> = {};
  if (input.status !== undefined) {
    const nextStatus = String(input.status || '').trim().toUpperCase();
    if (!isLeadStatus(nextStatus)) {
      return res.status(400).json({ message: 'Invalid lead status' });
    }
    data.status = nextStatus;
  }
  if (input.internalNotes !== undefined) {
    data.internalNotes = input.internalNotes ? String(input.internalNotes).trim() : null;
  }
  if (!Object.keys(data).length) return res.status(400).json({ message: 'Nothing to update' });

  try {
    const existing = await db.ownerLead.findUnique({ where: { id: leadId } });
    if (!existing) return res.status(404).json({ message: 'Lead not found' });
    const updated = await db.ownerLead.update({ where: { id: leadId }, data });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Admin lead update error');
    res.status(500).json({ message: 'Failed to update owner lead' });
  }
};

export const listAdminOwners = async (_req: Request, res: Response): Promise<any> => {
  try {
    const owners = await asSystem('admin lists PG owner accounts', () =>
      db.user.findMany({
        where: { role: 'PG_OWNER' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          phoneVerifiedAt: true,
          createdAt: true,
          _count: { select: { pgAccess: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    );
    res.json(owners.map((owner: any) => ({
      id: owner.id,
      name: owner.name,
      phone: owner.phone,
      email: owner.email,
      phoneVerified: Boolean(owner.phoneVerifiedAt),
      propertyCount: owner._count?.pgAccess ?? 0,
      createdAt: owner.createdAt
    })));
  } catch (error) {
    logger.error({ err: error }, 'Admin owners list error');
    res.status(500).json({ message: 'Failed to list owners' });
  }
};

export const listAdminProperties = async (req: Request, res: Response): Promise<any> => {
  const status = String(req.query.status || '').trim().toUpperCase();
  const search = String(req.query.search || '').trim();
  try {
    const properties: any[] = await asSystem('admin lists all marketplace properties with owner info', () =>
      db.pGProperty.findMany({
        where: {
          ...(status === 'ACTIVE' || status === 'INACTIVE' ? { status } : {}),
          ...(search ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { locality: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } }
            ]
          } : {})
        },
        include: {
          rooms: {
            include: { beds: { select: { id: true, label: true, status: true } } },
            orderBy: { roomNumber: 'asc' }
          },
          access: {
            where: { role: 'OWNER' },
            include: { user: { select: { id: true, name: true, phone: true, email: true, phoneVerifiedAt: true } } }
          },
          _count: {
            select: {
              tenants: { where: { status: { in: ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'] } } },
              bookings: { where: { status: 'PENDING' } }
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }]
      })
    );
    res.json(properties.map((property) => {
      const owner = property.access?.[0]?.user ?? null;
      const beds = property.rooms.flatMap((room: any) => room.beds);
      return {
        ...property,
        owner: owner ? {
          id: owner.id,
          name: owner.name,
          phone: owner.phone,
          email: owner.email,
          phoneVerified: Boolean(owner.phoneVerifiedAt)
        } : null,
        totalBeds: beds.length,
        availableBeds: beds.filter((b: any) => b.status === 'AVAILABLE').length,
        occupiedBeds: beds.filter((b: any) => b.status === 'OCCUPIED').length,
        activeTenantsCount: property._count?.tenants ?? 0,
        pendingBookingsCount: property._count?.bookings ?? 0
      };
    }));
  } catch (error) {
    logger.error({ err: error }, 'Admin property list error');
    res.status(500).json({ message: 'Failed to load properties' });
  }
};

export const conciergeOnboardProperty = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(adminOnboardBody, req, res, INVALID_REQUEST);
  if (!input) return;

  const admin = currentUser(req);
  const prop = input.property || {};
  const propName = String(prop.name || '').trim();
  const address = String(prop.address || '').trim();
  const locality = String(prop.locality || '').trim();
  if (!propName || !address || !locality) {
    return res.status(400).json({ message: 'Property name, street address, and locality are required' });
  }
  const lat = optionalCoord(prop.latitude, 90);
  const lng = optionalCoord(prop.longitude, 180);
  if (!lat.ok || !lng.ok) {
    return res.status(400).json({ message: 'Invalid latitude or longitude coordinates' });
  }
  const upiId = prop.upiId ? String(prop.upiId).trim() : '';
  if (upiId && !isValidUpiId(upiId)) {
    return res.status(400).json({ message: MESSAGES.upiId });
  }

  const desiredStatus = String(prop.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const roomInputs = Array.isArray(input.rooms) ? input.rooms : [];
  if (desiredStatus === 'ACTIVE' && roomInputs.length === 0) {
    return res.status(400).json({ message: 'Add at least one room before publishing live to the marketplace' });
  }
  for (const room of roomInputs) {
    const roomNum = String(room.roomNumber || '').trim();
    const rent = Number(room.monthlyRent);
    const bedCount = Number(room.numberOfBeds);
    if (!roomNum || !Number.isFinite(rent) || rent <= 0 || !Number.isInteger(bedCount) || bedCount < 1 || bedCount > 20) {
      return res.status(400).json({ message: `Room ${roomNum || '(unnamed)'}: room number, positive rent, and 1–20 beds are required` });
    }
  }

  const existingOwnerId = input.existingOwnerId ? String(input.existingOwnerId).trim() : '';
  const ownerPhoneRaw = String(input.ownerPhone || prop.contactPhone || '').trim();
  const normalizedOwnerPhone = normalizeIndianPhone(ownerPhoneRaw);
  const ownerName = String(input.ownerName || '').trim();
  const ownerEmail = input.ownerEmail ? String(input.ownerEmail).trim() : null;
  const ownerPassword = input.ownerPassword ? String(input.ownerPassword) : '';

  if (!existingOwnerId && (!ownerName || !isValidPhone(ownerPhoneRaw))) {
    return res.status(400).json({ message: 'Choose an existing owner or provide the new owner name and valid phone number' });
  }

  try {
    const result = await asSystem('platform admin concierge onboarding', () =>
      db.$transaction(async (tx: any) => {
        let owner: any = null;
        let ownerCreated = false;

        if (existingOwnerId) {
          owner = await tx.user.findUnique({ where: { id: existingOwnerId } });
          if (!owner || owner.role !== 'PG_OWNER') throw new Error('OWNER_NOT_FOUND');
        } else {
          const variants = phoneVariants(ownerPhoneRaw).filter(Boolean);
          const existingByPhone = await tx.user.findFirst({
            where: {
              OR: [
                { phone: { in: variants } },
                ...(ownerEmail ? [{ email: ownerEmail }] : [])
              ]
            }
          });
          if (existingByPhone) {
            if (existingByPhone.role !== 'PG_OWNER') throw new Error('PHONE_CONFLICT');
            owner = existingByPhone;
          } else {
            if (!ownerPassword || !isStrongPassword(ownerPassword)) {
              throw new Error('WEAK_PASSWORD');
            }
            const passwordHash = await bcrypt.hash(ownerPassword, 10);
            owner = await tx.user.create({
              data: {
                name: ownerName,
                phone: normalizedOwnerPhone,
                email: ownerEmail,
                password: passwordHash,
                role: 'PG_OWNER',
                phoneVerifiedAt: new Date()
              }
            });
            ownerCreated = true;
          }
        }

        const slug = await createUniquePgSlug(tx, propName);
        const contactDigits = prop.contactPhone ? normalizeIndianPhone(String(prop.contactPhone)) : owner.phone;
        const property = await tx.pGProperty.create({
          data: {
            slug,
            name: propName,
            propertyType: isPropertyType(String(prop.propertyType || '').toUpperCase()) ? String(prop.propertyType).toUpperCase() : 'PG',
            tagline: prop.tagline ? String(prop.tagline).trim() : null,
            description: prop.description ? String(prop.description).trim() : null,
            address,
            locality,
            city: prop.city ? String(prop.city).trim() : 'Chennai',
            landmark: prop.landmark ? String(prop.landmark).trim() : null,
            pincode: prop.pincode ? String(prop.pincode).trim() : null,
            latitude: lat.value,
            longitude: lng.value,
            contactPhone: contactDigits || null,
            upiId: upiId || null,
            genderPolicy: isGenderPolicy(String(prop.genderPolicy || '').toUpperCase()) ? String(prop.genderPolicy).toUpperCase() : 'ANY',
            amenities: cleanList(prop.amenities),
            highlights: cleanList(prop.highlights),
            foodDetails: prop.foodDetails ? String(prop.foodDetails).trim() : null,
            nearbyPlaces: cleanList(prop.nearbyPlaces),
            houseRules: cleanList(prop.houseRules),
            photoUrls: cleanList(prop.photoUrls),
            status: desiredStatus,
            featured: Boolean(prop.featured),
            onboardedByAdmin: true,
            bookingLockMinutes: Number.isInteger(Number(prop.bookingLockMinutes)) && Number(prop.bookingLockMinutes) >= 10 ? Number(prop.bookingLockMinutes) : 120,
            rentDay: Number.isInteger(Number(prop.rentDay)) && Number(prop.rentDay) >= 1 && Number(prop.rentDay) <= 28 ? Number(prop.rentDay) : 1,
            rentDueDay: Number.isInteger(Number(prop.rentDueDay)) && Number(prop.rentDueDay) >= 1 && Number(prop.rentDueDay) <= 28 ? Number(prop.rentDueDay) : 5,
            access: { create: { userId: owner.id, role: 'OWNER' } }
          }
        });

        const createdRooms = [];
        for (const room of roomInputs) {
          const bedCount = Number(room.numberOfBeds);
          const customLabels = cleanList(room.bedLabels);
          const createdRoom = await tx.pGRoom.create({
            data: {
              propertyId: property.id,
              roomNumber: String(room.roomNumber).trim(),
              block: room.block ? String(room.block).trim() : null,
              floor: room.floor != null && room.floor !== '' && Number.isInteger(Number(room.floor)) ? Number(room.floor) : null,
              roomType: room.roomType ? String(room.roomType).trim().toUpperCase() : 'SHARED',
              monthlyRent: Number(room.monthlyRent),
              depositAmount: Number(room.depositAmount) > 0 ? Number(room.depositAmount) : 0,
              maintenanceFee: Number(room.maintenanceFee) > 0 ? Number(room.maintenanceFee) : 0,
              utilitiesSurcharge: Number(room.utilitiesSurcharge) > 0 ? Number(room.utilitiesSurcharge) : 0,
              hasAc: Boolean(room.hasAc),
              foodIncluded: Boolean(room.foodIncluded),
              foodCharge: Number(room.foodCharge) > 0 ? Number(room.foodCharge) : 0,
              description: room.description ? String(room.description).trim() : null,
              amenities: cleanList(room.amenities),
              photoUrls: cleanList(room.photoUrls),
              beds: {
                create: Array.from({ length: bedCount }, (_, idx) => ({
                  label: customLabels[idx] || `Bed ${idx + 1}`
                }))
              }
            },
            include: { beds: true }
          });
          createdRooms.push(createdRoom);
        }

        const leadId = input.leadId ? String(input.leadId).trim() : null;
        if (leadId) {
          const lead = await tx.ownerLead.findUnique({ where: { id: leadId } });
          if (lead) {
            await tx.ownerLead.update({
              where: { id: leadId },
              data: {
                onboardedPropertyId: property.id,
                onboardedOwnerId: owner.id,
                status: desiredStatus === 'ACTIVE' ? 'PUBLISHED' : 'IN_PROGRESS'
              }
            });
          }
        }

        return {
          property: { ...property, rooms: createdRooms },
          owner: { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email, created: ownerCreated },
          leadId
        };
      })
    );

    logAudit(result.property.id, admin?.id, 'PROPERTY_ONBOARDED_BY_ADMIN', 'PGProperty', result.property.id, result.property.name);
    scheduleSearchIndex(result.property.id);
    res.status(201).json(result);
  } catch (error: any) {
    if (error?.message === 'OWNER_NOT_FOUND') {
      return res.status(404).json({ message: 'Selected owner account was not found' });
    }
    if (error?.message === 'PHONE_CONFLICT') {
      return res.status(409).json({ message: 'That phone or email belongs to a non-owner account' });
    }
    if (error?.message === 'WEAK_PASSWORD') {
      return res.status(400).json({ message: MESSAGES.strongPassword });
    }
    if (error?.code === 'P2002') {
      return res.status(409).json({ message: 'Duplicate room number or owner details detected' });
    }
    logger.error({ err: error }, 'Concierge onboarding error');
    res.status(500).json({ message: 'Failed to onboard PG property' });
  }
};

export const adminUpdateProperty = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(adminUpdatePropertyBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const propertyId = String(req.params.propertyId || '');
  const fields = [
    'name', 'propertyType', 'tagline', 'description', 'address', 'locality', 'city',
    'landmark', 'pincode', 'latitude', 'longitude', 'contactPhone', 'upiId',
    'genderPolicy', 'amenities', 'highlights', 'foodDetails', 'nearbyPlaces',
    'houseRules', 'photoUrls', 'status', 'featured', 'bookingLockMinutes', 'rentDay', 'rentDueDay'
  ];
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) data[field] = input[field];
  }
  if (typeof data.name === 'string') data.name = data.name.trim();
  if (typeof data.tagline === 'string') data.tagline = data.tagline.trim() || null;
  if (typeof data.description === 'string') data.description = data.description.trim() || null;
  if (typeof data.foodDetails === 'string') data.foodDetails = data.foodDetails.trim() || null;
  if (typeof data.address === 'string') data.address = data.address.trim();
  if (typeof data.locality === 'string') data.locality = data.locality.trim();
  if (typeof data.contactPhone === 'string') data.contactPhone = data.contactPhone.replace(/\D/g, '') || null;
  if (data.propertyType !== undefined) {
    data.propertyType = isPropertyType(String(data.propertyType).toUpperCase()) ? String(data.propertyType).toUpperCase() : 'PG';
  }
  if (data.genderPolicy !== undefined) {
    data.genderPolicy = isGenderPolicy(String(data.genderPolicy).toUpperCase()) ? String(data.genderPolicy).toUpperCase() : 'ANY';
  }
  if (data.status !== undefined) {
    const nextStatus = String(data.status).toUpperCase();
    if (!['ACTIVE', 'INACTIVE'].includes(nextStatus)) return res.status(400).json({ message: 'Status must be ACTIVE or INACTIVE' });
    data.status = nextStatus;
  }
  for (const listField of ['amenities', 'highlights', 'nearbyPlaces', 'houseRules', 'photoUrls']) {
    if (data[listField] !== undefined) data[listField] = cleanList(data[listField]);
  }
  for (const [coord, limit] of [['latitude', 90], ['longitude', 180]] as const) {
    if (data[coord] !== undefined) {
      const parsed = optionalCoord(data[coord], limit);
      if (!parsed.ok) return res.status(400).json({ message: `Invalid ${coord}` });
      data[coord] = parsed.value;
    }
  }
  if (data.upiId !== undefined) {
    const upi = String(data.upiId || '').trim();
    if (upi && !isValidUpiId(upi)) return res.status(400).json({ message: MESSAGES.upiId });
    data.upiId = upi || null;
  }

  try {
    const existing = await db.pGProperty.findUnique({ where: { id: propertyId }, select: { id: true } });
    if (!existing) return res.status(404).json({ message: 'Property not found' });
    const updated = await db.pGProperty.update({
      where: { id: propertyId },
      data,
      include: { rooms: { include: { beds: true }, orderBy: { roomNumber: 'asc' } } }
    });
    scheduleSearchIndex(propertyId);
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Admin property update error');
    res.status(500).json({ message: 'Failed to update property' });
  }
};

export const adminCreateRoom = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(adminCreateRoomBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const propertyId = String(req.params.propertyId || '');
  const bedCount = Number(input.numberOfBeds);
  const rent = Number(input.monthlyRent);
  if (!String(input.roomNumber || '').trim() || !Number.isFinite(rent) || rent <= 0 || !Number.isInteger(bedCount) || bedCount < 1 || bedCount > 20) {
    return res.status(400).json({ message: 'Room number, positive monthly rent and 1-20 beds are required' });
  }

  try {
    const property = await db.pGProperty.findUnique({ where: { id: propertyId }, select: { id: true } });
    if (!property) return res.status(404).json({ message: 'Property not found' });
    const customLabels = cleanList(input.bedLabels);
    const room = await db.pGRoom.create({
      data: {
        propertyId,
        roomNumber: String(input.roomNumber).trim(),
        block: input.block ? String(input.block).trim() : null,
        floor: input.floor != null && input.floor !== '' && Number.isInteger(Number(input.floor)) ? Number(input.floor) : null,
        roomType: input.roomType ? String(input.roomType).trim().toUpperCase() : 'SHARED',
        monthlyRent: rent,
        depositAmount: Number(input.depositAmount) > 0 ? Number(input.depositAmount) : 0,
        maintenanceFee: Number(input.maintenanceFee) > 0 ? Number(input.maintenanceFee) : 0,
        utilitiesSurcharge: Number(input.utilitiesSurcharge) > 0 ? Number(input.utilitiesSurcharge) : 0,
        hasAc: Boolean(input.hasAc),
        foodIncluded: Boolean(input.foodIncluded),
        foodCharge: Number(input.foodCharge) > 0 ? Number(input.foodCharge) : 0,
        description: input.description ? String(input.description).trim() : null,
        amenities: cleanList(input.amenities),
        photoUrls: cleanList(input.photoUrls),
        beds: {
          create: Array.from({ length: bedCount }, (_, index) => ({
            label: customLabels[index] || `Bed ${index + 1}`
          }))
        }
      },
      include: { beds: true }
    });
    logAudit(propertyId, currentUser(req)?.id, 'ROOM_CREATED_BY_ADMIN', 'PGRoom', room.id, `${room.roomNumber} · ${bedCount} beds`);
    scheduleSearchIndex(propertyId);
    res.status(201).json(room);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ message: 'A room with this number already exists on this PG' });
    logger.error({ err: error }, 'Admin room create error');
    res.status(500).json({ message: 'Failed to create room' });
  }
};

export const adminDeleteRoom = async (req: Request, res: Response): Promise<any> => {
  const propertyId = String(req.params.propertyId || '');
  const roomId = String(req.params.roomId || '');
  try {
    const room = await db.pGRoom.findFirst({
      where: { id: roomId, propertyId },
      include: { beds: { select: { status: true } } }
    });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.beds.some((bed) => bed.status === 'OCCUPIED' || bed.status === 'RESERVED')) {
      return res.status(409).json({ message: 'Cannot remove a room with occupied or reserved beds' });
    }
    await db.pGRoom.delete({ where: { id: roomId } });
    scheduleSearchIndex(propertyId);
    res.json({ message: 'Room removed' });
  } catch (error) {
    logger.error({ err: error }, 'Admin room delete error');
    res.status(500).json({ message: 'Failed to delete room' });
  }
};
