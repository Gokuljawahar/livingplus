import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { getPublicCatalog, getPublicProperty, createOwnerLead } from '../src/controllers/pg/discovery-bookings.controller.js';
import {
  adminCreateRoom,
  adminDeleteRoom,
  adminUpdateProperty,
  conciergeOnboardProperty,
  listAdminCatalog,
  requirePlatformAdmin,
  updateAdminCatalog
} from '../src/controllers/admin.controller.js';
import { invalidatePlatformCatalogCache, provisionPlatformCatalog } from '../src/services/platform-catalog.js';
import { authenticate, optionalAuthenticate } from '../src/middleware/auth.middleware.js';
import { issueGuestToken } from '../src/utils/guest-token.js';
import { db, systemPrisma } from '../src/db/index.js';

process.env.JWT_SECRET = 'testsecret12345678901234567890123456';

function adminToken(role = 'PLATFORM_ADMIN', propertyId?: string) {
  return jwt.sign({ userId: 'admin-1', role, ...(propertyId ? { propertyId } : {}) }, process.env.JWT_SECRET!, { expiresIn: '1h' });
}

async function withServer(app: express.Express, run: (baseUrl: string) => Promise<void>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('marketplace detail, owner leads, and concierge onboarding APIs', () => {
  const originals: Record<string, any> = {};

  beforeEach(() => {
    originals.ownerLeadCreate = db.ownerLead.create;
    originals.pGPropertyFindFirst = db.pGProperty.findFirst;
    originals.pGPropertyFindUnique = db.pGProperty.findUnique;
    originals.pGPropertyCreate = db.pGProperty.create;
    originals.pGPropertyUpdate = db.pGProperty.update;
    originals.pGPropertyAccessFindFirst = db.pGPropertyAccess.findFirst;
    originals.pGBookingFindMany = db.pGBooking.findMany;
    originals.pGTenantFindMany = db.pGTenant.findMany;
    originals.userFindUnique = db.user.findUnique;
    originals.userFindFirst = db.user.findFirst;
    originals.userCreate = db.user.create;
    originals.pGRoomCreate = db.pGRoom.create;
    originals.pGRoomFindFirst = db.pGRoom.findFirst;
    originals.pGRoomDelete = db.pGRoom.delete;
    originals.pHAuditLogCreate = db.pHAuditLog.create;
    originals.transaction = systemPrisma.$transaction;
  });

  afterEach(() => {
    db.ownerLead.create = originals.ownerLeadCreate;
    db.pGProperty.findFirst = originals.pGPropertyFindFirst;
    db.pGProperty.findUnique = originals.pGPropertyFindUnique;
    db.pGProperty.create = originals.pGPropertyCreate;
    db.pGProperty.update = originals.pGPropertyUpdate;
    db.pGPropertyAccess.findFirst = originals.pGPropertyAccessFindFirst;
    db.pGBooking.findMany = originals.pGBookingFindMany;
    db.pGTenant.findMany = originals.pGTenantFindMany;
    db.user.findUnique = originals.userFindUnique;
    db.user.findFirst = originals.userFindFirst;
    db.user.create = originals.userCreate;
    db.pGRoom.create = originals.pGRoomCreate;
    db.pGRoom.findFirst = originals.pGRoomFindFirst;
    db.pGRoom.delete = originals.pGRoomDelete;
    db.pHAuditLog.create = originals.pHAuditLogCreate;
    (systemPrisma as any).$transaction = originals.transaction;
  });

  it('validates and creates an owner onboarding lead', async () => {
    let createdPayload: any = null;
    (db.ownerLead as any).create = async ({ data }: any) => {
      createdPayload = data;
      return { id: '12345678-aaaa-bbbb-cccc-1234567890ab', status: data.status };
    };

    const app = express();
    app.use(express.json());
    app.post('/api/pg/owner-leads', createOwnerLead);

    await withServer(app, async (base) => {
      const bad = await fetch(`${base}/api/pg/owner-leads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ownerName: 'Suresh', phone: '123', propertyName: 'GreenLeaf', locality: 'Velachery' })
      });
      assert.equal(bad.status, 400);

      const good = await fetch(`${base}/api/pg/owner-leads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ownerName: 'Suresh',
          phone: '9840012345',
          propertyName: 'GreenLeaf PG',
          locality: 'Velachery',
          propertyCount: 2,
          amenities: ['Wi-Fi', 'Meals']
        })
      });
      assert.equal(good.status, 201);
      const body = await good.json();
      assert.equal(body.reference, 'LEAD-12345678');
      assert.equal(createdPayload.phone, '919840012345');
      assert.equal(createdPayload.propertyCount, 2);
      assert.deepEqual(createdPayload.amenities, ['Wi-Fi', 'Meals']);
    });
  });

  it('masks managerPhone for anonymous callers and reveals it for verified guests on /properties/:slug', async () => {
    (db.pGBooking as any).findMany = async () => [];
    (db.pGProperty as any).findFirst = async () => ({
      id: 'pg-1',
      slug: 'palm-grove',
      name: 'Palm Grove',
      locality: 'Perungudi',
      city: 'Chennai',
      contactPhone: '9840011001',
      genderPolicy: 'WOMEN',
      amenities: ['Wi-Fi'],
      houseRules: [],
      photoUrls: [],
      rooms: [
        {
          id: 'r-1',
          roomNumber: '101',
          monthlyRent: 9800,
          beds: [
            { id: 'b-1', label: 'Bed 1', status: 'AVAILABLE' },
            { id: 'b-2', label: 'Bed 2', status: 'OCCUPIED' }
          ]
        }
      ]
    });
    (db.pGPropertyAccess as any).findFirst = async () => ({ user: { name: 'Demo Owner', phoneVerifiedAt: new Date() } });

    const app = express();
    app.get('/api/pg/properties/:slugOrId', optionalAuthenticate, getPublicProperty);

    await withServer(app, async (base) => {
      const anonRes = await fetch(`${base}/api/pg/properties/palm-grove`);
      assert.equal(anonRes.status, 200);
      const anonData = await anonRes.json();
      assert.equal(anonData.hasContactPhone, true);
      assert.equal(anonData.managerPhone, null);
      assert.equal(anonData.rooms[0].beds.length, 1);
      assert.equal(anonData.rooms[0].totalBeds, 2);
      assert.equal(anonData.rooms[0].occupiedBeds, 1);

      const guestRes = await fetch(`${base}/api/pg/properties/palm-grove`, {
        headers: { 'x-guest-token': issueGuestToken('9840099999') }
      });
      assert.equal(guestRes.status, 200);
      const guestData = await guestRes.json();
      assert.equal(guestData.managerPhone, '919840011001');
      assert.equal(guestData.ownerVerified, true);
    });
  });

  it('restricts /api/admin endpoints strictly to unscoped PLATFORM_ADMIN', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/admin/onboard', authenticate, requirePlatformAdmin, (_req, res) => res.json({ ok: true }));

    await withServer(app, async (base) => {
      const noAuth = await fetch(`${base}/api/admin/onboard`, { method: 'POST' });
      assert.equal(noAuth.status, 401);

      const ownerRes = await fetch(`${base}/api/admin/onboard`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken('PG_OWNER')}` }
      });
      assert.equal(ownerRes.status, 403);

      const superRes = await fetch(`${base}/api/admin/onboard`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken('SUPER_ADMIN')}` }
      });
      assert.equal(superRes.status, 403);

      const scopedAdminRes = await fetch(`${base}/api/admin/onboard`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken('PLATFORM_ADMIN', 'pg-1')}` }
      });
      assert.equal(scopedAdminRes.status, 403);

      const validAdminRes = await fetch(`${base}/api/admin/onboard`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken('PLATFORM_ADMIN')}` }
      });
      assert.equal(validAdminRes.status, 200);
    });
  });

  it('onboards a new owner, property, rooms, and marks the lead PUBLISHED atomically', async () => {
    let leadUpdated: any = null;
    let createdProp: any = null;
    let createdRooms: any[] = [];
    (db.pHAuditLog as any).create = async () => ({ id: 'audit-1' });
    (systemPrisma as any).$transaction = async (fn: any) => {
      const tx = {
        user: {
          findFirst: async () => null,
          findUnique: async () => null,
          create: async ({ data }: any) => ({ id: 'owner-new-1', ...data })
        },
        pGProperty: {
          findUnique: async () => null,
          create: async ({ data }: any) => {
            createdProp = { id: 'prop-new-1', ...data };
            return createdProp;
          }
        },
        pGRoom: {
          create: async ({ data }: any) => {
            const room = { id: `room-${createdRooms.length + 1}`, ...data, beds: data.beds.create };
            createdRooms.push(room);
            return room;
          }
        },
        ownerLead: {
          findUnique: async ({ where }: any) => ({ id: where.id }),
          update: async ({ data }: any) => {
            leadUpdated = data;
            return { id: 'lead-1', ...data };
          }
        }
      };
      return fn(tx);
    };

    const app = express();
    app.use(express.json());
    app.post('/api/admin/onboard', authenticate, requirePlatformAdmin, conciergeOnboardProperty);

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/admin/onboard`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken('PLATFORM_ADMIN')}`
        },
        body: JSON.stringify({
          leadId: 'lead-1',
          ownerName: 'Suresh',
          ownerPhone: '9840012345',
          ownerPassword: 'Owner@Pass1',
          property: {
            name: 'GreenLeaf Men PG',
            propertyType: 'PG',
            address: '45 Bypass Road',
            locality: 'Velachery',
            city: 'Chennai',
            genderPolicy: 'MEN',
            amenities: ['Wi-Fi', 'Meals'],
            status: 'ACTIVE'
          },
          rooms: [
            { roomNumber: '101', roomType: 'DOUBLE', monthlyRent: 8500, numberOfBeds: 2, hasAc: true }
          ]
        })
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.owner.created, true);
      assert.equal(createdProp.onboardedByAdmin, true);
      assert.equal(createdRooms.length, 1);
      assert.equal(createdRooms[0].beds.length, 2);
      assert.equal(leadUpdated.status, 'PUBLISHED');
      assert.equal(leadUpdated.onboardedPropertyId, 'prop-new-1');
    });
  });

  it('prevents deleting a room that still has occupied or reserved beds', async () => {
    (db.pGProperty as any).findUnique = async () => ({ id: 'pg-1' });
    (db.pGProperty as any).update = async ({ data }: any) => ({ id: 'pg-1', ...data, rooms: [] });
    (db.pGRoom as any).findFirst = async () => ({ id: 'room-1', beds: [{ status: 'OCCUPIED' }] });

    const app = express();
    app.use(express.json());
    app.patch('/api/admin/properties/:propertyId', authenticate, requirePlatformAdmin, adminUpdateProperty);
    app.post('/api/admin/properties/:propertyId/rooms', authenticate, requirePlatformAdmin, adminCreateRoom);
    app.delete('/api/admin/properties/:propertyId/rooms/:roomId', authenticate, requirePlatformAdmin, adminDeleteRoom);

    await withServer(app, async (base) => {
      const delRes = await fetch(`${base}/api/admin/properties/pg-1/rooms/room-1`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminToken('PLATFORM_ADMIN')}` }
      });
      assert.equal(delRes.status, 409);

      const patchRes = await fetch(`${base}/api/admin/properties/pg-1`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken('PLATFORM_ADMIN')}`
        },
        body: JSON.stringify({ featured: true, status: 'ACTIVE' })
      });
      assert.equal(patchRes.status, 200);
    });
  });

  it('provisions dynamic PlatformCatalog in DB, serves it publicly, and updates sections via admin API', async () => {
    const store = new Map<string, { key: string; description: string | null; data: any; updatedBy: string | null; updatedAt: Date }>();
    const origCatalog = (db as any).platformCatalog;
    (db as any).platformCatalog = {
      findMany: async () => [...store.values()],
      upsert: async ({ where, update, create }: any) => {
        const existing = store.get(where.key);
        const row = existing
          ? { ...existing, ...update, updatedAt: new Date() }
          : { key: create.key, description: create.description ?? null, data: create.data, updatedBy: create.updatedBy ?? null, updatedAt: new Date() };
        store.set(where.key, row);
        return row;
      }
    };
    invalidatePlatformCatalogCache();

    try {
      const inserted = await provisionPlatformCatalog(db);
      assert.ok(inserted >= 15);

      const app = express();
      app.use(express.json());
      app.get('/api/pg/catalog', getPublicCatalog);
      app.get('/api/admin/catalog', authenticate, requirePlatformAdmin, listAdminCatalog);
      app.put('/api/admin/catalog/:key', authenticate, requirePlatformAdmin, updateAdminCatalog);

      await withServer(app, async (base) => {
        const pubRes = await fetch(`${base}/api/pg/catalog`);
        assert.equal(pubRes.status, 200);
        const initialCatalog = await pubRes.json();
        assert.equal(initialCatalog.defaultCity, 'Chennai');
        assert.ok(Array.isArray(initialCatalog.amenityCategories));

        const updateRes = await fetch(`${base}/api/admin/catalog/defaultCity`, {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${adminToken('PLATFORM_ADMIN')}`
          },
          body: JSON.stringify({ data: 'Bengaluru' })
        });
        assert.equal(updateRes.status, 200);

        const refreshedRes = await fetch(`${base}/api/pg/catalog`);
        const refreshedCatalog = await refreshedRes.json();
        assert.equal(refreshedCatalog.defaultCity, 'Bengaluru');
      });
    } finally {
      (db as any).platformCatalog = origCatalog;
      invalidatePlatformCatalogCache();
    }
  });
});
