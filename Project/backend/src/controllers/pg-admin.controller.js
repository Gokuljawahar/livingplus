import bcrypt from 'bcryptjs';
import { prisma } from '../app.js';
import { createUniquePgSlug } from '../utils/pg-slug.js';
const db = new Proxy({}, {
    get: (_target, property) => prisma[property]
});
function isSuperAdmin(req) {
    return req.user?.role === 'SUPER_ADMIN';
}
export const listPgOperators = async (req, res) => {
    if (!isSuperAdmin(req))
        return res.status(403).json({ message: 'Super Admin access required' });
    try {
        const properties = await db.pGProperty.findMany({
            include: {
                access: {
                    where: { role: 'OWNER' },
                    include: { user: { select: { id: true, name: true, phone: true, email: true } } }
                },
                rooms: { include: { beds: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(properties.map(({ access, rooms, ...property }) => ({
            ...property,
            owner: access[0]?.user || null,
            rooms: rooms.map(({ beds, ...room }) => ({
                ...room,
                totalBeds: beds.length,
                occupiedBeds: beds.filter((bed) => bed.status === 'OCCUPIED').length
            }))
        })));
    }
    catch (error) {
        console.error('PG operator list error:', error);
        res.status(500).json({ message: 'Failed to fetch PG operators' });
    }
};
export const createPgOperator = async (req, res) => {
    if (!isSuperAdmin(req))
        return res.status(403).json({ message: 'Super Admin access required' });
    const { ownerName, propertyName, email, phone, password, address, locality, city, genderPolicy, amenities } = req.body;
    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    const finalPhone = normalizedPhone.length === 10 ? `91${normalizedPhone}` : normalizedPhone;
    if (!ownerName?.trim() || !propertyName?.trim() || !finalPhone || !password || !address?.trim() || !locality?.trim()) {
        return res.status(400).json({ message: 'Owner, PG name, phone, password, address and locality are required' });
    }
    try {
        const passwordHash = await bcrypt.hash(String(password), 10);
        const created = await db.$transaction(async (tx) => {
            const owner = await tx.user.create({
                data: {
                    name: ownerName.trim(),
                    email: email?.trim() || null,
                    phone: finalPhone,
                    password: passwordHash,
                    role: 'PG_OWNER'
                }
            });
            const property = await tx.pGProperty.create({
                data: {
                    slug: await createUniquePgSlug(tx, propertyName),
                    name: propertyName.trim(),
                    address: address.trim(),
                    locality: locality.trim(),
                    contactPhone: finalPhone,
                    city: city?.trim() || 'Chennai',
                    genderPolicy: ['MEN', 'WOMEN', 'ANY'].includes(genderPolicy) ? genderPolicy : 'ANY',
                    amenities: Array.isArray(amenities) ? amenities : [],
                    access: { create: { userId: owner.id, role: 'OWNER' } }
                }
            });
            return { owner, property };
        });
        res.status(201).json({ ...created.property, owner: { id: created.owner.id, name: created.owner.name, phone: created.owner.phone, email: created.owner.email } });
    }
    catch (error) {
        if (error?.code === 'P2002')
            return res.status(409).json({ message: 'An account with this phone or email already exists' });
        console.error('PG operator creation error:', error);
        res.status(500).json({ message: 'Failed to create PG operator' });
    }
};
export const deletePgOperatorProperty = async (req, res) => {
    if (!isSuperAdmin(req))
        return res.status(403).json({ message: 'Super Admin access required' });
    const propertyId = String(req.params.propertyId);
    try {
        const property = await db.pGProperty.findUnique({
            where: { id: propertyId },
            include: { access: { where: { role: 'OWNER' }, select: { userId: true } } }
        });
        if (!property)
            return res.status(404).json({ message: 'PG property not found' });
        const [activeTenant, openBooking] = await Promise.all([
            db.pGTenant.findFirst({ where: { propertyId, status: { in: ['ACTIVE', 'RESERVED'] } }, select: { id: true } }),
            db.pGBooking.findFirst({ where: { propertyId, status: { in: ['PENDING', 'APPROVED', 'CHECKED_IN'] } }, select: { id: true } })
        ]);
        if (activeTenant || openBooking)
            return res.status(409).json({ message: 'Resolve active tenants and bookings before deleting this property' });
        const ownerIds = property.access.map((access) => access.userId);
        await db.pGProperty.delete({ where: { id: propertyId } });
        for (const ownerId of ownerIds) {
            const otherAccess = await db.pGPropertyAccess.count({ where: { userId: ownerId } });
            if (!otherAccess)
                await db.user.deleteMany({ where: { id: ownerId, role: 'PG_OWNER' } });
        }
        res.json({ message: 'PG property deleted' });
    }
    catch (error) {
        console.error('PG operator deletion error:', error);
        res.status(500).json({ message: 'Failed to delete PG property' });
    }
};
//# sourceMappingURL=pg-admin.controller.js.map