import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../app.js';
import { featureFlags, notifyWhatsAppSafely } from '../services/pg-notifications.js';
import { consumePhoneToken } from './pg-auth.controller.js';
import { logAudit } from '../services/pg-audit.js';
function phoneVariants(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    return [...new Set([digits, normalized, normalized.length > 10 ? normalized.slice(-10) : normalized])];
}
const db = new Proxy({}, {
    get: (_target, property) => prisma[property]
});
function currentUser(req) {
    const user = req.user;
    if (!user?.userId || !user?.role)
        return null;
    return { id: String(user.userId), role: String(user.role) };
}
async function canManageProperty(req, propertyId, roles = ['OWNER', 'WARDEN']) {
    const user = currentUser(req);
    if (!user)
        return false;
    if (user.role === 'SUPER_ADMIN')
        return true;
    const access = await db.pGPropertyAccess.findFirst({
        where: { propertyId, userId: user.id, role: { in: roles } },
        select: { id: true }
    });
    return Boolean(access);
}
async function accessiblePropertyIds(req, roles = ['OWNER', 'WARDEN']) {
    const user = currentUser(req);
    if (!user)
        return [];
    if (user.role === 'SUPER_ADMIN') {
        const properties = await db.pGProperty.findMany({ select: { id: true } });
        return properties.map((property) => property.id);
    }
    const access = await db.pGPropertyAccess.findMany({
        where: { userId: user.id, role: { in: roles } },
        select: { propertyId: true }
    });
    return access.map((item) => item.propertyId);
}
async function releaseExpiredBookingHolds() {
    const expiredBookings = await db.pGBooking.findMany({
        where: { status: 'PENDING', lockExpiresAt: { lte: new Date() } },
        select: { id: true, bedId: true }
    });
    if (!expiredBookings.length)
        return;
    await db.$transaction(async (tx) => {
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
export const getPublicConfig = async (_req, res) => {
    res.json({
        whatsappCloudApiEnabled: featureFlags.whatsappCloudApi,
        upiPaymentEnabled: featureFlags.upiPayment
    });
};
export const listProperties = async (req, res) => {
    const search = String(req.query.search || '').trim();
    const locality = String(req.query.locality || '').trim();
    const genderPolicy = String(req.query.genderPolicy || '').trim();
    try {
        await releaseExpiredBookingHolds();
        const properties = await db.pGProperty.findMany({
            where: {
                status: 'ACTIVE',
                ...(locality ? { locality: { contains: locality } } : {}),
                ...(genderPolicy ? { genderPolicy: { in: [genderPolicy, 'ANY'] } } : {}),
                ...(search ? {
                    OR: [
                        { name: { contains: search } },
                        { locality: { contains: search } },
                        { address: { contains: search } }
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
        res.json(properties.map((property) => {
            const ownerPhone = String(property.contactPhone || '').replace(/\D/g, '');
            return {
                ...property,
                managerPhone: ownerPhone.length === 10 ? `91${ownerPhone}` : ownerPhone || null,
                availableBeds: property.rooms.reduce((total, room) => total + room.beds.length, 0),
                rooms: property.rooms.map((room) => ({ ...room, availableBeds: room.beds.length }))
            };
        }));
    }
    catch (error) {
        console.error('PG property search error:', error);
        res.status(500).json({ message: 'Failed to search properties' });
    }
};
export const listOwnerProperties = async (req, res) => {
    try {
        const propertyIds = await accessiblePropertyIds(req);
        const properties = await db.pGProperty.findMany({
            where: { id: { in: propertyIds } },
            include: { rooms: { include: { beds: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(properties);
    }
    catch (error) {
        console.error('PG owner property list error:', error);
        res.status(500).json({ message: 'Failed to fetch properties' });
    }
};
export const createProperty = async (req, res) => {
    const user = currentUser(req);
    const { name, description, address, locality, contactPhone, landmark, city, pincode, latitude, longitude, genderPolicy, amenities, houseRules, photoUrls } = req.body;
    if (!user)
        return res.status(401).json({ message: 'Unauthorized' });
    if (!['SUPER_ADMIN', 'PG_OWNER'].includes(user.role)) {
        return res.status(403).json({ message: 'Only property owners can add properties' });
    }
    if (!name?.trim() || !address?.trim() || !locality?.trim()) {
        return res.status(400).json({ message: 'Property name, address and locality are required' });
    }
    try {
        const property = await db.pGProperty.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                address: address.trim(),
                locality: locality.trim(),
                contactPhone: contactPhone ? String(contactPhone).replace(/\D/g, '') : null,
                landmark: landmark?.trim() || null,
                city: city?.trim() || 'Chennai',
                pincode: pincode?.trim() || null,
                latitude: latitude !== undefined && latitude !== '' && Number.isFinite(Number(latitude)) ? Number(latitude) : null,
                longitude: longitude !== undefined && longitude !== '' && Number.isFinite(Number(longitude)) ? Number(longitude) : null,
                genderPolicy: ['MEN', 'WOMEN', 'ANY'].includes(genderPolicy) ? genderPolicy : 'ANY',
                amenities: Array.isArray(amenities) ? amenities : [],
                houseRules: Array.isArray(houseRules) ? houseRules : [],
                photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
                access: { create: { userId: user.id, role: 'OWNER' } }
            }
        });
        logAudit(property.id, user.id, 'PROPERTY_CREATED', 'PGProperty', property.id, property.name);
        res.status(201).json(property);
    }
    catch (error) {
        console.error('PG property creation error:', error);
        res.status(500).json({ message: 'Failed to create property' });
    }
};
export const updateProperty = async (req, res) => {
    const propertyId = String(req.params.propertyId);
    if (!await canManageProperty(req, propertyId, ['OWNER'])) {
        return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const fields = ['name', 'description', 'address', 'locality', 'contactPhone', 'landmark', 'city', 'pincode', 'latitude', 'longitude', 'genderPolicy', 'amenities', 'houseRules', 'photoUrls', 'status', 'bookingLockMinutes', 'rentDay', 'rentDueDay'];
    for (const numeric of ['bookingLockMinutes', 'rentDay', 'rentDueDay']) {
        if (req.body[numeric] !== undefined) {
            const value = Number(req.body[numeric]);
            if (!Number.isInteger(value) || value < 1 || value > 1440) {
                return res.status(400).json({ message: `${numeric} must be a whole number between 1 and 1440` });
            }
            req.body[numeric] = value;
        }
    }
    const data = {};
    for (const field of fields) {
        if (req.body[field] !== undefined)
            data[field] = req.body[field];
    }
    if (typeof data.name === 'string')
        data.name = data.name.trim();
    if (typeof data.address === 'string')
        data.address = data.address.trim();
    if (typeof data.locality === 'string')
        data.locality = data.locality.trim();
    if (typeof data.contactPhone === 'string')
        data.contactPhone = data.contactPhone.replace(/\D/g, '') || null;
    try {
        const updated = await db.pGProperty.update({ where: { id: propertyId }, data });
        res.json(updated);
    }
    catch (error) {
        console.error('PG property update error:', error);
        res.status(500).json({ message: 'Failed to update property' });
    }
};
export const deleteProperty = async (req, res) => {
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
    }
    catch (error) {
        console.error('PG property delete error:', error);
        res.status(500).json({ message: 'Failed to delete property' });
    }
};
export const createRoom = async (req, res) => {
    const { propertyId } = req.params;
    const { roomNumber, floor, block, roomType, monthlyRent, depositAmount, maintenanceFee, utilitiesSurcharge, hasAc, foodIncluded, numberOfBeds, bedLabels } = req.body;
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
                beds: { create: Array.from({ length: bedCount }, (_, index) => ({ label: Array.isArray(bedLabels) && bedLabels[index]?.trim() ? bedLabels[index].trim() : `Bed ${index + 1}` })) }
            },
            include: { beds: true }
        });
        logAudit(String(propertyId), currentUser(req)?.id, 'ROOM_CREATED', 'PGRoom', room.id, `${room.roomNumber} · ${bedCount} beds`);
        res.status(201).json(room);
    }
    catch (error) {
        console.error('PG room creation error:', error);
        res.status(500).json({ message: 'Failed to create room' });
    }
};
export const updateBedStatus = async (req, res) => {
    const status = String(req.body.status || '').toUpperCase();
    if (!['AVAILABLE', 'MAINTENANCE'].includes(status)) {
        return res.status(400).json({ message: 'Beds can be marked available or under maintenance here' });
    }
    try {
        const bed = await db.pGBed.findUnique({ where: { id: String(req.params.bedId) }, include: { room: true } });
        if (!bed)
            return res.status(404).json({ message: 'Bed not found' });
        if (!await canManageProperty(req, bed.room.propertyId, ['OWNER'])) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        if (!['AVAILABLE', 'MAINTENANCE'].includes(bed.status)) {
            return res.status(409).json({ message: 'Reserved or occupied beds must be released through their booking or tenant record' });
        }
        const updated = await db.pGBed.update({ where: { id: bed.id }, data: { status, maintenanceNote: status === 'MAINTENANCE' ? req.body.note?.trim() || null : null } });
        res.json(updated);
    }
    catch (error) {
        console.error('PG bed status update error:', error);
        res.status(500).json({ message: 'Failed to update bed status' });
    }
};
export const createBookingRequest = async (req, res) => {
    const { propertyId, bedId, residentName, phone, email, moveInDate, notes, phoneToken } = req.body;
    if (!propertyId || !residentName?.trim() || !phone?.trim() || !moveInDate) {
        return res.status(400).json({ message: 'Property, name, phone and move-in date are required' });
    }
    const moveIn = new Date(moveInDate);
    if (Number.isNaN(moveIn.getTime()))
        return res.status(400).json({ message: 'Move-in date is invalid' });
    try {
        const property = await db.pGProperty.findFirst({
            where: { id: String(propertyId), status: 'ACTIVE' },
            select: { id: true, bookingLockMinutes: true }
        });
        if (!property)
            return res.status(404).json({ message: 'Property is not available' });
        const digits = String(phone || '').replace(/\D/g, '');
        const normalizedPhone = digits.length === 10 ? `91${digits}` : digits;
        if (!await consumePhoneToken(normalizedPhone, phoneToken ? String(phoneToken) : undefined)) {
            return res.status(403).json({ message: 'Verify your phone number with the OTP code first' });
        }
        if (!bedId)
            return res.status(400).json({ message: 'Choose an available bed' });
        const booking = await db.$transaction(async (tx) => {
            const bed = await tx.pGBed.findFirst({
                where: { id: String(bedId), room: { propertyId: String(propertyId), status: 'ACTIVE' } },
                select: { id: true, status: true }
            });
            if (!bed || bed.status !== 'AVAILABLE')
                throw new Error('BED_UNAVAILABLE');
            const reserved = await tx.pGBed.updateMany({
                where: { id: bed.id, status: 'AVAILABLE' },
                data: { status: 'RESERVED' }
            });
            if (reserved.count !== 1)
                throw new Error('BED_UNAVAILABLE');
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
                    notes: notes?.trim() || null
                }
            });
        });
        notifyWhatsAppSafely('BOOKING_RECEIVED', booking.phone, [booking.residentName, booking.bookingRef || booking.id]);
        res.status(201).json({ id: booking.id, bookingRef: booking.bookingRef, status: booking.status, message: 'Booking request sent for owner approval' });
    }
    catch (error) {
        if (error?.message === 'BED_UNAVAILABLE') {
            return res.status(409).json({ message: 'This bed is no longer available' });
        }
        console.error('PG booking request error:', error);
        res.status(500).json({ message: 'Failed to submit booking request' });
    }
};
export const cancelBookingRequest = async (req, res) => {
    const phone = String(req.body.phone || '').replace(/\D/g, '');
    if (!phone)
        return res.status(400).json({ message: 'Phone number is required' });
    try {
        const booking = await db.pGBooking.findUnique({ where: { bookingRef: String(req.params.bookingRef) } });
        if (!booking)
            return res.status(404).json({ message: 'Booking request not found' });
        if (booking.phone.replace(/\D/g, '') !== phone)
            return res.status(403).json({ message: 'Phone number does not match this booking' });
        if (booking.status !== 'PENDING')
            return res.status(409).json({ message: 'Only pending requests can be cancelled' });
        await db.$transaction(async (tx) => {
            await tx.pGBooking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
            if (booking.bedId) {
                await tx.pGBed.updateMany({ where: { id: booking.bedId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
            }
        });
        res.json({ message: 'Booking request cancelled' });
    }
    catch (error) {
        console.error('PG booking cancellation error:', error);
        res.status(500).json({ message: 'Failed to cancel booking request' });
    }
};
export const getPublicBookingStatus = async (req, res) => {
    const phone = String(req.query.phone || '').replace(/\D/g, '');
    if (!phone)
        return res.status(400).json({ message: 'Phone number is required' });
    try {
        const booking = await db.pGBooking.findUnique({
            where: { bookingRef: String(req.params.bookingRef) },
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
    }
    catch (error) {
        console.error('PG public booking status error:', error);
        res.status(500).json({ message: 'Failed to fetch booking status' });
    }
};
export const listOwnerBookings = async (req, res) => {
    try {
        await releaseExpiredBookingHolds();
        const propertyIds = await accessiblePropertyIds(req);
        const bookings = await db.pGBooking.findMany({
            where: { propertyId: { in: propertyIds } },
            include: { property: { select: { name: true, locality: true } }, bed: { include: { room: true } }, tenant: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(bookings);
    }
    catch (error) {
        console.error('PG booking list error:', error);
        res.status(500).json({ message: 'Failed to fetch booking requests' });
    }
};
export const updateBookingStatus = async (req, res) => {
    const status = String(req.body.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
        return res.status(400).json({ message: 'Status must be APPROVED, REJECTED or CANCELLED' });
    }
    const rejectionReason = String(req.body.rejectionReason || '').trim();
    if (status === 'REJECTED' && !rejectionReason) {
        return res.status(400).json({ message: 'A reason is required when declining a booking' });
    }
    try {
        const booking = await db.pGBooking.findUnique({
            where: { id: String(req.params.bookingId) },
            include: { bed: { include: { room: true } } }
        });
        if (!booking)
            return res.status(404).json({ message: 'Booking request not found' });
        if (!await canManageProperty(req, booking.propertyId)) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        if (booking.status !== 'PENDING')
            return res.status(409).json({ message: 'Only pending requests can be updated' });
        const newBedId = req.body.newBedId ? String(req.body.newBedId) : null;
        const updated = await db.$transaction(async (tx) => {
            let assignedBedId = booking.bedId;
            if (status === 'APPROVED') {
                if (newBedId && newBedId !== booking.bedId) {
                    const replacement = await tx.pGBed.findFirst({
                        where: { id: newBedId, status: 'AVAILABLE', room: { propertyId: booking.propertyId, status: 'ACTIVE' } },
                        include: { room: true }
                    });
                    if (!replacement)
                        throw new Error('BED_UNAVAILABLE');
                    if (booking.bedId) {
                        await tx.pGBed.updateMany({ where: { id: booking.bedId, status: 'RESERVED' }, data: { status: 'AVAILABLE' } });
                    }
                    const locked = await tx.pGBed.updateMany({ where: { id: replacement.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
                    if (locked.count !== 1)
                        throw new Error('BED_UNAVAILABLE');
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
                if (activeTenant)
                    throw new Error('BED_UNAVAILABLE');
                await tx.pGTenant.create({
                    data: {
                        propertyId: booking.propertyId,
                        bedId: assignedBedId,
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
            }
            else if (booking.bedId) {
                await tx.pGBed.updateMany({
                    where: { id: booking.bedId, status: 'RESERVED' },
                    data: { status: 'AVAILABLE' }
                });
            }
            return tx.pGBooking.update({ where: { id: booking.id }, data: { status, rejectionReason: status === 'REJECTED' ? rejectionReason : null } });
        });
        const actor = currentUser(req);
        if (status === 'APPROVED')
            notifyWhatsAppSafely('BOOKING_APPROVED', booking.phone, [booking.residentName, booking.bookingRef || booking.id]);
        if (status === 'REJECTED')
            notifyWhatsAppSafely('BOOKING_REJECTED', booking.phone, [booking.residentName, rejectionReason]);
        logAudit(booking.propertyId, actor?.id, status === 'APPROVED' ? 'BOOKING_APPROVED' : `BOOKING_${status}`, 'PGBooking', booking.id, status === 'REJECTED' ? rejectionReason : booking.residentName);
        res.json(updated);
    }
    catch (error) {
        if (error?.message === 'BED_UNAVAILABLE') {
            return res.status(409).json({ message: 'This bed is no longer available' });
        }
        console.error('PG booking status update error:', error);
        res.status(500).json({ message: 'Failed to update booking request' });
    }
};
export const checkInTenant = async (req, res) => {
    try {
        const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
        if (!tenant)
            return res.status(404).json({ message: 'Tenant not found' });
        if (!await canManageProperty(req, tenant.propertyId)) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        if (tenant.status !== 'RESERVED')
            return res.status(409).json({ message: 'Only approved tenants can be checked in' });
        const now = new Date();
        const period = now.toISOString().slice(0, 7);
        const invoiceCode = `RENT-${tenant.id.slice(0, 8)}-${period}`;
        const checkedIn = await db.$transaction(async (tx) => {
            if (tenant.bedId) {
                const occupied = await tx.pGBed.updateMany({
                    where: { id: tenant.bedId, status: 'RESERVED' },
                    data: { status: 'OCCUPIED' }
                });
                if (occupied.count !== 1)
                    throw new Error('BED_UNAVAILABLE');
            }
            const activeTenant = await tx.pGTenant.update({
                where: { id: tenant.id },
                data: { status: 'ACTIVE', checkedInAt: now }
            });
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
                where: { tenantId_period_entryType: { tenantId: tenant.id, period, entryType: 'RENT' } },
                update: {},
                create: {
                    tenantId: tenant.id,
                    period,
                    amount: tenant.monthlyRent,
                    dueDate: new Date(now.getFullYear(), now.getMonth(), 1),
                    entryType: 'RENT',
                    invoiceCode
                }
            });
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
    }
    catch (error) {
        if (error?.message === 'BED_UNAVAILABLE')
            return res.status(409).json({ message: 'This bed is no longer reserved for the tenant' });
        console.error('PG tenant check-in error:', error);
        res.status(500).json({ message: 'Failed to check in tenant' });
    }
};
export const checkOutTenant = async (req, res) => {
    const depositDeductions = req.body?.depositDeductions === undefined ? 0 : Number(req.body.depositDeductions);
    if (!Number.isFinite(depositDeductions) || depositDeductions < 0) {
        return res.status(400).json({ message: 'Deposit deductions must be a non-negative amount' });
    }
    try {
        const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
        if (!tenant)
            return res.status(404).json({ message: 'Tenant not found' });
        if (!await canManageProperty(req, tenant.propertyId)) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        if (tenant.status !== 'ACTIVE')
            return res.status(409).json({ message: 'Only active tenants can be checked out' });
        if (depositDeductions > tenant.depositReceived) {
            return res.status(400).json({ message: 'Deductions cannot exceed the deposit received' });
        }
        const depositRefundAmount = Math.max(0, tenant.depositReceived - depositDeductions);
        const depositRefundStatus = tenant.depositReceived <= 0 ? 'NOT_APPLICABLE' : depositRefundAmount > 0 ? 'PENDING' : 'SETTLED';
        const now = new Date();
        const checkedOut = await db.$transaction(async (tx) => {
            if (tenant.bedId) {
                const released = await tx.pGBed.updateMany({
                    where: { id: tenant.bedId, status: 'OCCUPIED' },
                    data: { status: 'AVAILABLE' }
                });
                if (released.count !== 1)
                    throw new Error('BED_STATE_INVALID');
            }
            const updatedTenant = await tx.pGTenant.update({
                where: { id: tenant.id },
                data: { status: 'CHECKED_OUT', moveOutDate: now, checkedOutAt: now, depositDeductions, depositRefundAmount, depositRefundStatus, checkoutNote: String(req.body?.checkoutNote || '').trim() || null }
            });
            if (tenant.bookingId) {
                await tx.pGBooking.update({ where: { id: tenant.bookingId }, data: { status: 'CHECKED_OUT', moveOutDate: now } });
            }
            return updatedTenant;
        });
        logAudit(tenant.propertyId, currentUser(req)?.id, 'TENANT_CHECKED_OUT', 'PGTenant', tenant.id, `${tenant.name} · deductions ${depositDeductions}`);
        res.json(checkedOut);
    }
    catch (error) {
        if (error?.message === 'BED_STATE_INVALID')
            return res.status(409).json({ message: 'Bed status changed; refresh and try again' });
        console.error('PG tenant check-out error:', error);
        res.status(500).json({ message: 'Failed to check out tenant' });
    }
};
export const listTenantStays = async (req, res) => {
    const user = currentUser(req);
    if (!user)
        return res.status(401).json({ message: 'Unauthorized' });
    try {
        const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
        const phones = phoneVariants(String(account?.phone || ''));
        const tenants = await db.pGTenant.findMany({
            where: { phone: { in: phones } },
            include: {
                property: { select: { id: true, name: true, address: true, locality: true, city: true, contactPhone: true } },
                bed: { include: { room: { select: { roomNumber: true, roomType: true } } } },
                rentEntries: { orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(tenants);
    }
    catch (error) {
        console.error('PG tenant stay list error:', error);
        res.status(500).json({ message: 'Failed to fetch your stays' });
    }
};
export const submitTenantNotice = async (req, res) => {
    const user = currentUser(req);
    if (!user)
        return res.status(401).json({ message: 'Unauthorized' });
    try {
        const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
        const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
        if (!tenant || !phoneVariants(String(account?.phone || '')).some((variant) => [tenant.phone, String(tenant.phone || '').replace(/\D/g, '')].includes(variant))) {
            return res.status(404).json({ message: 'Stay not found' });
        }
        if (tenant.status !== 'ACTIVE')
            return res.status(409).json({ message: 'Only active stays can start a notice period' });
        const updated = await db.pGTenant.update({ where: { id: tenant.id }, data: { status: 'NOTICE_PERIOD', noticeDate: new Date() } });
        logAudit(tenant.propertyId, user.id, 'NOTICE_SUBMITTED', 'PGTenant', tenant.id, tenant.name);
        res.json(updated);
    }
    catch (error) {
        console.error('PG tenant notice error:', error);
        res.status(500).json({ message: 'Failed to submit notice' });
    }
};
export const cancelTenantNotice = async (req, res) => {
    const user = currentUser(req);
    if (!user)
        return res.status(401).json({ message: 'Unauthorized' });
    try {
        const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
        const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
        if (!tenant || !phoneVariants(String(account?.phone || '')).some((variant) => [tenant.phone, String(tenant.phone || '').replace(/\D/g, '')].includes(variant))) {
            return res.status(404).json({ message: 'Stay not found' });
        }
        if (tenant.status !== 'NOTICE_PERIOD')
            return res.status(409).json({ message: 'No active notice on this stay' });
        const updated = await db.pGTenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE', noticeDate: null } });
        logAudit(tenant.propertyId, user.id, 'NOTICE_CANCELLED', 'PGTenant', tenant.id, tenant.name);
        res.json(updated);
    }
    catch (error) {
        console.error('PG tenant notice cancel error:', error);
        res.status(500).json({ message: 'Failed to cancel notice' });
    }
};
export const listAuditLogs = async (req, res) => {
    try {
        const propertyIds = await accessiblePropertyIds(req);
        const logs = await db.pHAuditLog.findMany({
            where: { propertyId: { in: propertyIds } },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        const actorIds = [...new Set(logs.map((log) => log.actorId).filter(Boolean))];
        const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
        const names = new Map(actors.map((actor) => [actor.id, actor.name]));
        res.json(logs.map((log) => ({ ...log, actorName: log.actorId ? names.get(log.actorId) || 'Guest' : 'System' })));
    }
    catch (error) {
        console.error('PG audit list error:', error);
        res.status(500).json({ message: 'Failed to fetch activity' });
    }
};
export const markDepositRefunded = async (req, res) => {
    try {
        const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
        if (!tenant)
            return res.status(404).json({ message: 'Tenant not found' });
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
                depositRefundReference: String(req.body?.reference || '').trim() || null,
                depositRefundedAt: new Date()
            }
        });
        logAudit(tenant.propertyId, currentUser(req)?.id, 'DEPOSIT_REFUNDED', 'PGTenant', tenant.id, String(req.body?.reference || '').trim() || null);
        res.json(updated);
    }
    catch (error) {
        console.error('PG deposit refund error:', error);
        res.status(500).json({ message: 'Failed to record deposit refund' });
    }
};
export const listOwnerTenants = async (req, res) => {
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
    }
    catch (error) {
        console.error('PG tenant list error:', error);
        res.status(500).json({ message: 'Failed to fetch tenants' });
    }
};
export const updateTenantProfile = async (req, res) => {
    const allowedFields = [
        'permanentAddress',
        'bloodGroup',
        'institutionOrEmployer',
        'emergencyName',
        'emergencyPhone',
        'kycType',
        'kycDocumentUrl'
    ];
    const verifyKyc = req.body.kycVerified;
    try {
        const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
        if (!tenant)
            return res.status(404).json({ message: 'Tenant not found' });
        if (!await canManageProperty(req, tenant.propertyId)) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        const data = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined)
                data[field] = String(req.body[field]).trim() || null;
        }
        if (verifyKyc !== undefined) {
            data.kycVerified = Boolean(verifyKyc);
            data.kycVerifiedAt = verifyKyc ? new Date() : null;
        }
        const updated = await db.pGTenant.update({ where: { id: tenant.id }, data });
        res.json(updated);
    }
    catch (error) {
        console.error('PG tenant profile update error:', error);
        res.status(500).json({ message: 'Failed to update tenant profile' });
    }
};
export const listPropertyStaff = async (req, res) => {
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
        res.json(staff.map((access) => ({
            ...access.user,
            role: access.role,
            property: access.property
        })));
    }
    catch (error) {
        console.error('PG staff list error:', error);
        res.status(500).json({ message: 'Failed to fetch property staff' });
    }
};
export const createPropertyStaff = async (req, res) => {
    const owner = currentUser(req);
    const { propertyId, name, email, phone, password } = req.body;
    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    if (!owner || !propertyId || !name?.trim() || normalizedPhone.length < 10 || !password) {
        return res.status(400).json({ message: 'Property, staff name, valid phone and password are required' });
    }
    if (!await canManageProperty(req, String(propertyId), ['OWNER'])) {
        return res.status(403).json({ message: 'Only property owners can add staff' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const staff = await db.$transaction(async (tx) => {
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
    }
    catch (error) {
        if (error?.code === 'P2002')
            return res.status(409).json({ message: 'A user with this phone or email already exists' });
        console.error('PG staff creation error:', error);
        res.status(500).json({ message: 'Failed to create property staff account' });
    }
};
export const removePropertyStaff = async (req, res) => {
    const { propertyId, userId } = req.params;
    if (!await canManageProperty(req, String(propertyId), ['OWNER'])) {
        return res.status(403).json({ message: 'Only property owners can remove staff' });
    }
    try {
        const access = await db.pGPropertyAccess.findFirst({
            where: { propertyId: String(propertyId), userId: String(userId), role: 'WARDEN' },
            select: { id: true }
        });
        if (!access)
            return res.status(404).json({ message: 'Staff access not found' });
        await db.pGPropertyAccess.delete({ where: { id: access.id } });
        const otherAccess = await db.pGPropertyAccess.count({ where: { userId: String(userId) } });
        if (!otherAccess)
            await db.user.delete({ where: { id: String(userId) } });
        res.json({ message: 'Staff access removed' });
    }
    catch (error) {
        console.error('PG staff removal error:', error);
        res.status(500).json({ message: 'Failed to remove staff access' });
    }
};
export const listOwnerRentEntries = async (req, res) => {
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
    }
    catch (error) {
        console.error('PG rent ledger list error:', error);
        res.status(500).json({ message: 'Failed to fetch rent ledger' });
    }
};
export const createRentEntry = async (req, res) => {
    const { tenantId, period, amount, dueDate, entryType, notes } = req.body;
    const value = Number(amount);
    const due = new Date(dueDate);
    if (!tenantId || !period || !Number.isFinite(value) || value <= 0 || Number.isNaN(due.getTime())) {
        return res.status(400).json({ message: 'Tenant, period, positive amount and due date are required' });
    }
    try {
        const tenant = await db.pGTenant.findUnique({ where: { id: String(tenantId) } });
        if (!tenant)
            return res.status(404).json({ message: 'Tenant not found' });
        if (!await canManageProperty(req, tenant.propertyId, ['OWNER'])) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        const type = ['RENT', 'DEPOSIT', 'UTILITY'].includes(String(entryType).toUpperCase())
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
                notes: notes?.trim() || null
            }
        });
        res.status(201).json(entry);
    }
    catch (error) {
        if (error?.code === 'P2002')
            return res.status(409).json({ message: 'A ledger entry already exists for this tenant and period' });
        console.error('PG rent ledger create error:', error);
        res.status(500).json({ message: 'Failed to create ledger entry' });
    }
};
export const recordRentPayment = async (req, res) => {
    const amount = Number(req.body.amount);
    const method = String(req.body.method || '').toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !['CASH', 'NEFT', 'UPI', 'OTHER'].includes(method)) {
        return res.status(400).json({ message: 'A positive payment amount and valid payment method are required' });
    }
    try {
        const entry = await db.pGRentEntry.findUnique({
            where: { id: String(req.params.entryId) },
            include: { tenant: true }
        });
        if (!entry)
            return res.status(404).json({ message: 'Ledger entry not found' });
        if (!await canManageProperty(req, entry.tenant.propertyId, ['OWNER'])) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        const paidAmount = Math.min(entry.amount, entry.paidAmount + amount);
        const status = paidAmount >= entry.amount ? 'PAID' : 'PARTIAL';
        const updated = await db.$transaction(async (tx) => {
            const savedEntry = await tx.pGRentEntry.update({
                where: { id: entry.id },
                data: {
                    paidAmount,
                    status,
                    method,
                    reference: req.body.reference?.trim() || entry.reference,
                    paidAt: status === 'PAID' ? new Date() : entry.paidAt
                }
            });
            if (entry.entryType === 'DEPOSIT') {
                await tx.pGTenant.update({
                    where: { id: entry.tenantId },
                    data: { depositReceived: { increment: paidAmount - entry.paidAmount } }
                });
            }
            return savedEntry;
        });
        logAudit(entry.tenant.propertyId, currentUser(req)?.id, 'RENT_PAYMENT_RECORDED', 'PGRentEntry', entry.id, `${paidAmount}/${entry.amount} via ${method}`);
        res.json(updated);
    }
    catch (error) {
        console.error('PG rent payment record error:', error);
        res.status(500).json({ message: 'Failed to record payment' });
    }
};
export const getOwnerReport = async (req, res) => {
    try {
        const propertyIds = await accessiblePropertyIds(req, ['OWNER']);
        const propertyId = req.query.propertyId ? String(req.query.propertyId) : undefined;
        if (propertyId && !propertyIds.includes(propertyId)) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        const scope = propertyId ? [propertyId] : propertyIds;
        const period = String(req.query.period || new Date().toISOString().slice(0, 7));
        const [year, month] = period.split('-').map(Number);
        if (!year || !month || month < 1 || month > 12)
            return res.status(400).json({ message: 'Period must be YYYY-MM' });
        const periodStart = new Date(Date.UTC(year, month - 1, 1));
        const periodEnd = new Date(Date.UTC(year, month, 1));
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
        const totalBeds = properties.reduce((total, property) => total + property.rooms.reduce((roomTotal, room) => roomTotal + room.beds.length, 0), 0);
        const occupiedBeds = tenants.filter((tenant) => tenant.status === 'ACTIVE').length;
        const charged = entries.reduce((total, entry) => total + entry.amount, 0);
        const collected = entries.reduce((total, entry) => total + entry.paidAmount, 0);
        res.json({
            period,
            properties: properties.length,
            totalBeds,
            occupiedBeds,
            availableBeds: properties.reduce((total, property) => total + property.rooms.reduce((roomTotal, room) => roomTotal + room.beds.filter((bed) => bed.status === 'AVAILABLE').length, 0), 0),
            occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
            activeTenants: occupiedBeds,
            newBookings: bookings,
            rentCharged: charged,
            rentCollected: collected,
            outstanding: Math.max(0, charged - collected),
            entries
        });
    }
    catch (error) {
        console.error('PG owner report error:', error);
        res.status(500).json({ message: 'Failed to generate report' });
    }
};
export const getOwnerSummary = async (req, res) => {
    try {
        const user = currentUser(req);
        if (!user)
            return res.status(401).json({ message: 'Unauthorized' });
        const propertyIds = await accessiblePropertyIds(req);
        const ownerPropertyIds = await accessiblePropertyIds(req, ['OWNER']);
        const canManageStaff = user.role === 'SUPER_ADMIN' || ownerPropertyIds.length > 0;
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
        const totalBeds = properties.reduce((total, property) => total + property.rooms.reduce((roomTotal, room) => roomTotal + room.beds.length, 0), 0);
        const rentOutstanding = rentEntries.reduce((total, entry) => total + Math.max(0, entry.amount - entry.paidAmount), 0);
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
    }
    catch (error) {
        console.error('PG owner summary error:', error);
        res.status(500).json({ message: 'Failed to fetch owner summary' });
    }
};
export const listOwnerTickets = async (req, res) => {
    try {
        const propertyIds = await accessiblePropertyIds(req);
        const tickets = await db.pGMaintenanceTicket.findMany({
            where: { propertyId: { in: propertyIds } },
            include: { property: { select: { name: true } }, tenant: { select: { name: true, phone: true } } },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
        });
        const assignedIds = [...new Set(tickets.map((ticket) => ticket.assignedTo).filter(Boolean))];
        const assignedUsers = assignedIds.length ? await db.user.findMany({ where: { id: { in: assignedIds } }, select: { id: true, name: true } }) : [];
        const assignedNames = new Map(assignedUsers.map((assigned) => [assigned.id, assigned.name]));
        res.json(tickets.map((ticket) => ({ ...ticket, assignedName: ticket.assignedTo ? assignedNames.get(ticket.assignedTo) || null : null })));
    }
    catch (error) {
        console.error('PG maintenance list error:', error);
        res.status(500).json({ message: 'Failed to fetch maintenance tickets' });
    }
};
export const createMaintenanceTicket = async (req, res) => {
    const { propertyId, tenantId, title, description, category, priority, imageUrl, assignedTo } = req.body;
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
            if (!staffAccess)
                return res.status(400).json({ message: 'Assigned warden must have access to this property' });
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
    }
    catch (error) {
        console.error('PG maintenance creation error:', error);
        res.status(500).json({ message: 'Failed to create maintenance ticket' });
    }
};
export const updateMaintenanceStatus = async (req, res) => {
    const status = String(req.body.status || '').toUpperCase();
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
        return res.status(400).json({ message: 'Invalid maintenance status' });
    }
    try {
        const ticket = await db.pGMaintenanceTicket.findUnique({ where: { id: String(req.params.ticketId) } });
        if (!ticket)
            return res.status(404).json({ message: 'Maintenance ticket not found' });
        if (!await canManageProperty(req, ticket.propertyId)) {
            return res.status(403).json({ message: 'You do not have access to this property' });
        }
        const updated = await db.pGMaintenanceTicket.update({ where: { id: ticket.id }, data: { status } });
        res.json(updated);
    }
    catch (error) {
        console.error('PG maintenance status update error:', error);
        res.status(500).json({ message: 'Failed to update maintenance ticket' });
    }
};
//# sourceMappingURL=pg.controller.js.map