import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
const demoProperties = [
    {
        id: 'pg-demo-perungudi-women',
        slug: 'palm-grove-womens-residence',
        name: 'Palm Grove Women\'s Residence',
        locality: 'Perungudi',
        latitude: 12.9653,
        longitude: 80.2461,
        address: '14, Lake View Road',
        genderPolicy: 'WOMEN',
        amenities: ['Wi-Fi', 'Meals', 'Laundry'],
        rooms: [{ number: '101', rent: 9800, foodIncluded: false, foodCharge: 0 }, { number: '102', rent: 8500, foodIncluded: false, foodCharge: 0 }]
    },
    {
        id: 'pg-demo-thoraipakkam-men',
        slug: 'harbour-point-mens-pg',
        name: 'Harbour Point Men\'s PG',
        locality: 'Sholinganallur',
        latitude: 12.901,
        longitude: 80.2279,
        address: '22, Rajiv Gandhi Salai',
        genderPolicy: 'MEN',
        amenities: ['Wi-Fi', 'Housekeeping', 'Parking'],
        rooms: [{ number: '201', rent: 8800, foodIncluded: true, foodCharge: 1500 }, { number: '202', rent: 7600, foodIncluded: true, foodCharge: 1500 }]
    },
    {
        id: 'pg-demo-guindy-coliving',
        slug: 'cedar-house-coliving',
        name: 'Cedar House Co-Living',
        locality: 'Thoraipakkam',
        latitude: 12.9416,
        longitude: 80.2362,
        address: '8, Rajiv Gandhi Salai',
        genderPolicy: 'ANY',
        amenities: ['Wi-Fi', 'Kitchen', 'Study area'],
        rooms: [{ number: '301', rent: 11200, foodIncluded: false, foodCharge: 0 }, { number: '302', rent: 10400, foodIncluded: false, foodCharge: 0 }]
    },
    {
        id: 'pg-demo-anna-nagar',
        slug: 'northstar-student-living',
        name: 'Northstar Student Living',
        locality: 'Velachery',
        latitude: 12.9815,
        longitude: 80.218,
        address: '31, 100 Feet Road',
        genderPolicy: 'ANY',
        amenities: ['Wi-Fi', 'Meals', 'Study area'],
        rooms: [{ number: '401', rent: 9200, foodIncluded: false, foodCharge: 0 }, { number: '402', rent: 8200, foodIncluded: false, foodCharge: 0 }]
    }
];
// Ananya's VibeCheck: early sleeper, tidy, quiet (so guests see real match reasons).
const DEMO_VIBE = { sleep: 0, wake: 0, tidiness: 0, noise: 0, guests: 0, kitchen: 1, schedule: 0, cooling: 1 };
async function main() {
    // Optional demo owner for the demo PGs (DEMO_OWNER_PHONE + DEMO_OWNER_PASSWORD).
    // There is no platform super admin: every PG belongs to its owner's workspace.
    const ownerPhone = String(process.env.DEMO_OWNER_PHONE || '').replace(/\D/g, '');
    const owner = ownerPhone && process.env.DEMO_OWNER_PASSWORD
        ? await prisma.user.upsert({
            where: { phone: ownerPhone },
            update: {},
            create: { phone: ownerPhone, name: 'Demo Owner', role: 'PG_OWNER', password: await bcrypt.hash(process.env.DEMO_OWNER_PASSWORD, 10) },
            select: { id: true }
        })
        : null;
    await prisma.pGProperty.updateMany({
        where: { id: { in: demoProperties.map((property) => property.id) } },
        data: { houseRules: [], photoUrls: [] }
    });
    for (const item of demoProperties) {
        await prisma.pGProperty.upsert({
            where: { id: item.id },
            update: {
                slug: item.slug,
                name: item.name,
                address: item.address,
                locality: item.locality,
                latitude: item.latitude,
                longitude: item.longitude,
                contactPhone: null,
                genderPolicy: item.genderPolicy,
                amenities: item.amenities,
                status: 'ACTIVE'
            },
            create: {
                id: item.id,
                slug: item.slug,
                name: item.name,
                address: item.address,
                locality: item.locality,
                latitude: item.latitude,
                longitude: item.longitude,
                contactPhone: null,
                city: 'Chennai',
                genderPolicy: item.genderPolicy,
                amenities: item.amenities,
                status: 'ACTIVE'
            }
        });
        if (owner) {
            await prisma.pGPropertyAccess.upsert({
                where: { propertyId_userId: { propertyId: item.id, userId: owner.id } },
                update: { role: 'OWNER' },
                create: { propertyId: item.id, userId: owner.id, role: 'OWNER' }
            });
        }
        for (const roomData of item.rooms) {
            const room = await prisma.pGRoom.upsert({
                where: { propertyId_roomNumber: { propertyId: item.id, roomNumber: roomData.number } },
                update: { monthlyRent: roomData.rent, foodIncluded: roomData.foodIncluded, foodCharge: roomData.foodCharge, status: 'ACTIVE' },
                create: {
                    propertyId: item.id,
                    roomNumber: roomData.number,
                    floor: Number(roomData.number[0]),
                    roomType: 'SHARED',
                    monthlyRent: roomData.rent,
                    foodIncluded: roomData.foodIncluded,
                    foodCharge: roomData.foodCharge
                }
            });
            for (const label of ['Bed 1', 'Bed 2']) {
                const isOccupiedDemoBed = item.id === demoProperties[0]?.id && roomData.number === '101' && label === 'Bed 1';
                await prisma.pGBed.upsert({
                    where: { roomId_label: { roomId: room.id, label } },
                    update: { status: isOccupiedDemoBed ? 'OCCUPIED' : 'AVAILABLE' },
                    create: { roomId: room.id, label, status: isOccupiedDemoBed ? 'OCCUPIED' : 'AVAILABLE' }
                });
            }
        }
    }
    const occupiedRoom = await prisma.pGRoom.findUnique({
        where: { propertyId_roomNumber: { propertyId: demoProperties[0].id, roomNumber: '101' } }
    });
    const requestRoom = await prisma.pGRoom.findUnique({
        where: { propertyId_roomNumber: { propertyId: demoProperties[0].id, roomNumber: '102' } }
    });
    if (!occupiedRoom || !requestRoom)
        throw new Error('PG demo rooms were not created');
    const occupiedBed = await prisma.pGBed.findUnique({
        where: { roomId_label: { roomId: occupiedRoom.id, label: 'Bed 1' } }
    });
    const requestBed = await prisma.pGBed.findUnique({
        where: { roomId_label: { roomId: requestRoom.id, label: 'Bed 1' } }
    });
    if (!occupiedBed || !requestBed)
        throw new Error('PG demo beds were not created');
    const booking = await prisma.pGBooking.upsert({
        where: { id: 'pg-demo-booking-approved' },
        update: { bookingRef: 'PG-DEMO-APPROVED', status: 'APPROVED' },
        create: {
            id: 'pg-demo-booking-approved',
            bookingRef: 'PG-DEMO-APPROVED',
            propertyId: demoProperties[0].id,
            bedId: occupiedBed.id,
            residentName: 'Ananya Rao',
            phone: '9000000001',
            moveInDate: new Date('2026-10-01T00:00:00.000Z'),
            status: 'APPROVED'
        }
    });
    const tenant = await prisma.pGTenant.upsert({
        where: { id: 'pg-demo-tenant-ananya' },
        update: { bookingId: booking.id, status: 'ACTIVE', vibeAnswers: DEMO_VIBE },
        create: {
            id: 'pg-demo-tenant-ananya',
            propertyId: demoProperties[0].id,
            bedId: occupiedBed.id,
            bookingId: booking.id,
            vibeAnswers: DEMO_VIBE,
            name: 'Ananya Rao',
            phone: '9000000001',
            moveInDate: new Date('2026-10-01T00:00:00.000Z'),
            monthlyRent: 9800,
            status: 'ACTIVE'
        }
    });
    await prisma.pGRentEntry.upsert({
        where: { tenantId_period_entryType: { tenantId: tenant.id, period: '2026-10', entryType: 'RENT' } },
        update: { amount: 9800, status: 'DUE' },
        create: {
            tenantId: tenant.id,
            period: '2026-10',
            entryType: 'RENT',
            amount: 9800,
            dueDate: new Date('2026-10-05T00:00:00.000Z'),
            status: 'DUE'
        }
    });
    await prisma.pGBooking.upsert({
        where: { id: 'pg-demo-booking-pending' },
        update: { bookingRef: 'PG-DEMO-PENDING', status: 'PENDING' },
        create: {
            id: 'pg-demo-booking-pending',
            bookingRef: 'PG-DEMO-PENDING',
            propertyId: demoProperties[0].id,
            bedId: requestBed.id,
            residentName: 'Meera Iyer',
            phone: '9000000002',
            moveInDate: new Date('2026-11-15T00:00:00.000Z'),
            status: 'PENDING'
        }
    });
    await prisma.pGBed.update({ where: { id: requestBed.id }, data: { status: 'RESERVED' } });
    await prisma.pGMaintenanceTicket.upsert({
        where: { id: 'pg-demo-ticket-leak' },
        update: { status: 'OPEN' },
        create: {
            id: 'pg-demo-ticket-leak',
            propertyId: demoProperties[0].id,
            bedId: occupiedBed.id,
            tenantId: tenant.id,
            title: 'Bathroom sink leak',
            description: 'Water is dripping beneath the sink; please inspect the pipe joint.',
            category: 'PLUMBING',
            priority: 'NORMAL',
            status: 'OPEN'
        }
    });
    console.log(`Seeded ${demoProperties.length} PG demo properties${owner ? ' owned by the demo owner' : ' (set DEMO_OWNER_PHONE and DEMO_OWNER_PASSWORD to give them an owner)'}.`);
}
main()
    .catch((error) => {
    console.error('PG demo seed failed:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed-pg.js.map