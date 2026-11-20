import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient() as any;

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
    where: { propertyId_roomNumber: { propertyId: demoProperties[0]!.id, roomNumber: '101' } }
  });
  const requestRoom = await prisma.pGRoom.findUnique({
    where: { propertyId_roomNumber: { propertyId: demoProperties[0]!.id, roomNumber: '102' } }
  });
  if (!occupiedRoom || !requestRoom) throw new Error('PG demo rooms were not created');

  const occupiedBed = await prisma.pGBed.findUnique({
    where: { roomId_label: { roomId: occupiedRoom.id, label: 'Bed 1' } }
  });
  const requestBed = await prisma.pGBed.findUnique({
    where: { roomId_label: { roomId: requestRoom.id, label: 'Bed 1' } }
  });
  if (!occupiedBed || !requestBed) throw new Error('PG demo beds were not created');

  const booking = await prisma.pGBooking.upsert({
    where: { id: 'pg-demo-booking-approved' },
    update: { bookingRef: 'PG-DEMO-APPROVED', status: 'APPROVED' },
    create: {
      id: 'pg-demo-booking-approved',
      bookingRef: 'PG-DEMO-APPROVED',
      propertyId: demoProperties[0]!.id,
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
      propertyId: demoProperties[0]!.id,
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
      propertyId: demoProperties[0]!.id,
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
      propertyId: demoProperties[0]!.id,
      bedId: occupiedBed.id,
      tenantId: tenant.id,
      title: 'Bathroom sink leak',
      description: 'Water is dripping beneath the sink; please inspect the pipe joint.',
      category: 'PLUMBING',
      priority: 'NORMAL',
      status: 'OPEN'
    }
  });

  await seedLivelyDemo(owner?.id ?? null);

  console.log(`Seeded ${demoProperties.length} PG demo properties${owner ? ' owned by the demo owner' : ' (set DEMO_OWNER_PHONE and DEMO_OWNER_PASSWORD to give them an owner)'}.`);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

/**
 * Residents with real-looking routines, meal orders and two weeks of activity,
 * so the kitchen forecast, PG pulse and VibeCheck have something to show.
 * Idempotent: fixed ids, upserts, and skip-duplicate inserts for the
 * append-only activity log.
 */
async function seedLivelyDemo(ownerId: string | null) {
  const harbour = 'pg-demo-thoraipakkam-men';
  const northstar = 'pg-demo-anna-nagar';
  await prisma.pGProperty.update({
    where: { id: harbour },
    data: { serviceSettings: { mealOrders: { enabled: true, prices: { BREAKFAST: 50, LUNCH: 90, DINNER: 80 } }, housekeeping: { enabled: true, price: 150 }, vibeCheck: true, kycAi: true } }
  });
  const room203 = await prisma.pGRoom.upsert({
    where: { propertyId_roomNumber: { propertyId: harbour, roomNumber: '203' } },
    update: { monthlyRent: 8000, foodIncluded: true, foodCharge: 1500, status: 'ACTIVE' },
    create: { propertyId: harbour, roomNumber: '203', floor: 2, roomType: 'SHARED', monthlyRent: 8000, foodIncluded: true, foodCharge: 1500 }
  });
  for (const label of ['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4']) {
    await prisma.pGBed.upsert({ where: { roomId_label: { roomId: room203.id, label } }, update: {}, create: { roomId: room203.id, label, status: 'AVAILABLE' } });
  }
  const bedIn = async (propertyId: string, roomNumber: string, label: string) => {
    const room = await prisma.pGRoom.findUnique({ where: { propertyId_roomNumber: { propertyId, roomNumber } } });
    return room ? prisma.pGBed.findUnique({ where: { roomId_label: { roomId: room.id, label } } }) : null;
  };
  // Habits: sleep, wake, tidiness, noise, guests, kitchen, schedule, cooling (0-2 each).
  const people = [
    { id: 'pg-demo-hp-arjun', name: 'Arjun Kumar', phone: '9000000101', pg: harbour, room: '203', bed: 'Bed 1', rent: 8000, optOut: false, vibe: { sleep: 0, wake: 0, tidiness: 1, noise: 0, guests: 0, kitchen: 0, schedule: 0, cooling: 1 } },
    { id: 'pg-demo-hp-karthik', name: 'Karthik S', phone: '9000000102', pg: harbour, room: '203', bed: 'Bed 2', rent: 8000, optOut: false, vibe: { sleep: 2, wake: 2, tidiness: 1, noise: 1, guests: 0, kitchen: 0, schedule: 2, cooling: 1 } },
    { id: 'pg-demo-hp-rahul', name: 'Rahul Menon', phone: '9000000103', pg: harbour, room: '203', bed: 'Bed 3', rent: 8000, optOut: false, vibe: { sleep: 2, wake: 2, tidiness: 2, noise: 2, guests: 1, kitchen: 1, schedule: 1, cooling: 0 } },
    { id: 'pg-demo-hp-vikram', name: 'Vikram Rao', phone: '9000000104', pg: harbour, room: '203', bed: 'Bed 4', rent: 8000, optOut: false, vibe: { sleep: 0, wake: 0, tidiness: 0, noise: 0, guests: 0, kitchen: 0, schedule: 0, cooling: 1 } },
    { id: 'pg-demo-hp-sanjay', name: 'Sanjay P', phone: '9000000105', pg: harbour, room: '201', bed: 'Bed 1', rent: 8800, optOut: false, vibe: { sleep: 1, wake: 1, tidiness: 1, noise: 1, guests: 1, kitchen: 0, schedule: 0, cooling: 1 } },
    { id: 'pg-demo-hp-imran', name: 'Imran Ali', phone: '9000000106', pg: harbour, room: '202', bed: 'Bed 1', rent: 7600, optOut: true, vibe: { sleep: 1, wake: 1, tidiness: 1, noise: 0, guests: 0, kitchen: 0, schedule: 1, cooling: 1 } },
    { id: 'pg-demo-ns-priya', name: 'Priya Nair', phone: '9000000107', pg: northstar, room: '402', bed: 'Bed 1', rent: 8200, optOut: false, vibe: { sleep: 0, wake: 0, tidiness: 0, noise: 0, guests: 0, kitchen: 2, schedule: 0, cooling: 1 } },
    { id: 'pg-demo-ns-dev', name: 'Dev Shah', phone: '9000000108', pg: northstar, room: '401', bed: 'Bed 2', rent: 9200, optOut: false, vibe: { sleep: 2, wake: 2, tidiness: 2, noise: 2, guests: 2, kitchen: 1, schedule: 2, cooling: 0 } }
  ];
  for (const person of people) {
    const bed = await bedIn(person.pg, person.room, person.bed);
    if (!bed) continue;
    await prisma.pGBed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } });
    const tenant = await prisma.pGTenant.upsert({
      where: { id: person.id },
      update: { bedId: bed.id, status: 'ACTIVE', vibeAnswers: person.vibe, foodOptOut: person.optOut },
      create: { id: person.id, propertyId: person.pg, bedId: bed.id, name: person.name, phone: person.phone, moveInDate: new Date(Date.now() - 40 * DAY_MS), monthlyRent: person.rent, status: 'ACTIVE', vibeAnswers: person.vibe, foodOptOut: person.optOut }
    });
    await prisma.pGRentEntry.upsert({
      where: { tenantId_period_entryType: { tenantId: tenant.id, period: '2026-11', entryType: 'RENT' } },
      update: {},
      create: { tenantId: tenant.id, period: '2026-11', entryType: 'RENT', amount: person.rent, paidAmount: person.rent, dueDate: new Date('2026-11-05T00:00:00.000Z'), status: 'PAID' }
    });
  }

  // Extra meal plates booked over the past four weeks and the coming week.
  const meals: { id: string; propertyId: string; tenantId: string; type: string; forDate: Date; slot: string; quantity: number; unitPrice: number; status: string }[] = [];
  for (let offset = -28; offset <= 7; offset += 1) {
    const day = isoDay(offset);
    const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
    if (offset % 3 === 0) meals.push({ id: `pg-demo-meal-${day}-dinner`, propertyId: harbour, tenantId: 'pg-demo-hp-rahul', type: 'MEAL', forDate: new Date(`${day}T00:00:00.000Z`), slot: 'DINNER', quantity: 1, unitPrice: 80, status: offset < 0 ? 'DONE' : 'REQUESTED' });
    if (weekday === 6) meals.push({ id: `pg-demo-meal-${day}-lunch`, propertyId: harbour, tenantId: 'pg-demo-hp-sanjay', type: 'MEAL', forDate: new Date(`${day}T00:00:00.000Z`), slot: 'LUNCH', quantity: 2, unitPrice: 90, status: offset < 0 ? 'DONE' : 'REQUESTED' });
  }
  meals.push({ id: `pg-demo-clean-${isoDay(1)}`, propertyId: harbour, tenantId: 'pg-demo-hp-vikram', type: 'HOUSEKEEPING', forDate: new Date(`${isoDay(1)}T00:00:00.000Z`), slot: 'MORNING', quantity: 1, unitPrice: 150, status: 'REQUESTED' });
  await prisma.pGServiceOrder.createMany({ data: meals, skipDuplicates: true });

  // A fixed issue, so "fixed in N hours" has a real number.
  const reported = new Date(Date.now() - 6 * DAY_MS);
  await prisma.pGMaintenanceTicket.upsert({
    where: { id: 'pg-demo-ticket-fan' },
    update: {},
    create: { id: 'pg-demo-ticket-fan', propertyId: harbour, tenantId: 'pg-demo-hp-karthik', title: 'Ceiling fan not working', description: 'The fan in room 203 stopped spinning.', category: 'ELECTRICAL', priority: 'HIGH', status: 'RESOLVED', createdAt: reported, updatedAt: new Date(reported.getTime() + 5 * 60 * 60 * 1000) }
  });

  // Two weeks of activity, including what the assistant did and who confirmed it.
  const at = (daysAgo: number, hour: number) => new Date(new Date(isoDay(-daysAgo) + 'T00:00:00.000Z').getTime() + (hour - 5.5) * 60 * 60 * 1000);
  const palm = 'pg-demo-perungudi-women';
  const activity = [
    { id: 'pg-demo-log-01', propertyId: harbour, actorId: ownerId, action: 'TENANT_CHECKED_IN', entityType: 'PGTenant', entityId: 'pg-demo-hp-arjun', detail: 'Arjun Kumar · Room 203, Bed 1', createdAt: at(10, 10) },
    { id: 'pg-demo-log-02', propertyId: harbour, actorId: ownerId, action: 'RENT_PAYMENT_RECORDED', entityType: 'PGRentEntry', entityId: null, detail: '₹8,800 · Sanjay P · UPI', createdAt: at(9, 18) },
    { id: 'pg-demo-log-03', propertyId: harbour, actorId: null, action: 'TICKET_CREATED_VIA_AI', entityType: 'PGMaintenanceTicket', entityId: 'pg-demo-ticket-fan', detail: 'Ceiling fan not working · Room 203 (reported with a photo)', createdAt: at(6, 9) },
    { id: 'pg-demo-log-04', propertyId: harbour, actorId: ownerId, action: 'TICKET_ASSIGNED_VIA_AI', entityType: 'PGMaintenanceTicket', entityId: 'pg-demo-ticket-fan', detail: 'Assigned to the warden · confirmed by the owner', createdAt: at(6, 9.5) },
    { id: 'pg-demo-log-05', propertyId: palm, actorId: ownerId, action: 'NOTICE_POSTED_VIA_AI', entityType: 'PGProperty', entityId: palm, detail: 'Water off Sunday 10 am to 1 pm for tank cleaning · confirmed by the owner', createdAt: at(5, 20) },
    { id: 'pg-demo-log-06', propertyId: palm, actorId: ownerId, action: 'RENT_REMINDER_SENT', entityType: 'PGRentEntry', entityId: null, detail: 'October rent · 1 resident', createdAt: at(4, 10) },
    { id: 'pg-demo-log-07', propertyId: harbour, actorId: ownerId, action: 'EXPENSE_CREATED', entityType: 'PGExpense', entityId: null, detail: 'Electrician · ₹600', createdAt: at(4, 16) },
    { id: 'pg-demo-log-08', propertyId: harbour, actorId: null, action: 'MEAL_PREFERENCE_SET', entityType: 'PGTenant', entityId: 'pg-demo-hp-imran', detail: 'Opted out of the meal plan', createdAt: at(3, 21) },
    { id: 'pg-demo-log-09', propertyId: palm, actorId: null, action: 'BOOKING_CREATED_VIA_AI', entityType: 'PGBooking', entityId: 'pg-demo-booking-pending', detail: 'Meera Iyer · Room 102, Bed 1 · after VibeCheck', createdAt: at(2, 19) },
    { id: 'pg-demo-log-10', propertyId: harbour, actorId: ownerId, action: 'RENT_PAYMENT_RECORDED', entityType: 'PGRentEntry', entityId: null, detail: '₹8,000 · Vikram Rao · UPI', createdAt: at(1, 11) },
    { id: 'pg-demo-log-11', propertyId: northstar, actorId: ownerId, action: 'TENANT_CHECKED_IN', entityType: 'PGTenant', entityId: 'pg-demo-ns-priya', detail: 'Priya Nair · Room 402, Bed 1', createdAt: at(1, 17) }
  ];
  await prisma.pHAuditLog.createMany({ data: activity, skipDuplicates: true });
}

main()
  .catch((error) => {
    console.error('PG demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });