// Scenario suite for the PG OS agentic layer (project report §16).
// Runs against a throwaway PostgreSQL (or TEST_DATABASE_URL) with a scripted
// model stub, so no API key, model network access, or running server is required.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import type { LocalPostgres } from '../scripts/local-postgres.js';
import { inAppZone, periodOf } from '../src/utils/app-time.js';

const UPLOAD_TEST_DIR = path.resolve('./tests/tmp-local-uploads');
const PG_TEST_DIR = path.resolve(`./tests/.tmp-postgres-${process.pid}`);
let dbContext: typeof import('../src/db/context.js');
let testPostgres: LocalPostgres | null = null;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
// If this file ever exits non-zero with every test passing, say why in the log.
process.on('exit', (code) => {
  if (code !== 0) process.stderr.write(`[ai-scenarios] exit code ${code}; process.exitCode=${String(process.exitCode)}; active: ${process.getActiveResourcesInfo().join(',')}\n`);
});
process.env.LIVINGPLUS_ROOT_DOMAIN = 'livingplus.com';
process.env.ENABLE_AI_ORCHESTRATOR = 'true';
process.env.AI_MODEL = 'google:gemini-3.8-flash';
process.env.GOOGLE_API_KEY = 'test-key';
process.env.MODEL_API_TIMEOUT_MS = '5000';
process.env.JWT_SECRET = 'test-secret-for-pg-scenario-suite-32-bytes';
process.env.UPLOAD_STORAGE = 'local';
process.env.UPLOAD_DIR = UPLOAD_TEST_DIR;

let prisma: any;
let tools: any;
let orchestrator: any;
let providerMod: any;
let voice: any;
let reminders: any;
let ids: any = {};

const guestReq = () => ({ user: {}, ip: '127.0.0.1' }) as any;
const userReq = (user: any) => ({
  user: { userId: user.id, role: user.role, ...(user.role === 'PG_TENANT' ? { propertyId: ids.prop.id } : {}) },
  ...(user.role === 'PG_TENANT' ? { pgPropertyId: ids.prop.id } : {}),
  ip: '127.0.0.1'
}) as any;
const guestActor = { userId: null, role: 'GUEST', phones: [], propertyIds: [] };

// Scripted stand-in for the chat model: each generate() returns the next step.
function stubProvider(script: Array<{ text?: string; calls?: Array<{ name: string; args: any }> }>) {
  let i = 0;
  return {
    async generate() {
      const step = script[Math.min(i++, script.length - 1)]!;
      const calls = (step.calls ?? []).map((c, n) => ({ id: `call_${i}_${n}`, name: c.name, args: c.args }));
      return {
        text: step.text ?? '',
        content: { role: 'model', parts: [{ text: step.text ?? '' }, ...calls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } }))] },
        calls,
        invalid: []
      };
    }
  };
}

async function otpFor(phone: string, tag: string) {
  const normalized = phone.length === 10 ? `91${phone}` : phone;
  const token = `tok-${tag}-${Date.now()}`;
  await prisma.otpCode.create({
    data: {
      phone: normalized, purpose: 'BOOKING', codeHash: 'test', verifiedToken: token,
      tokenExpiresAt: new Date(Date.now() + 600000), expiresAt: new Date(Date.now() + 600000)
    }
  });
  return { phone, token };
}

before(async () => {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else {
    // Loaded only when needed: embedded-postgres installs process exit hooks.
    const { startLocalPostgres } = await import('../scripts/local-postgres.js');
    testPostgres = await startLocalPostgres({ dir: PG_TEST_DIR, port: await freePort(), database: 'livingplus_test', persistent: false });
    process.env.DATABASE_URL = testPostgres.url;
  }
  // Apply the real migrations, so the suite also proves they are complete.
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'reset', '--force', '--skip-generate', '--skip-seed'], { stdio: 'pipe' });
  ({ prisma } = await import('../src/app.js'));
  // Fixtures and direct service calls run outside any HTTP request: give them
  // system access. HTTP requests still run under Row-Level Security.
  dbContext = await import('../src/db/context.js');
  dbContext.setOutsideRequestScope('system');
  tools = await import('../src/services/ai-tools.js');
  orchestrator = await import('../src/services/ai-orchestrator.js');
  providerMod = await import('../src/services/ai-provider.js');
  voice = await import('../src/services/ai-voice.js');
  reminders = await import('../src/services/pg-rent-reminders.js');

  const owner = await prisma.user.create({ data: { phone: '9100000001', password: 'x', name: 'Spec Owner', role: 'PG_OWNER' } });
  const tenantUser = await prisma.user.create({ data: { phone: '9200000002', password: 'x', name: 'Spec Tenant', role: 'PG_TENANT' } });
  const outsider = await prisma.user.create({ data: { phone: '9300000003', password: 'x', name: 'Outsider', role: 'PG_OWNER' } });
  const prop = await prisma.pGProperty.create({
    data: {
      name: 'Spec House', address: '1, Test Road', locality: 'Sholinganallur', city: 'Chennai',
      genderPolicy: 'MEN', amenities: ['Wi-Fi', 'Meals'], houseRules: [], status: 'ACTIVE'
    }
  });
  const other = await prisma.pGProperty.create({
    data: {
      name: 'Other House', address: '2, Test Road', locality: 'Velachery', city: 'Chennai',
      genderPolicy: 'ANY', amenities: [], houseRules: [], status: 'ACTIVE'
    }
  });
  await prisma.pGPropertyAccess.create({ data: { propertyId: prop.id, userId: owner.id, role: 'OWNER' } });
  const roomA = await prisma.pGRoom.create({ data: { propertyId: prop.id, roomNumber: '101', roomType: 'SHARED', monthlyRent: 8000, foodIncluded: true, status: 'ACTIVE' } });
  const roomB = await prisma.pGRoom.create({ data: { propertyId: prop.id, roomNumber: '102', roomType: 'SHARED', monthlyRent: 7500, foodIncluded: true, status: 'ACTIVE' } });
  const bedFree1 = await prisma.pGBed.create({ data: { roomId: roomA.id, label: 'Bed 1', status: 'AVAILABLE' } });
  const bedFree2 = await prisma.pGBed.create({ data: { roomId: roomA.id, label: 'Bed 2', status: 'AVAILABLE' } });
  const bedFree3 = await prisma.pGBed.create({ data: { roomId: roomA.id, label: 'Bed 3', status: 'AVAILABLE' } });
  const bedOcc = await prisma.pGBed.create({ data: { roomId: roomB.id, label: 'Bed 1', status: 'OCCUPIED' } });
  const bedSpare = await prisma.pGBed.create({ data: { roomId: roomB.id, label: 'Bed 2', status: 'AVAILABLE' } });
  const otherRoom = await prisma.pGRoom.create({ data: { propertyId: other.id, roomNumber: '201', roomType: 'DOUBLE', monthlyRent: 6500, foodIncluded: false, status: 'ACTIVE' } });
  const otherBed = await prisma.pGBed.create({ data: { roomId: otherRoom.id, label: 'Bed 1', status: 'AVAILABLE' } });
  const tenant = await prisma.pGTenant.create({
    data: {
      propertyId: prop.id, bedId: bedOcc.id, name: 'Spec Tenant', phone: '9200000002',
      moveInDate: new Date('2026-10-01'), monthlyRent: 7500, status: 'ACTIVE'
    }
  });
  await prisma.pGRentEntry.create({ data: { tenantId: tenant.id, period: '2026-11', entryType: 'RENT', amount: 5000, paidAmount: 0, dueDate: new Date('2026-11-05'), status: 'DUE' } });
  await prisma.pGRentEntry.create({ data: { tenantId: tenant.id, period: '2026-10', entryType: 'RENT', amount: 3000, paidAmount: 1000, dueDate: new Date('2026-10-05'), status: 'PARTIAL' } });
  const ticket = await prisma.pGMaintenanceTicket.create({ data: { propertyId: prop.id, tenantId: tenant.id, title: 'Leak', description: 'Sink leak', category: 'PLUMBING', status: 'OPEN' } });
  const otherTicket = await prisma.pGMaintenanceTicket.create({ data: { propertyId: other.id, title: 'Other', description: 'x', category: 'OTHER', status: 'OPEN' } });
  ids = { owner, tenantUser, outsider, prop, other, roomA, roomB, bedFree1, bedFree2, bedFree3, bedOcc, bedSpare, otherRoom, otherBed, tenant, ticket, otherTicket };
});

after(async () => {
  await prisma?.$disconnect();
  await (await import('../src/services/ai-checkpointer.js')).closeCheckpointer();
  await testPostgres?.stop();
  fs.rmSync(PG_TEST_DIR, { recursive: true, force: true });
  fs.rmSync(UPLOAD_TEST_DIR, { recursive: true, force: true });
});

describe('discovery and availability (guest)', () => {
  it('finds the Sholinganallur MEN PG under budget with food', async () => {
    const res: any[] = await tools.toolCatalogue.search_properties.execute(
      guestActor, { location: 'Sholinganallur', budget_max: 9000, gender: 'MEN', food_included: true });
    assert.equal(res.length, 1);
    assert.equal(res[0].locality, 'Sholinganallur');
    assert.ok(res[0].rooms.every((r: any) => r.monthly_rent <= 9000 && r.available_beds.length > 0));
  });

  it('returns no properties when nothing fits the budget', async () => {
    const res: any[] = await tools.toolCatalogue.search_properties.execute(guestActor, { budget_max: 100 });
    assert.deepEqual(res, []);
  });

  it('rejects unknown property ids without leaking data', async () => {
    await assert.rejects(
      tools.toolCatalogue.get_property_details.execute(guestActor, { property_id: 'does-not-exist' }),
      /PROPERTY_NOT_FOUND/);
  });

  it('reports live bed states per room', async () => {
    const res: any[] = await tools.toolCatalogue.check_bed_availability.execute(guestActor, { property_id: ids.prop.id });
    const byRoom = Object.fromEntries(res.map((r: any) => [r.room_number, r]));
    assert.deepEqual(byRoom['101'].beds.map((b: any) => b.status), ['AVAILABLE', 'AVAILABLE', 'AVAILABLE']);
    assert.deepEqual(byRoom['102'].beds.map((b: any) => b.status), ['OCCUPIED', 'AVAILABLE']);
  });
});

describe('resident own-PG exclusion in AI search and booking', () => {
  it('hides the resident PG from AI search but keeps other PGs', async () => {
    const resident = await tools.actorFromRequest(userReq(ids.tenantUser));
    assert.equal(resident.propertyId, ids.prop.id);
    const res: any[] = await tools.toolCatalogue.search_properties.execute(resident, {});
    assert.ok(res.length > 0, 'other PGs stay visible to residents');
    assert.ok(res.every((p: any) => p.property_id !== ids.prop.id), 'own PG is hidden');
  });

  it('refuses an AI booking inside the resident PG and points at room change', async () => {
    const resident = await tools.actorFromRequest(userReq(ids.tenantUser));
    const before = await prisma.pGBooking.count();
    await assert.rejects(
      tools.toolCatalogue.create_booking_request.execute(resident, {
        bed_id: ids.bedFree1.id, move_in_date: '2026-12-10',
        resident_name: 'Spec Tenant', phone: '9200000002', phone_token: 'unused'
      }),
      /room change/i);
    assert.equal(await prisma.pGBooking.count(), before);
  });

  it('still lets the same resident book a bed at another PG', async () => {
    const resident = await tools.actorFromRequest(userReq(ids.tenantUser));
    const { phone, token } = await otpFor('9400000011', 'tenant-other');
    const res: any = await tools.toolCatalogue.create_booking_request.execute(resident, {
      bed_id: ids.otherBed.id, move_in_date: '2026-12-11',
      resident_name: 'Spec Tenant', phone, phone_token: token
    });
    assert.ok(/^PG-/.test(res.booking_ref));
  });
});

describe('staff property resolution in AI tools', () => {
  it('accepts a property name for dues and reminders inside the caller scope', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: ['9100000001'], propertyIds: [ids.prop.id] };
    const dues: any = await tools.toolCatalogue.get_pending_rent.execute(actor, { property_id: 'Spec House' });
    assert.equal(dues.outstanding_total, 7000);
    assert.equal(dues.entries_due, 2);
    const reminders: any = await tools.toolCatalogue.send_rent_reminders.execute(actor, { property_id: 'Spec House', period: '2026-11' });
    assert.equal(reminders.total, 1);
    assert.equal(reminders.sent, 0);
  });

  it('still refuses properties outside the caller scope without leaking data', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id] };
    await assert.rejects(
      tools.toolCatalogue.send_rent_reminders.execute(actor, { property_id: 'Other House' }),
      /FORBIDDEN/);
    await assert.rejects(
      tools.toolCatalogue.get_pending_rent.execute(actor, { property_id: 'No Such House' }),
      /FORBIDDEN/);
  });
});

describe('resident maintenance requests', () => {
  it('updates property forms with blank or numeric coordinates', async () => {
    const { updateProperty } = await import('../src/controllers/pg.controller.js');
    const response = {
      statusCode: 200, body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; }
    };
    const request = { ...userReq(ids.owner), params: { propertyId: ids.prop.id }, body: { latitude: '', longitude: '' } } as any;
    await updateProperty(request, response as any);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.latitude, null);
    request.body = { latitude: '13.01', longitude: '80.22' };
    await updateProperty(request, response as any);
    assert.equal(response.body.latitude, 13.01);
    assert.equal(response.body.longitude, 80.22);
    request.body = { latitude: '91' };
    await updateProperty(request, response as any);
    assert.equal(response.statusCode, 400);
  });

  it('creates and lists only tickets for the resident stay on the current PG', async () => {
    const { createTenantTicket, listTenantTickets, listOwnerTickets } = await import('../src/controllers/pg.controller.js');
    const request = {
      user: { userId: ids.tenantUser.id, role: 'PG_TENANT', propertyId: ids.prop.id },
      pgPropertyId: ids.prop.id,
      body: { tenantId: ids.tenant.id, title: 'Bathroom tap leaking', description: 'Water is dripping under the sink.', category: 'PLUMBING', priority: 'URGENT', propertyId: ids.other.id }
    } as any;
    const response = {
      statusCode: 200,
      body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; }
    };

    await createTenantTicket(request, response as any);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.propertyId, ids.prop.id);
    assert.equal(response.body.tenantId, ids.tenant.id);
    assert.equal(response.body.bedId, ids.tenant.bedId);
    assert.equal(response.body.status, 'OPEN');
    assert.equal(response.body.priority, 'NORMAL');
    const createdTicketId = response.body.id;

    await listTenantTickets(request, response as any);
    assert.ok(response.body.some((ticket: any) => ticket.id === createdTicketId));
    assert.ok(response.body.every((ticket: any) => ticket.propertyId === ids.prop.id && ticket.tenantId === ids.tenant.id));

    const ownerRequest = {
      user: { userId: ids.owner.id, role: 'PG_OWNER', propertyId: ids.prop.id },
      pgPropertyId: ids.prop.id
    } as any;
    await listOwnerTickets(ownerRequest, response as any);
    assert.ok(response.body.some((ticket: any) => ticket.id === createdTicketId));
  });

  it('rejects another resident stay and a different PG host', async () => {
    const { createTenantTicket } = await import('../src/controllers/pg.controller.js');
    const otherTenant = await prisma.pGTenant.create({
      data: { propertyId: ids.other.id, name: 'Other Resident', phone: '9400000004', moveInDate: new Date('2026-10-01'), monthlyRent: 5000, status: 'ACTIVE' }
    });
    const response = {
      statusCode: 200,
      body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; }
    };
    const request = {
      user: { userId: ids.tenantUser.id, role: 'PG_TENANT', propertyId: ids.prop.id },
      pgPropertyId: ids.prop.id,
      body: { tenantId: otherTenant.id, title: 'Private issue', description: 'Should not be accepted.' }
    } as any;

    await createTenantTicket(request, response as any);
    assert.equal(response.statusCode, 404);

    request.pgPropertyId = ids.other.id;
    await createTenantTicket(request, response as any);
    assert.equal(response.statusCode, 403);
  });

  it('does not replay a resident ticket confirmation on another PG host', async () => {
    const title = 'Cross-host resident confirmation';
    const prepared = await orchestrator.runChat(userReq(ids.tenantUser), stubProvider([
      { calls: [{ name: 'create_maintenance_ticket', args: { title, description: 'Private resident issue', category: 'OTHER' } }] }
    ]), { message: 'File a maintenance request' });
    assert.ok(prepared.needsConfirmation);

    const wrongHostRequest = {
      ...userReq(ids.tenantUser),
      pgPropertyId: ids.other.id,
      user: { userId: ids.tenantUser.id, role: 'PG_TENANT', propertyId: ids.other.id }
    } as any;
    const result = await orchestrator.runChat(wrongHostRequest, stubProvider([]), {
      message: 'confirm', sessionId: prepared.sessionId, confirmationId: prepared.needsConfirmation.confirmationId
    });
    assert.match(result.reply, /expired/i);
    assert.equal(await prisma.pGMaintenanceTicket.count({ where: { title } }), 0);
  });
});

describe('resident profile, payments, and notifications', () => {
  const createResponse = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; }
  });

  it('lets residents update only their own profile and resets KYC verification for new documents', async () => {
    const { updateResidentProfile } = await import('../src/controllers/pg.controller.js');
    const request = {
      user: { userId: ids.tenantUser.id, role: 'PG_TENANT', propertyId: ids.prop.id },
      pgPropertyId: ids.prop.id,
      params: { tenantId: ids.tenant.id },
      body: { permanentAddress: 'Updated address', emergencyName: 'Emergency Contact', kycVerified: true, status: 'CHECKED_OUT' }
    } as any;
    const response = createResponse();

    await updateResidentProfile(request, response as any);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.permanentAddress, 'Updated address');
    assert.equal(response.body.status, 'ACTIVE');
    assert.equal(response.body.kycVerified, false);

    request.body = { kycDocumentUrl: 'local/not-a-valid-document.pdf' };
    await updateResidentProfile(request, response as any);
    assert.equal(response.statusCode, 400);
  });

  it('requires owner confirmation before crediting a resident UPI claim and notifies the resident', async () => {
    const { createResidentPaymentClaim, listOwnerPaymentClaims, reviewPaymentClaim, listResidentNotifications, markResidentNotificationRead } = await import('../src/controllers/pg.controller.js');
    let paymentOwner: any;
    let paymentResident: any;
    let paymentProperty: any;
    try {
      paymentOwner = await prisma.user.create({ data: { phone: '9912345677', password: 'x', name: 'Payment Owner', role: 'PG_OWNER' } });
      paymentResident = await prisma.user.create({ data: { phone: '9912345678', password: 'x', name: 'Payment Resident', role: 'PG_TENANT' } });
      paymentProperty = await prisma.pGProperty.create({ data: { name: 'Payment Test House', address: '1 Payment Road', locality: 'Test', upiId: 'spec-house@upi' } });
      await prisma.pGPropertyAccess.create({ data: { propertyId: paymentProperty.id, userId: paymentOwner.id, role: 'OWNER' } });
      const tenant = await prisma.pGTenant.create({ data: { propertyId: paymentProperty.id, name: 'Payment Resident', phone: paymentResident.phone, moveInDate: new Date('2026-10-01'), monthlyRent: 8000, status: 'ACTIVE' } });
      const entry = await prisma.pGRentEntry.create({ data: { tenantId: tenant.id, period: '2026-11', entryType: 'RENT', amount: 8000, dueDate: new Date('2026-11-05'), status: 'DUE' } });
      const residentRequest = {
        user: { userId: paymentResident.id, role: 'PG_TENANT', propertyId: paymentProperty.id },
        pgPropertyId: paymentProperty.id,
        body: { tenantId: tenant.id, rentEntryId: entry.id, amount: 125, reference: 'UPIREF125001' }
      } as any;
      let response = createResponse();

      await createResidentPaymentClaim(residentRequest, response as any);

      assert.equal(response.statusCode, 201);
      assert.equal(response.body.upiId, 'spec-house@upi');
      const claimId = response.body.id;
      assert.equal((await prisma.pGRentEntry.findUnique({ where: { id: entry.id } })).paidAmount, 0);

      const ownerRequest = {
        user: { userId: paymentOwner.id, role: 'PG_OWNER', propertyId: paymentProperty.id },
        pgPropertyId: paymentProperty.id
      } as any;
      response = createResponse();
      await listOwnerPaymentClaims(ownerRequest, response as any);
      assert.ok(response.body.some((claim: any) => claim.id === claimId));

      ownerRequest.params = { claimId };
      ownerRequest.body = { status: 'APPROVED' };
      response = createResponse();
      await reviewPaymentClaim(ownerRequest, response as any);
      assert.equal(response.statusCode, 200);
      assert.equal((await prisma.pGRentEntry.findUnique({ where: { id: entry.id } })).paidAmount, 125);

      response = createResponse();
      await listResidentNotifications(residentRequest, response as any);
      assert.equal(response.body.unreadCount, 1);
      assert.equal(response.body.notifications[0].type, 'PAYMENT_CLAIM');

      const notificationId = response.body.notifications[0].id;
      residentRequest.params = { notificationId };
      response = createResponse();
      await markResidentNotificationRead(residentRequest, response as any);
      assert.equal(response.statusCode, 200);
      response = createResponse();
      await listResidentNotifications(residentRequest, response as any);
      assert.equal(response.body.unreadCount, 0);
    } finally {
      if (paymentProperty) await prisma.pGProperty.deleteMany({ where: { id: paymentProperty.id } });
      if (paymentOwner) await prisma.user.deleteMany({ where: { id: paymentOwner.id } });
      if (paymentResident) await prisma.user.deleteMany({ where: { id: paymentResident.id } });
    }
  });

  it('notifies a resident when the owner changes a complaint status', async () => {
    const { updateMaintenanceStatus, listResidentNotifications } = await import('../src/controllers/pg.controller.js');
    const ownerRequest = {
      user: { userId: ids.owner.id, role: 'PG_OWNER', propertyId: ids.prop.id },
      pgPropertyId: ids.prop.id,
      params: { ticketId: ids.ticket.id },
      body: { status: 'IN_PROGRESS' }
    } as any;
    const response = createResponse();

    await updateMaintenanceStatus(ownerRequest, response as any);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'IN_PROGRESS');
    const residentRequest = {
      user: { userId: ids.tenantUser.id, role: 'PG_TENANT', propertyId: ids.prop.id },
      pgPropertyId: ids.prop.id
    } as any;
    await listResidentNotifications(residentRequest, response as any);
    assert.ok(response.body.notifications.some((notification: any) => notification.type === 'MAINTENANCE_STATUS' && notification.entityId === ids.ticket.id));
  });
});

describe('booking through the AI assistant (guest)', () => {
  it('pauses a booking tool call for explicit confirmation', async () => {
    const { phone, token } = await otpFor('9400000004', 'confirm');
    const provider = stubProvider([{ calls: [{ name: 'create_booking_request', args: { bed_id: ids.bedFree1.id, move_in_date: '2026-12-01', resident_name: 'Confirm Guest', phone, phone_token: token } }] }]);
    const result = await orchestrator.runChat(guestReq(), provider, { message: 'book bed 1 from Dec 1' });
    assert.ok(result.needsConfirmation);
    assert.equal(result.needsConfirmation.tool, 'create_booking_request');
    assert.match(result.needsConfirmation.preview, /PENDING/i);
  });

  it('creates one PENDING booking on confirmation and reserves the bed', async () => {
    const { phone, token } = await otpFor('9400000005', 'create');
    const provider = stubProvider([{ calls: [{ name: 'create_booking_request', args: { bed_id: ids.bedFree1.id, move_in_date: '2026-12-01', resident_name: 'Create Guest', phone, phone_token: token } }] }]);
    const prepared = await orchestrator.runChat(guestReq(), provider, { message: 'book it' });
    const done = await orchestrator.runChat(guestReq(), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(done.reply, /^Done\./);
    const booking = await prisma.pGBooking.findFirst({ where: { bedId: ids.bedFree1.id } });
    assert.ok(booking && /^PG-/.test(booking.bookingRef) && booking.status === 'PENDING');
    const bed = await prisma.pGBed.findUnique({ where: { id: ids.bedFree1.id } });
    assert.equal(bed.status, 'RESERVED');
  });

  it('treats a repeated confirmation as expired, creating nothing', async () => {
    const { phone, token } = await otpFor('9400000006', 'replay');
    const provider = stubProvider([{ calls: [{ name: 'create_booking_request', args: { bed_id: ids.bedFree3.id, move_in_date: '2026-12-02', resident_name: 'Replay Guest', phone, phone_token: token } }] }]);
    const prepared = await orchestrator.runChat(guestReq(), provider, { message: 'book it' });
    const first = await orchestrator.runChat(guestReq(), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(first.reply, /^Done\./);
    const second = await orchestrator.runChat(guestReq(), stubProvider([]), { message: 'yes again', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(second.reply, /expired/i);
    const count = await prisma.pGBooking.count({ where: { bedId: ids.bedFree3.id } });
    assert.equal(count, 1);
  });

  it('collapses retries with the same idempotency key into one booking', async () => {
    const { phone, token } = await otpFor('9400000007', 'idem');
    const args = { bed_id: ids.bedFree2.id, move_in_date: '2026-12-03', resident_name: 'Idem Guest', phone, phone_token: token, idempotency_key: 'idem-test-key-1' };
    const first: any = await tools.toolCatalogue.create_booking_request.execute(guestActor, { ...args });
    const second: any = await tools.toolCatalogue.create_booking_request.execute(guestActor, { ...args });
    assert.equal(first.booking_ref, second.booking_ref);
    assert.equal(second.deduped, true);
    assert.equal(await prisma.pGBooking.count({ where: { idempotencyKey: 'idem-test-key-1' } }), 1);
  });

  it('lets only one resident win a contested bed', async () => {
    const a = await otpFor('9400000008', 'race-a');
    const b = await otpFor('9400000009', 'race-b');
    const base = { bed_id: ids.bedSpare.id, move_in_date: '2026-12-04', resident_name: 'Racer' };
    await tools.toolCatalogue.create_booking_request.execute(guestActor, { ...base, phone: a.phone, phone_token: a.token });
    await assert.rejects(
      tools.toolCatalogue.create_booking_request.execute(guestActor, { ...base, phone: b.phone, phone_token: b.token }),
      /BED_UNAVAILABLE/);
  });

  it('refuses booking without phone verification and changes nothing', async () => {
    await assert.rejects(
      tools.toolCatalogue.create_booking_request.execute(guestActor, {
        bed_id: ids.bedFree3.id, move_in_date: '2026-12-05',
        resident_name: 'Unverified', phone: '9400000010', phone_token: 'wrong-token'
      }),
      /PHONE_NOT_VERIFIED/);
  });

  it('reads back status only for the matching phone', async () => {
    const booking = await prisma.pGBooking.findFirst({ where: { bedId: ids.bedFree1.id } });
    const ok: any = await tools.toolCatalogue.get_booking_status.execute(
      guestActor, { booking_ref: booking.bookingRef, phone: booking.phone });
    assert.equal(ok.status, 'PENDING');
    await assert.rejects(
      tools.toolCatalogue.get_booking_status.execute(guestActor, { booking_ref: booking.bookingRef, phone: '9400000099' }),
      /BOOKING_NOT_FOUND/);
    await assert.rejects(
      tools.toolCatalogue.get_booking_status.execute(guestActor, { booking_ref: 'PG-NOPE', phone: booking.phone }),
      /BOOKING_NOT_FOUND/);
  });
});

describe('authorization and owner insights', () => {
  it('exposes only the tools authorized for each persona', async () => {
    const guestNames = tools.toolDefinitionsFor('GUEST').map((t: any) => t.name);
    const residentNames = tools.toolDefinitionsFor('PG_TENANT').map((t: any) => t.name);
    const ownerNames = tools.toolDefinitionsFor('PG_OWNER').map((t: any) => t.name);
    const wardenNames = tools.toolDefinitionsFor('PG_WARDEN').map((t: any) => t.name);
    for (const open of ['search_properties', 'get_property_details', 'check_bed_availability', 'get_booking_status', 'create_booking_request']) {
      assert.ok(guestNames.includes(open), `guest should see ${open}`);
    }
    for (const closed of ['get_pending_rent', 'get_occupancy_report', 'update_maintenance_status', 'send_notification']) {
      assert.ok(!guestNames.includes(closed), `guest must not see ${closed}`);
    }
    assert.ok(!guestNames.includes('create_maintenance_ticket'));
    for (const residentTool of ['get_my_stay', 'get_my_maintenance_requests', 'create_maintenance_ticket', 'set_meal_preference']) assert.ok(residentNames.includes(residentTool));
    for (const ownerOnly of ['get_pending_rent', 'get_occupancy_report', 'log_expense', 'send_rent_reminders']) assert.ok(!residentNames.includes(ownerOnly));
    assert.ok(!ownerNames.includes('create_booking_request'));
    assert.ok(!ownerNames.includes('set_meal_preference'));
    assert.ok(!wardenNames.includes('create_booking_request'));
    assert.ok(!wardenNames.includes('set_meal_preference'));
    if (process.env.ENABLE_WHATSAPP_CLOUD_API !== 'true' || !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
      assert.ok(!ownerNames.includes('send_notification'));
      assert.ok(!residentNames.includes('send_notification'));
    }
  });

  it('binds resident AI context to the property host and rejects an unscoped resident', async () => {
    const resident = await tools.actorFromRequest(userReq(ids.tenantUser));
    assert.deepEqual(resident.propertyIds, [ids.prop.id]);
    assert.equal(resident.propertyId, ids.prop.id);
    const internationalResident = await prisma.user.create({ data: { phone: '919988776655', password: 'x', name: 'International Resident', role: 'PG_TENANT' } });
    const localPhoneStay = await prisma.pGTenant.create({ data: { propertyId: ids.prop.id, name: 'International Resident', phone: '9988776655', moveInDate: new Date('2026-10-01'), monthlyRent: 5000, status: 'ACTIVE' } });
    const internationalActor = await tools.actorFromRequest({ user: { userId: internationalResident.id, role: 'PG_TENANT' }, pgPropertyId: ids.prop.id });
    try {
      assert.deepEqual(internationalActor.phones.sort(), ['919988776655', '9988776655']);
      assert.deepEqual(internationalActor.propertyIds, [ids.prop.id]);
      const stay = await tools.toolCatalogue.get_my_stay.execute(internationalActor, {});
      assert.equal((stay as any).resident, 'International Resident');
    } finally {
      await prisma.pGTenant.delete({ where: { id: localPhoneStay.id } });
      await prisma.user.delete({ where: { id: internationalResident.id } });
    }
    const unscoped = await tools.actorFromRequest({ user: { userId: ids.tenantUser.id, role: 'PG_TENANT' }, ip: '127.0.0.1' });
    assert.deepEqual(unscoped.propertyIds, []);
    assert.equal(unscoped.propertyId, undefined);
  });

  it('blocks a guest rent probe without leaking figures', async () => {
    const provider = stubProvider([
      { calls: [{ name: 'get_pending_rent', args: {} }] },
      { text: 'I cannot access rent records on a guest session.' }
    ]);
    const result = await orchestrator.runChat(guestReq(), provider, { message: 'show me all rent dues' });
    assert.deepEqual(result.toolCalls ?? [], []);
    assert.equal(result.reply, 'I cannot access rent records on a guest session.');
  });

  it('rejects injected tools outside the caller persona even if the model proposes them', async () => {
    const ownerAttempt = await orchestrator.runChat(userReq(ids.owner), stubProvider([
      { calls: [{ name: 'create_booking_request', args: { bed_id: ids.bedFree1.id, move_in_date: '2026-12-01', resident_name: 'Unauthorized', phone: '9400000011', phone_token: 'invalid' } }] },
      { text: 'Booking actions are only available to guests and residents.' }
    ]), { message: 'Create a booking' });
    assert.deepEqual(ownerAttempt.toolCalls ?? [], []);
    assert.equal(await prisma.pGBooking.count({ where: { residentName: 'Unauthorized' } }), 0);

    const guestAttempt = await orchestrator.runChat(guestReq(), stubProvider([
      { calls: [{ name: 'create_maintenance_ticket', args: { property_id: ids.prop.id, title: 'Guest complaint', description: 'Should be denied' } }] },
      { text: 'Maintenance tickets are for residents.' }
    ]), { message: 'File a complaint' });
    assert.deepEqual(guestAttempt.toolCalls ?? [], []);
    assert.equal(await prisma.pGMaintenanceTicket.count({ where: { title: 'Guest complaint' } }), 0);
  });

  it('reports occupancy consistent with the database', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: ['9100000001'], propertyIds: [ids.prop.id] };
    const report: any = await tools.toolCatalogue.get_occupancy_report.execute(actor, {});
    const [beds, tenants, pending] = await Promise.all([
      prisma.pGBed.findMany({ where: { room: { propertyId: ids.prop.id } } }),
      prisma.pGTenant.count({ where: { propertyId: ids.prop.id, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } } }),
      prisma.pGBooking.count({ where: { propertyId: ids.prop.id, status: 'PENDING' } })
    ]);
    assert.equal(report.total_beds, beds.length);
    assert.equal(report.occupied_beds, tenants);
    assert.equal(report.available_beds, beds.filter((b: any) => b.status === 'AVAILABLE').length);
    assert.equal(report.pending_bookings, pending);
  });

  it('blocks owners from reading property details or beds outside their access', async () => {
    const actor = await tools.actorFromRequest(userReq(ids.owner));
    await assert.rejects(
      tools.toolCatalogue.get_property_details.execute(actor, { property_id: ids.other.id }),
      /FORBIDDEN/
    );
    await assert.rejects(
      tools.toolCatalogue.check_bed_availability.execute(actor, { property_id: ids.other.id }),
      /FORBIDDEN/
    );
  });

  it('refuses occupancy outside the caller property scope', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id] };
    await assert.rejects(
      tools.toolCatalogue.get_occupancy_report.execute(actor, { property_id: ids.other.id }),
      /FORBIDDEN/);
  });

  it('totals outstanding rent for permitted properties', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id] };
    const report: any = await tools.toolCatalogue.get_pending_rent.execute(actor, {});
    assert.equal(report.outstanding_total, 7000);
    assert.equal(report.entries_due, 2);
  });

  it('audits staff ticket updates', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id] };
    const updated: any = await tools.toolCatalogue.update_maintenance_status.execute(actor, { ticket_id: ids.ticket.id, status: 'IN_PROGRESS' });
    assert.equal(updated.status, 'IN_PROGRESS');
    await new Promise((r) => setTimeout(r, 300));
    const audit = await prisma.pHAuditLog.findFirst({ where: { entityId: ids.ticket.id, action: 'TICKET_STATUS_VIA_AI' } });
    assert.ok(audit);
  });

  it('refuses ticket updates outside the caller scope', async () => {
    const actor = { userId: ids.outsider.id, role: 'PG_OWNER', phones: [], propertyIds: [] };
    await assert.rejects(
      tools.toolCatalogue.update_maintenance_status.execute(actor, { ticket_id: ids.ticket.id, status: 'CLOSED' }),
      /FORBIDDEN/);
    const ownerActor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id] };
    await assert.rejects(
      tools.toolCatalogue.update_maintenance_status.execute(ownerActor, { ticket_id: ids.otherTicket.id, status: 'CLOSED' }),
      /FORBIDDEN/);
  });
});

describe('maintenance and messaging tools', () => {
  it('files a resident ticket after confirmation', async () => {
    const provider = stubProvider([{ calls: [{ name: 'create_maintenance_ticket', args: { property_id: ids.prop.id, title: 'Tap leak', description: 'Kitchen tap drips all night', category: 'plumbing' } }] }]);
    const prepared = await orchestrator.runChat(userReq(ids.tenantUser), provider, { message: 'my tap leaks' });
    assert.ok(prepared.needsConfirmation);
    const done = await orchestrator.runChat(userReq(ids.tenantUser), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(done.reply, /^Done\./);
    const ticket = await prisma.pGMaintenanceTicket.findFirst({ where: { title: 'Tap leak' } });
    assert.ok(ticket && ticket.status === 'OPEN' && ticket.category === 'PLUMBING');
  });

  it('skips notifications while the channel is disabled', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id] };
    const res: any = await tools.toolCatalogue.send_notification.execute(actor, { recipient_phone: '9400000001', template: 'rent_due' });
    assert.deepEqual(res, { sent: false, skipped: 'channel-disabled' });
  });
});

describe('orchestrator behaviour', () => {
  it('cancels a pending action and prevents confirmation replay', async () => {
    const prepared = await orchestrator.runChat(userReq(ids.owner), stubProvider([
      { calls: [{ name: 'log_expense', args: { property_id: ids.prop.id, category: 'MAINTENANCE', amount: 123, spent_on: '2026-11-02', note: 'cancel test' } }] }
    ]), { message: 'prepare an expense' });
    assert.ok(prepared.needsConfirmation);

    const cancelled = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), {
      message: '', sessionId: prepared.sessionId, cancelConfirmationId: prepared.needsConfirmation.confirmationId
    });
    assert.match(cancelled.reply, /Canceled/);
    assert.equal(await prisma.pGExpense.count({ where: { propertyId: ids.prop.id, note: 'cancel test' } }), 0);

    const replay = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), {
      message: 'yes', sessionId: prepared.sessionId, confirmationId: prepared.needsConfirmation.confirmationId
    });
    assert.match(replay.reply, /expired/i);
    assert.equal(await prisma.pGExpense.count({ where: { propertyId: ids.prop.id, note: 'cancel test' } }), 0);
  });

  it('emits an A2UI property-results surface alongside the text reply', async () => {
    const house = await prisma.pGProperty.create({
      data: { name: 'A2UI House', address: '7, Test Lane', locality: 'A2UIVille', city: 'Chennai', genderPolicy: 'ANY', amenities: [], houseRules: [], status: 'ACTIVE' }
    });
    const room = await prisma.pGRoom.create({ data: { propertyId: house.id, roomNumber: 'A1', roomType: 'DOUBLE', monthlyRent: 6000, foodIncluded: false, status: 'ACTIVE' } });
    await prisma.pGBed.create({ data: { roomId: room.id, label: 'Bed 1', status: 'AVAILABLE' } });
    const provider = stubProvider([
      { calls: [{ name: 'search_properties', args: { location: 'A2UIVille' } }] },
      { text: 'Here is what I found.' }
    ]);
    const result = await orchestrator.runChat(guestReq(), provider, { message: 'PGs in A2UIVille' });
    assert.equal(result.reply, 'Here is what I found.');
    assert.equal(result.ui?.length, 1);
    const surface = result.ui![0]!;
    assert.equal(surface.version, '1.0');
    const create = surface.createSurface;
    assert.match(create.catalogId, /a2ui\.org/);
    assert.equal(create.dataModel.properties[0].name, 'A2UI House');
    assert.match(create.dataModel.properties[0].meta, /bed available/);
    const root = create.components.find((c: any) => c.id === 'root');
    assert.equal(root.component, 'Column');
    const card = create.components.find((c: any) => c.component === 'Card');
    assert.ok(card, 'results render as cards');
    const button = create.components.find((c: any) => c.component === 'Button');
    assert.equal(button.action.event.name, 'book_property');
    assert.equal(button.variant, 'secondary', 'result cards keep the single amber action for confirmations');
    assert.deepEqual(button.action.event.context.propertyId, { '@path': '/properties/0/property_id' });
    assert.ok(!JSON.stringify(surface).includes('9200000002'), 'no resident data in the surface');
  });

  it('emits an A2UI confirmation surface when a sensitive tool pauses', async () => {
    const provider = stubProvider([{ calls: [{ name: 'create_maintenance_ticket', args: { title: 'Tap leak', description: 'Kitchen tap drips', category: 'plumbing' } }] }]);
    const result = await orchestrator.runChat(userReq(ids.tenantUser), provider, { message: 'my tap leaks' });
    assert.ok(result.needsConfirmation);
    const surface = result.ui?.[0]?.createSurface;
    assert.ok(surface, 'the pause carries a surface');
    const names = surface.components.filter((c: any) => c.component === 'Button').map((c: any) => c.action.event.name);
    assert.deepEqual(names.sort(), ['cancel_action', 'confirm_action']);
    const variants = Object.fromEntries(surface.components.filter((c: any) => c.component === 'Button').map((c: any) => [c.action.event.name, c.variant]));
    assert.deepEqual(variants, { confirm_action: 'primary', cancel_action: 'text' });
    assert.equal(surface.components.find((c: any) => c.action?.event.name === 'confirm_action').action.event.context.confirmationId, result.needsConfirmation.confirmationId);
  });

  it('returns plain answers and keeps session context', async () => {
    const first = await orchestrator.runChat(guestReq(), stubProvider([{ text: 'Which locality are you looking in?' }]), { message: 'find me a PG' });
    assert.equal(first.reply, 'Which locality are you looking in?');
    assert.ok(first.sessionId);
    const row = await prisma.conversationSession.findUnique({ where: { id: first.sessionId } });
    assert.ok(row);
    const second = await orchestrator.runChat(guestReq(), stubProvider([{ text: 'Noted.' }]), { message: 'Sholinganallur', sessionId: first.sessionId });
    assert.equal(second.sessionId, first.sessionId);
  });

  it('expires unknown confirmations without side effects', async () => {
    const result = await orchestrator.runChat(guestReq(), stubProvider([]), { message: 'yes', confirmationId: 'cfm_missing' });
    assert.match(result.reply, /expired/i);
  });

  it('surfaces malformed tool arguments back to the model', async () => {
    let seen = 0;
    const broken = {
      async generate() {
        seen += 1;
        if (seen === 1) {
          return {
            text: '',
            content: { role: 'model', parts: [] },
            calls: [],
            invalid: [{ id: 'call_x', name: 'search_properties', error: 'bad json' }]
          };
        }
        return { text: 'Let me try that differently.', content: { role: 'model', parts: [{ text: 'Let me try that differently.' }] }, calls: [], invalid: [] };
      }
    };
    const result = await orchestrator.runChat(guestReq(), broken as any, { message: 'search' });
    assert.equal(result.reply, 'Let me try that differently.');
  });
});

// Intercepts fetch so the real Google model runs end to end without
// network access: records each Gemini request and replies with scripted bodies.
function fakeGemini(replies: any[]) {
  const seen: { url: string; key: string; body: any }[] = [];
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async (input: any, init?: any) => {
    const request = input instanceof Request ? input : new Request(input, init);
    seen.push({ url: request.url, key: request.headers.get('x-goog-api-key') || '', body: JSON.parse(await request.text()) });
    const reply = replies[Math.min(seen.length - 1, replies.length - 1)];
    if (typeof reply === 'function') return reply(request);
    if (reply instanceof Response) return reply;
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { seen, restore: () => { globalThis.fetch = realFetch; } };
}

const geminiText = (text: string) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] });

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

// Like stubProvider, but records the turn (system, contents, tools) the model was given each step.
function recordingProvider(script: Array<{ text?: string; calls?: Array<{ name: string; args: any }> }>) {
  const seen: any[] = [];
  let i = 0;
  return {
    seen,
    async generate(turn: any) {
      seen.push(turn);
      const step = script[Math.min(i++, script.length - 1)]!;
      const calls = (step.calls ?? []).map((c, n) => ({ id: `rec_${i}_${n}`, name: c.name, args: c.args }));
      return {
        text: step.text ?? '',
        content: { role: 'model', parts: [{ text: step.text ?? '' }, ...calls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } }))] },
        calls,
        invalid: []
      };
    }
  };
}

describe('tool argument validation (Zod)', () => {
  const ALLOWED_KEYS = new Set(['type', 'properties', 'required', 'enum', 'items', 'description']);

  it('generates provider-friendly JSON schemas from the Zod definitions', () => {
    const walk = (node: any, where: string) => {
      for (const [key, value] of Object.entries(node)) {
        assert.ok(ALLOWED_KEYS.has(key), `${where}: unexpected schema key ${key}`);
        if (key === 'properties') for (const [prop, sub] of Object.entries(value as object)) walk(sub, `${where}.${prop}`);
        if (key === 'items') walk(value, `${where}[]`);
      }
    };
    for (const [name, tool] of Object.entries(tools.toolCatalogue) as [string, any][]) walk(tools.toolParameters(tool.schema), name);
    assert.deepEqual(tools.toolParameters(tools.toolCatalogue.get_booking_status.schema), {
      type: 'object',
      properties: { booking_ref: { type: 'string' }, phone: { type: 'string' } },
      required: ['booking_ref', 'phone']
    });
  });

  it('converts tool schemas to Gemini function declarations', () => {
    const declared = providerMod.toFunctionDeclarations([
      { name: 'get_booking_status', description: 'Look up a booking.', parameters: tools.toolParameters(tools.toolCatalogue.get_booking_status.schema) }
    ]);
    assert.deepEqual(declared, [{
      name: 'get_booking_status',
      description: 'Look up a booking.',
      parameters: { type: 'OBJECT', properties: { booking_ref: { type: 'STRING' }, phone: { type: 'STRING' } }, required: ['booking_ref', 'phone'] }
    }]);
  });

  it('normalizes harmless model quirks', () => {
    const parsed = tools.parseToolArgs('search_properties', { location: 'OMR', budget_max: '12000', ac: 'true', room_type: null, invented_flag: 1 });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.args, { location: 'OMR', budget_max: 12000, ac: true });
  });

  it('rejects missing required fields, wrong types and unknown enum values', () => {
    const missing = tools.parseToolArgs('get_booking_status', { booking_ref: 'BK-1' });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /phone/);
    assert.equal(tools.parseToolArgs('search_properties', { budget_max: 'cheap' }).ok, false);
    assert.equal(tools.parseToolArgs('search_properties', { gender: 'OTHER' }).ok, false);
    assert.equal(tools.parseToolArgs('set_meal_preference', {}).ok, false);
    assert.equal(tools.parseToolArgs('no_such_tool', {}).ok, false);
  });

  it('returns invalid arguments to the model instead of preparing the action', async () => {
    const model = recordingProvider([
      { calls: [{ name: 'create_booking_request', args: { bed_id: ids.bedFree1.id, move_in_date: '2026-12-01', resident_name: 'Zod Guest' } }] },
      { text: 'I need your phone number and verification to book.' }
    ]);
    const before = await prisma.pGBooking.count();
    const result = await orchestrator.runChat(guestReq(), model, { message: 'book bed 1' });
    assert.equal(result.needsConfirmation, undefined, 'nothing is offered for confirmation');
    assert.equal(result.reply, 'I need your phone number and verification to book.');
    const responses = model.seen[1]!.contents.flatMap((c: any) => (c.parts || []).filter((p: any) => p.functionResponse).map((p: any) => p.functionResponse.response));
    assert.match(JSON.stringify(responses), /invalid arguments for create_booking_request/);
    assert.match(JSON.stringify(responses), /phone_token/);
    assert.equal(await prisma.pGBooking.count(), before);
  });
});

describe('search near a campus or office', () => {
  it('adds the distance to a named landmark and sorts nearest first', async () => {
    const pinned = await prisma.pGProperty.create({
      data: {
        name: 'Lakeside Near Tidel', address: '3, Test Road', locality: 'Perungudi', city: 'Chennai', latitude: 12.9653, longitude: 80.2461,
        genderPolicy: 'ANY', amenities: [], houseRules: [], status: 'ACTIVE'
      }
    });
    const room = await prisma.pGRoom.create({ data: { propertyId: pinned.id, roomNumber: '1', roomType: 'SHARED', monthlyRent: 7000, foodIncluded: false, status: 'ACTIVE' } });
    await prisma.pGBed.create({ data: { roomId: room.id, label: 'Bed 1', status: 'AVAILABLE' } });
    try {
      const results = await tools.toolCatalogue.search_properties.execute(guestActor, { near: 'tidel' });
      const ours = results.find((p: any) => p.property_id === pinned.id);
      assert.ok(ours, 'the pinned PG is in the results');
      assert.equal(ours.near, 'Tidel Park, Taramani');
      assert.ok(ours.distance_km > 2 && ours.distance_km < 3.5, `Perungudi is about 2.7 km from Tidel Park, got ${ours.distance_km}`);
      const distances = results.map((p: any) => p.distance_km ?? Infinity);
      assert.deepEqual(distances, [...distances].sort((x, y) => x - y), 'nearest first, PGs without a location last');
      await assert.rejects(tools.toolCatalogue.search_properties.execute(guestActor, { near: 'Mars Base' }), /UNKNOWN_PLACE: use one of .*IIT Madras/);
    } finally {
      await prisma.pGBed.deleteMany({ where: { roomId: room.id } });
      await prisma.pGRoom.delete({ where: { id: room.id } });
      await prisma.pGProperty.delete({ where: { id: pinned.id } });
    }
  });
});

describe('owner insights: PG pulse and kitchen forecast', () => {
  it('writes a plain weekly brief from the numbers when AI is off, with the right next step', async () => {
    const insights = await import('../src/controllers/insights.controller.js');
    const brief = insights.plainBrief({ beds: 20, occupied: 9, newResidents: 2, pendingRequests: 1, overdueCount: 3, overdueAmount: 21100, ticketsOpen: 1, ticketsOpened: 2, ticketsResolved: 1, avgFixHours: 5, mealOrders: 17, aiActions: 4 });
    assert.equal(brief.ai, false);
    assert.equal(brief.suggestion.action, 'SEND_RENT_REMINDERS', 'overdue rent comes first');
    assert.ok(brief.points.some((point) => point.includes('₹21,100')));
    const calm = insights.plainBrief({ beds: 4, occupied: 4, newResidents: 0, pendingRequests: 0, overdueCount: 0, overdueAmount: 0, ticketsOpen: 0, ticketsOpened: 0, ticketsResolved: 0, avgFixHours: null, mealOrders: 0, aiActions: 0 });
    assert.equal(calm.suggestion.action, 'NONE');
  });

  it('forecasts plates from routines and never goes below booked orders or above the plan', async () => {
    const insights = await import('../src/controllers/insights.controller.js');
    const rules = insights.ruleForecast({ date: '2026-11-23', weekday: 'Monday', planResidents: 6, orders: { BREAKFAST: 0, LUNCH: 2, DINNER: 0 }, lateRisers: 2, dayWorkers: 3, nightWorkers: 1, sameWeekdayOrders: [1, 0, 2, 1] });
    assert.ok(rules.BREAKFAST.plates < 6, 'late risers skip breakfast');
    assert.ok(rules.LUNCH.plates >= 2, 'booked lunch orders are always made');

    const getForecast = insights.createKitchenForecastHandler({
      forecast: async () => ({
        BREAKFAST: { plates: 99, why: 'too many' }, LUNCH: { plates: -3, why: 'too few' }, DINNER: { plates: 1, why: 'ok' }, tip: 'Cook in batches.'
      })
    });
    const resident = await prisma.pGTenant.findFirst({ where: { propertyId: ids.prop.id, status: 'ACTIVE' } });
    const roomA = await prisma.pGRoom.update({ where: { id: ids.roomB.id }, data: { foodCharge: 1500 } });
    const date = '2026-12-07';
    await prisma.pGServiceOrder.create({ data: { propertyId: ids.prop.id, tenantId: resident!.id, type: 'MEAL', forDate: new Date(`${date}T00:00:00.000Z`), slot: 'LUNCH', quantity: 2, unitPrice: 90 } });
    try {
      const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
      await getForecast({ ...userReq(ids.owner), query: { propertyId: ids.prop.id, date } } as any, res);
      assert.equal(res.statusCode, 200);
      const byMeal = Object.fromEntries(res.body.meals.map((meal: any) => [meal.meal, meal]));
      assert.equal(byMeal.BREAKFAST.plates, byMeal.BREAKFAST.cookingForAll, 'never above everyone on the plan');
      assert.equal(byMeal.LUNCH.plates, 2, 'never below the booked orders');
      assert.equal(res.body.ai, true);
      assert.ok(!JSON.stringify(res.body).includes('Spec Tenant'), 'plate counts only, no names');
    } finally {
      await prisma.pGServiceOrder.deleteMany({ where: { propertyId: ids.prop.id, forDate: new Date(`${date}T00:00:00.000Z`) } });
      await prisma.pGRoom.update({ where: { id: roomA.id }, data: { foodCharge: 0 } });
    }
  });
});

describe('Deposit Shield: settle deposits from condition photos', () => {
  it('never charges normal wear, stays within the deposit, and needs both records', async () => {
    const shield = await import('../src/controllers/deposit-shield.controller.js');
    const settled = shield.settleReview({
      changes: [
        { item: 'Wardrobe door', change: 'Hinge broken', kind: 'DAMAGE', suggested: 400.6 },
        { item: 'Walls', change: 'Paint slightly faded', kind: 'WEAR', suggested: 900 },
        { item: 'Room', change: 'Needs a deep clean', kind: 'CLEANING', suggested: 5000 }
      ],
      summary: 'Two real changes and some normal wear.'
    }, 2000);
    assert.equal(settled.changes[0]!.suggested, 401);
    assert.equal(settled.changes[1]!.suggested, 0, 'wear is free');
    assert.equal(settled.changes[2]!.suggested, 1599, 'capped at what is left of the deposit');
    assert.equal(settled.suggestedTotal, 2000);

    const respond = () => ({ statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } });
    await prisma.pGTenant.update({ where: { id: ids.tenant.id }, data: { depositReceived: 3000 } });
    const reviewDeposit = shield.createDepositReviewer({
      review: async () => ({ changes: [{ item: 'Desk lamp', change: 'Missing', kind: 'MISSING', suggested: 350 }], summary: 'The desk lamp is missing.' })
    });
    try {
      const early = respond();
      await reviewDeposit({ ...userReq(ids.owner), params: { tenantId: ids.tenant.id } } as any, early as any);
      assert.equal(early.statusCode, 409);
      assert.match(early.body.message, /move-in/);

      const moveIn = await prisma.pGConditionReport.create({ data: { propertyId: ids.prop.id, tenantId: ids.tenant.id, kind: 'MOVE_IN', notes: 'Lamp on the desk', photoUrls: [] } });
      const moveOut = await prisma.pGConditionReport.create({ data: { propertyId: ids.prop.id, tenantId: ids.tenant.id, kind: 'MOVE_OUT', notes: 'No lamp', photoUrls: [] } });
      const res = respond();
      await reviewDeposit({ ...userReq(ids.owner), params: { tenantId: ids.tenant.id } } as any, res as any);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.suggestedTotal, 350);

      const outsider = respond();
      await reviewDeposit({ ...userReq(ids.tenantUser), params: { tenantId: ids.tenant.id } } as any, outsider as any);
      assert.equal(outsider.statusCode, 404, 'residents cannot run it on themselves');
      await prisma.pGConditionReport.deleteMany({ where: { id: { in: [moveIn.id, moveOut.id] } } });
    } finally {
      await prisma.pGTenant.update({ where: { id: ids.tenant.id }, data: { depositReceived: 0 } });
    }
  });
});

describe('owner sign-in forgives copy-paste slips', () => {
  it('accepts a pasted trailing space and local number formats, but not a wrong password', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const auth = await import('../src/controllers/pg-auth.controller.js');
    const owner = await prisma.user.create({ data: { phone: '9400000088', email: 'slip.owner@example.com', password: await bcrypt.hash('Rl1lDemo@pass', 10), name: 'Slip Owner', role: 'PG_OWNER' } });
    const attempt = async (phone: string, password: string) => {
      const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
      await auth.login({ body: { email: phone, password }, headers: {} } as any, res);
      return res.statusCode;
    };
    try {
      assert.equal(await attempt('9400000088', 'Rl1lDemo@pass'), 200);
      assert.equal(await attempt('9400000088', 'Rl1lDemo@pass '), 200, 'trailing space from copy-paste');
      assert.equal(await attempt('+91 94000 00088', 'Rl1lDemo@pass'), 200);
      assert.equal(await attempt('09400000088', 'Rl1lDemo@pass'), 200, 'leading 0');
      assert.equal(await attempt('9400000088', 'RI1lDemo@pass'), 401, 'a different password is still refused');
    } finally {
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });
});

describe('staff coordination through the assistant', () => {
  it('lists staff without phone numbers and assigns a ticket only after confirmation', async () => {
    const warden = await prisma.user.create({ data: { phone: '9400000077', email: 'kavya.warden@example.com', password: 'x', name: 'Kavya Warden', role: 'PG_WARDEN' } });
    const access = await prisma.pGPropertyAccess.create({ data: { propertyId: ids.prop.id, userId: warden.id, role: 'WARDEN' } });
    try {
      const ownerActor = await tools.actorFromRequest(userReq(ids.owner));
      const staff = await tools.toolCatalogue.list_staff.execute(ownerActor, { property_id: ids.prop.id });
      assert.ok(staff.some((member: any) => member.name === 'Kavya Warden' && member.role === 'WARDEN'));
      assert.doesNotMatch(JSON.stringify(staff), /9400000077/, 'no phone numbers');

      const prepared = await orchestrator.runChat(userReq(ids.owner), stubProvider([
        { calls: [{ name: 'assign_maintenance_ticket', args: { ticket_id: ids.ticket.id, staff_name: 'kavya' } }] }
      ]), { message: 'give the leak to Kavya' });
      assert.equal(prepared.needsConfirmation?.tool, 'assign_maintenance_ticket');
      assert.equal((await prisma.pGMaintenanceTicket.findUnique({ where: { id: ids.ticket.id } })).assignedTo, null, 'not assigned before confirmation');
      const done = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation!.confirmationId });
      assert.match(done.reply, /^Done\./);
      assert.equal((await prisma.pGMaintenanceTicket.findUnique({ where: { id: ids.ticket.id } })).assignedTo, warden.id);

      await assert.rejects(tools.toolCatalogue.assign_maintenance_ticket.execute(ownerActor, { ticket_id: ids.ticket.id, staff_name: 'Nobody' }), /STAFF_NOT_FOUND: .*Kavya Warden/);
      await assert.rejects(tools.toolCatalogue.assign_maintenance_ticket.execute(ownerActor, { ticket_id: ids.otherTicket.id, staff_name: 'kavya' }), /FORBIDDEN/);
    } finally {
      await prisma.pGMaintenanceTicket.update({ where: { id: ids.ticket.id }, data: { assignedTo: null } });
      await prisma.pGPropertyAccess.delete({ where: { id: access.id } });
      await prisma.user.delete({ where: { id: warden.id } });
    }
  });
});

describe('owner notices through the assistant', () => {
  it('posts a confirmed notice to every current resident, and only on the caller\'s own PG', async () => {
    const before = await prisma.pGResidentNotification.count({ where: { type: 'NOTICE', propertyId: ids.prop.id } });
    const residents = await prisma.pGTenant.count({ where: { propertyId: ids.prop.id, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } } });
    const prepared = await orchestrator.runChat(userReq(ids.owner), stubProvider([
      { calls: [{ name: 'send_property_notice', args: { property_id: ids.prop.id, title: 'Water cut on Sunday', message: 'No water from 10 am to 1 pm on Sunday for tank cleaning.' } }] }
    ]), { message: 'tell everyone about the water cut' });
    assert.equal(prepared.needsConfirmation?.tool, 'send_property_notice');
    assert.match(prepared.needsConfirmation!.preview, /Water cut on Sunday/);
    assert.equal(await prisma.pGResidentNotification.count({ where: { type: 'NOTICE', propertyId: ids.prop.id } }), before, 'nothing is posted before confirmation');

    const done = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation!.confirmationId });
    assert.match(done.reply, /^Done\./);
    assert.ok(residents > 0);
    assert.equal(await prisma.pGResidentNotification.count({ where: { type: 'NOTICE', propertyId: ids.prop.id } }), before + residents);

    await assert.rejects(
      tools.toolCatalogue.send_property_notice.execute(await tools.actorFromRequest(userReq(ids.owner)), { property_id: ids.other.id, title: 'Not yours', message: 'Should be refused.' }),
      /FORBIDDEN/);
  });
});

describe('durable agent threads (PostgreSQL state)', () => {
  const expenseCall = (note: string) => ({ calls: [{ name: 'log_expense', args: { property_id: ids.prop.id, category: 'OTHER', amount: 321, spent_on: '2025-01-03', note } }] });
  after(async () => {
    const created = await prisma.pGExpense.findMany({ where: { amount: 321, spentOn: { lt: new Date('2025-02-01') } }, select: { id: true } });
    const createdIds = created.map((row: { id: string }) => row.id);
    await prisma.pHAuditLog.deleteMany({ where: { entityId: { in: createdIds } } });
    await prisma.pGExpense.deleteMany({ where: { id: { in: createdIds } } });
  });

  it('keeps a pending confirmation across a server restart', async () => {
    const prepared = await orchestrator.runChat(userReq(ids.owner), stubProvider([expenseCall('restart test')]), { message: 'log it' });
    assert.ok(prepared.needsConfirmation);
    assert.match(prepared.needsConfirmation.confirmationId, /^cfm\.[0-9a-f-]{36}\.[0-9a-f]{32}$/);

    // Drop every in-process handle: a new process would start exactly like this.
    await (await import('../src/services/ai-checkpointer.js')).closeCheckpointer();

    const done = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(done.reply, /^Done\./);
    assert.deepEqual(done.toolCalls, ['log_expense']);
    assert.equal(await prisma.pGExpense.count({ where: { note: 'restart test' } }), 1);

    const thread = await prisma.conversationSession.findUnique({ where: { id: prepared.sessionId } });
    const saved = JSON.parse(thread!.stateJson);
    assert.equal(saved.pending, null, 'the confirmation was consumed');
    assert.ok(saved.history.length > 2, 'thread state lives in PostgreSQL');
  });

  it('restores conversation history from the checkpoint', async () => {
    const first = await orchestrator.runChat(guestReq(), stubProvider([{ text: 'Which area?' }]), { message: 'find a PG' });
    const model = recordingProvider([{ text: 'Got it.' }]);
    await orchestrator.runChat(guestReq(), model, { message: 'Sholinganallur', sessionId: first.sessionId });
    const turn = model.seen[0]!;
    assert.match(turn.system, /PG OS assistant/, 'the role prompt is added per call, not stored');
    assert.ok(turn.tools.some((t: any) => t.name === 'search_properties'));
    const texts = turn.contents.map((c: any) => `${c.role === 'user' ? 'human' : 'ai'}:${(c.parts || []).map((p: any) => p.text || '').join('')}`);
    assert.deepEqual(texts, ['human:find a PG', 'ai:Which area?', 'human:Sholinganallur']);
  });

  it('closes an unanswered confirmation when the user moves on', async () => {
    const prepared = await orchestrator.runChat(userReq(ids.owner), stubProvider([expenseCall('moved on')]), { message: 'log it' });
    const model = recordingProvider([{ text: 'Sure, what else?' }]);
    const next = await orchestrator.runChat(userReq(ids.owner), model, { message: 'never mind, show occupancy', sessionId: prepared.sessionId });
    assert.equal(next.reply, 'Sure, what else?');

    // Every tool call the model made has an answer before the next user turn.
    const history = model.seen[0]!.contents;
    const callIds = history.flatMap((c: any) => (c.parts || []).filter((p: any) => p.functionCall).map((p: any) => p.functionCall.id));
    const answered = history.flatMap((c: any) => (c.parts || []).filter((p: any) => p.functionResponse).map((p: any) => p.functionResponse.id));
    assert.ok(callIds.length > 0);
    assert.deepEqual(answered, callIds);

    const late = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(late.reply, /expired/i);
    assert.equal(await prisma.pGExpense.count({ where: { note: 'moved on' } }), 0);
  });

  it('expires confirmations after ten minutes', async () => {
    const prepared = await orchestrator.runChat(userReq(ids.owner), stubProvider([expenseCall('too late')]), { message: 'log it' });
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000;
    try {
      const result = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
      assert.match(result.reply, /expired/i);
    } finally {
      Date.now = realNow;
    }
    assert.equal(await prisma.pGExpense.count({ where: { note: 'too late' } }), 0);
  });

  it('rejects a confirmation presented with a different session', async () => {
    const prepared = await orchestrator.runChat(userReq(ids.owner), stubProvider([expenseCall('wrong session')]), { message: 'log it' });
    const other = await orchestrator.runChat(userReq(ids.owner), stubProvider([{ text: 'hi' }]), { message: 'hello' });
    const result = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), {
      message: 'yes', sessionId: other.sessionId, confirmationId: prepared.needsConfirmation.confirmationId
    });
    assert.match(result.reply, /expired/i);
    assert.equal(await prisma.pGExpense.count({ where: { note: 'wrong session' } }), 0);
  });

  it('does not let another user confirm or see the thread', async () => {
    const prepared = await orchestrator.runChat(userReq(ids.owner), stubProvider([expenseCall('other user')]), { message: 'log it' });
    const intruder = await orchestrator.runChat(guestReq(), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(intruder.reply, /expired/i);
    assert.equal(await prisma.pGExpense.count({ where: { note: 'other user' } }), 0);
    const stillPending = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(stillPending.reply, /^Done\./, 'a refused attempt does not consume the owner’s confirmation');
  });
});

describe('file storage drivers', () => {
  it('stores files in Google Cloud Storage and serves cached signed URLs', async () => {
    const storage = await import('../src/services/storage.js');
    const saved: Record<string, { size: number; contentType: string }> = {};
    const signed: string[] = [];
    const gcs = storage.createStorageService({
      gcsBucket: {
        file(name: string) {
          return {
            async save(data: Buffer, options: { contentType: string }) { saved[name] = { size: data.length, contentType: options.contentType }; },
            async getSignedUrl(options: { action: string; contentType?: string }) {
              signed.push(`${options.action}:${name}`);
              return [`https://storage.googleapis.com/test-bucket/${name}?sig=${signed.length}`] as [string];
            }
          };
        }
      }
    });
    const keep = process.env.UPLOAD_STORAGE;
    process.env.UPLOAD_STORAGE = 'gcs';
    try {
      const key = storage.newFileKey('webp');
      assert.match(key, /^uploads\/\d+-[0-9a-f-]{36}\.webp$/);
      await gcs.putFile(key, Buffer.from('img'), 'image/webp');
      assert.deepEqual(saved[key], { size: 3, contentType: 'image/webp' });

      const req = { protocol: 'http', get: () => 'localhost' } as any;
      const first = await gcs.viewUrl(req, key);
      const second = await gcs.viewUrl(req, key);
      assert.equal(first, second, 'signed URLs are reused while fresh');
      assert.deepEqual(signed, [`read:${key}`]);

      const uploadUrl = await gcs.directUploadUrl('uploads/direct.pdf', 'application/pdf');
      assert.match(uploadUrl, /storage\.googleapis\.com/);
      assert.equal(signed[1], 'write:uploads/direct.pdf');
    } finally {
      process.env.UPLOAD_STORAGE = keep;
    }
  });

  it('uses Cloud Storage whenever a bucket is configured, never the container disk', async () => {
    const storage = await import('../src/services/storage.js');
    const keep = { kind: process.env.UPLOAD_STORAGE, bucket: process.env.GCS_BUCKET };
    try {
      delete process.env.UPLOAD_STORAGE;
      process.env.GCS_BUCKET = 'livingplus-uploads';
      assert.equal(storage.storageKind(), 'gcs');
      process.env.UPLOAD_STORAGE = 'local';
      assert.equal(storage.storageKind(), 'local', 'an explicit choice still wins');
      delete process.env.UPLOAD_STORAGE;
      delete process.env.GCS_BUCKET;
      assert.equal(storage.storageKind(), 'local');
    } finally {
      if (keep.kind === undefined) delete process.env.UPLOAD_STORAGE; else process.env.UPLOAD_STORAGE = keep.kind;
      if (keep.bucket === undefined) delete process.env.GCS_BUCKET; else process.env.GCS_BUCKET = keep.bucket;
    }
  });

  it('keeps local storage private and refuses direct uploads there', async () => {
    const storage = await import('../src/services/storage.js');
    assert.equal(storage.storageKind(), 'local');
    assert.match(storage.newFileKey('pdf'), /^local\/[0-9a-f-]{36}\.pdf$/);
    assert.equal(storage.localUploadPath('../../etc/passwd'), null);
    assert.equal(await storage.viewUrl({ protocol: 'http', get: () => 'x' } as any, 'local/00000000-0000-4000-8000-000000000000.webp'), null);
    await assert.rejects(storage.directUploadUrl('uploads/x.pdf', 'application/pdf'), /DIRECT_UPLOAD_UNSUPPORTED/);
  });
});

describe('request body validation (Zod)', () => {
  let controllers: any;
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const call = async (handler: string, body: any, extra: any = {}) => {
    const res = respond();
    await controllers[handler]({ body, params: {}, headers: {}, query: {}, user: { userId: ids.owner.id, role: 'PG_OWNER' }, ...extra } as any, res as any);
    return res;
  };
  before(async () => { controllers = await import('../src/controllers/pg.controller.js'); });

  it('rejects wrong-typed booking fields with 400 instead of crashing', async () => {
    const res = await call('createBookingRequest', { propertyId: ids.prop.id, residentName: 123, phone: '9876543210', moveInDate: '2026-12-01' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Property, name, phone and move-in date are required');
    assert.deepEqual(res.body.issues.map((i: any) => i.path), ['residentName']);
  });

  it('accepts null optional fields and extra form fields on bookings', async () => {
    const res = await call('createBookingRequest', {
      propertyId: ids.prop.id, residentName: 'Valid Person', phone: '9876543210', moveInDate: '2026-12-01',
      email: null, notes: null, bedId: null, someFormOnlyField: 'ignored'
    });
    assert.notEqual(res.statusCode, 400, 'passes validation (then fails phone verification)');
    assert.equal(res.statusCode, 403);
  });

  it('validates ledger amounts and methods, accepting numeric strings', async () => {
    assert.equal((await call('recordRentPayment', { amount: 'abc', method: 'CASH' }, { params: { entryId: 'x' } })).statusCode, 400);
    assert.equal((await call('recordRentPayment', { amount: -5, method: 'CASH' }, { params: { entryId: 'x' } })).statusCode, 400);
    assert.equal((await call('recordRentPayment', { amount: 500, method: 'BITCOIN' }, { params: { entryId: 'x' } })).statusCode, 400);
    const ok = await call('recordRentPayment', { amount: '500', method: 'cash' }, { params: { entryId: 'missing-entry' } });
    assert.equal(ok.statusCode, 404, 'valid input reaches the ledger lookup');
    const badNotes = await call('createRentEntry', { tenantId: 't', period: '2026-12', amount: 5, dueDate: '2026-12-05', notes: { x: 1 } });
    assert.equal(badNotes.statusCode, 400);
    assert.deepEqual(badNotes.body.issues.map((i: any) => i.path), ['notes']);
  });

  it('rejects wrong-typed fields on every guarded endpoint with 400', async () => {
    const auth = await import('../src/controllers/pg-auth.controller.js');
    const ai = await import('../src/controllers/ai.controller.js');
    const roomChange = await import('../src/controllers/room-change.controller.js');
    const run = async (handler: any, body: any, extra: any = {}) => {
      const res = respond();
      await handler({ body, params: {}, headers: {}, query: {}, user: { userId: ids.owner.id, role: 'PG_OWNER' }, ...extra } as any, res as any);
      return res;
    };
    const cases: Array<[string, any, any, any?]> = [
      ['login', auth.login, { phone: '9100000001', password: { $ne: null } }],
      ['register', auth.register, { name: 'X', amenities: [{ evil: true }] }],
      ['updateProperty', controllers.updateProperty, { amenities: { a: 1 } }, { params: { propertyId: ids.prop.id } }],
      ['createRoom', controllers.createRoom, { roomNumber: ['101'] }, { params: { propertyId: ids.prop.id } }],
      ['chat', ai.postChat, { message: { text: 'hi' } }],
      ['room change', roomChange.createRoomChange, { request_type: 'TELEPORT' }, { user: { userId: ids.tenantUser.id, role: 'PG_TENANT' } }]
    ];
    for (const [name, handler, body, extra] of cases) {
      const res = await run(handler, body, extra);
      assert.equal(res.statusCode, 400, name);
      assert.ok(Array.isArray(res.body.issues) || typeof res.body.issues === 'string', `${name} explains the problem`);
    }
  });

  it('enforces the shared password rule when an owner registers', async () => {
    const auth = await import('../src/controllers/pg-auth.controller.js');
    const res = respond();
    await auth.register({ body: { name: 'Weak Owner', phone: '9877700001', password: 'password', propertyName: 'Weak PG', propertyAddress: '1 Road', locality: 'Adyar' }, headers: {} } as any, res as any);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /8\+ chars/);
  });

  it('normalizes harmless input variations instead of rejecting them', async () => {
    const res = await call('createRoom', { roomNumber: 'Z9', roomType: 'SHARED', monthlyRent: '6500', hasAc: 'true', foodIncluded: 'false', numberOfBeds: 1 }, { params: { propertyId: ids.prop.id } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.hasAc, true);
    assert.equal(res.body.foodIncluded, false, '"false" no longer becomes true');
  });

  it('keeps 404s for unknown stays and validates claim references', async () => {
    const badRef = await call('createResidentPaymentClaim', { amount: 100, reference: 'x' });
    assert.equal(badRef.statusCode, 400);
    assert.equal(badRef.body.message, 'Enter a positive amount and a valid UPI transaction reference');
    const review = await call('reviewPaymentClaim', { status: 'maybe' }, { params: { claimId: 'x' } });
    assert.equal(review.statusCode, 400);
    assert.equal(review.body.message, 'Choose approve or reject');
  });
});

describe('OTP demo mode', () => {
  it('shows codes on screen in production only when OTP_DEMO_MODE is on', async () => {
    const auth = await import('../src/controllers/pg-auth.controller.js');
    const keep = { env: process.env.NODE_ENV, demo: process.env.OTP_DEMO_MODE };
    const request = async (phone: string) => {
      const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
      await auth.requestOtp({ body: { phone, purpose: 'BOOKING' } } as any, res);
      return res;
    };
    process.env.NODE_ENV = 'production';
    try {
      delete process.env.OTP_DEMO_MODE;
      assert.equal((await request('9822200001')).statusCode, 500, 'production without SMS refuses to send');
      process.env.OTP_DEMO_MODE = 'true';
      const demo = await request('9822200002');
      assert.equal(demo.statusCode, 200);
      assert.match(demo.body.devCode, /^\d{6}$/);
    } finally {
      if (keep.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = keep.env;
      if (keep.demo === undefined) delete process.env.OTP_DEMO_MODE; else process.env.OTP_DEMO_MODE = keep.demo;
    }
  });
});

describe('Firebase phone verification (OTP_PROVIDER=firebase)', () => {
  let auth: any;
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const nowSeconds = () => Math.floor(Date.now() / 1000);
  // Fake Firebase Admin verifier: "tok:<phone>:<uid>[:<age seconds>][:<provider>]".
  const fakeVerifier = async (idToken: string) => {
    const [kind, phone, uid, age = '5', provider = 'phone'] = idToken.split(':');
    if (kind !== 'tok') throw new Error('Firebase ID token has invalid signature');
    return { phone_number: `+${phone}`, uid: uid!, auth_time: nowSeconds() - Number(age), firebase: { sign_in_provider: provider } };
  };

  before(async () => {
    auth = await import('../src/controllers/pg-auth.controller.js');
    process.env.OTP_PROVIDER = 'firebase';
  });
  after(() => {
    delete process.env.OTP_PROVIDER;
  });

  const verify = async (body: any, propertyId?: string, useDefaultVerifier = false) => {
    const res = respond();
    const handler = useDefaultVerifier ? auth.verifyOtp : auth.createVerifyOtpHandler({ verifyToken: fakeVerifier });
    await handler({ body, ...(propertyId ? { pgPropertyId: propertyId } : {}) } as any, res as any);
    return res;
  };

  it('tells clients to use Firebase instead of server-sent codes', async () => {
    const res = respond();
    await auth.requestOtp({ body: { phone: '9811100001', purpose: 'BOOKING' } } as any, res as any);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.provider, 'firebase');
  });

  it('issues a single-use phone token for a verified Firebase sign-in', async () => {
    const res = await verify({ phone: '9811100001', purpose: 'BOOKING', firebaseIdToken: 'tok:919811100001:uid-a' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body.phoneToken, /^vrf_[0-9a-f]{32}$/);
    assert.equal(await auth.consumePhoneToken('919811100001', res.body.phoneToken), true);
    assert.equal(await auth.consumePhoneToken('919811100001', res.body.phoneToken), false, 'phone tokens stay single-use');
    // Plus a guest session for "My requests", bound to the verified number.
    const jwt = (await import('jsonwebtoken')).default;
    const guest = jwt.verify(res.body.guestToken, process.env.JWT_SECRET as string, { audience: 'livingplus-guest' }) as any;
    assert.equal(guest.phone, '9811100001');
  });

  it('refuses replayed, mismatched, stale, non-phone and forged tokens', async () => {
    assert.equal((await verify({ phone: '9811100002', purpose: 'BOOKING', firebaseIdToken: 'tok:919811100002:uid-b' })).statusCode, 200);
    const replay = await verify({ phone: '9811100002', purpose: 'BOOKING', firebaseIdToken: 'tok:919811100002:uid-b' });
    assert.equal(replay.statusCode, 400);
    assert.match(replay.body.message, /already used/);

    const mismatch = await verify({ phone: '9811100003', purpose: 'BOOKING', firebaseIdToken: 'tok:919811109999:uid-c' });
    assert.equal(mismatch.statusCode, 400);
    assert.match(mismatch.body.message, /does not match/);

    assert.equal((await verify({ phone: '9811100004', purpose: 'BOOKING', firebaseIdToken: 'tok:919811100004:uid-d:900' })).statusCode, 400, 'older than 10 minutes');
    assert.equal((await verify({ phone: '9811100005', purpose: 'BOOKING', firebaseIdToken: 'tok:919811100005:uid-e:5:password' })).statusCode, 400, 'not a phone sign-in');
    assert.equal((await verify({ phone: '9811100006', purpose: 'BOOKING', firebaseIdToken: 'forged' })).statusCode, 400);
    assert.equal((await verify({ phone: '9811100007', purpose: 'BOOKING', code: '123456' })).statusCode, 400, 'server codes are not accepted');
  });

  it('signs an active resident in on their PG host', async () => {
    const res = await verify({ phone: '9200000002', purpose: 'TENANT_LOGIN', firebaseIdToken: 'tok:919200000002:uid-resident' }, ids.prop.id);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'PG_TENANT');
  });

  it('reports a missing Firebase project as unavailable, not as a bad code', async () => {
    const keep = process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_PROJECT_ID;
    try {
      assert.equal((await verify({ phone: '9811100008', purpose: 'BOOKING', firebaseIdToken: 'tok:919811100008:uid-f' }, undefined, true)).statusCode, 503);
    } finally {
      if (keep !== undefined) process.env.FIREBASE_PROJECT_ID = keep;
    }
  });

  it('publishes the provider and Firebase web config to the frontend', async () => {
    const { getPublicConfig } = await import('../src/controllers/pg.controller.js');
    const keep = { p: process.env.FIREBASE_PROJECT_ID, k: process.env.FIREBASE_WEB_API_KEY };
    process.env.FIREBASE_PROJECT_ID = 'livingplus-demo';
    process.env.FIREBASE_WEB_API_KEY = 'AIza-test-web-key';
    try {
      const res = respond();
      await getPublicConfig({} as any, res as any);
      assert.deepEqual(res.body.phoneVerification, {
        provider: 'firebase',
        firebase: { apiKey: 'AIza-test-web-key', authDomain: 'livingplus-demo.firebaseapp.com', projectId: 'livingplus-demo', appId: '' }
      });
    } finally {
      if (keep.p === undefined) delete process.env.FIREBASE_PROJECT_ID; else process.env.FIREBASE_PROJECT_ID = keep.p;
      if (keep.k === undefined) delete process.env.FIREBASE_WEB_API_KEY; else process.env.FIREBASE_WEB_API_KEY = keep.k;
    }
  });
});

describe('Sign in with Google (ENABLE_GOOGLE_SIGN_IN=true)', () => {
  let auth: any;
  let googleOwner: any;
  const keep: Record<string, string | undefined> = {};
  const envKeys = ['ENABLE_GOOGLE_SIGN_IN', 'FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'ADMIN_GOOGLE_EMAILS'];
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const nowSeconds = () => Math.floor(Date.now() / 1000);
  // Fake Firebase Admin verifier: "g:<email>:<uid>[:<age seconds>][:<provider>][:<verified>]".
  const fakeVerifier = async (idToken: string) => {
    const [kind, email, uid, age = '5', provider = 'google.com', verified = 'yes'] = idToken.split(':');
    if (kind !== 'g') throw new Error('Firebase ID token has invalid signature');
    return { email, email_verified: verified === 'yes', name: 'Google Name', uid: uid!, auth_time: nowSeconds() - Number(age), firebase: { sign_in_provider: provider } };
  };
  const signIn = async (firebaseIdToken: string, propertyId?: string) => {
    const res = respond();
    await auth.createGoogleLoginHandler({ verifyToken: fakeVerifier })({ body: { firebaseIdToken }, ...(propertyId ? { pgPropertyId: propertyId } : {}) } as any, res as any);
    return res;
  };

  before(async () => {
    for (const key of envKeys) keep[key] = process.env[key];
    process.env.ENABLE_GOOGLE_SIGN_IN = 'true';
    process.env.FIREBASE_PROJECT_ID = 'livingplus-demo';
    process.env.FIREBASE_WEB_API_KEY = 'AIza-test-web-key';
    process.env.ADMIN_GOOGLE_EMAILS = ' Founder@Example.com , ops@example.com';
    auth = await import('../src/controllers/pg-auth.controller.js');
    googleOwner = await prisma.user.create({ data: { phone: '9400000004', email: 'Owner.Google@Example.com', password: 'x', name: 'Google Owner', role: 'PG_OWNER' } });
    await prisma.user.create({ data: { phone: '9400000005', email: 'resident.google@example.com', password: 'x', name: 'Google Resident', role: 'PG_TENANT' } });
  });
  after(() => {
    for (const key of envKeys) {
      if (keep[key] === undefined) delete process.env[key]; else process.env[key] = keep[key];
    }
  });

  const link = async (firebaseIdToken: string, user: any) => {
    const res = respond();
    await auth.createLinkGoogleHandler({ verifyToken: fakeVerifier })({ body: { firebaseIdToken }, user } as any, res as any);
    return res;
  };

  it('never signs a staff account in just because the Google email matches', async () => {
    const res = await signIn('g:owner.google@example.com:uid-o');
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'GOOGLE_NOT_LINKED');
    assert.equal(res.body.token, undefined);
  });

  it('links Google after a password sign-in, then signs in by that Google account', async () => {
    // The Google email differs from the (unverified) email on the account: the link is by Google uid.
    const linked = await link('g:asha.personal@gmail.com:uid-o', { userId: googleOwner.id, role: 'PG_OWNER' });
    assert.equal(linked.statusCode, 200);
    assert.equal(linked.body.googleLinked, true);
    const res = await signIn('g:asha.personal@gmail.com:uid-o');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.id, googleOwner.id);
    assert.equal(res.body.user.role, 'PG_OWNER');
  });

  it('keeps one Google account to one LivingPlus account, and only for staff', async () => {
    const other = await prisma.user.create({ data: { phone: '9400000006', email: 'second.owner@example.com', password: 'x', name: 'Second Owner', role: 'PG_OWNER' } });
    assert.equal((await link('g:asha.personal@gmail.com:uid-o', { userId: other.id, role: 'PG_OWNER' })).statusCode, 409);
    const resident = await prisma.user.findFirst({ where: { phone: '9400000005' } });
    assert.equal((await link('g:resident@gmail.com:uid-r2', { userId: resident!.id, role: 'PG_TENANT' })).statusCode, 403);
    assert.equal((await link('g:x@gmail.com:uid-x', {})).statusCode, 401);
    assert.equal((await link('g:old@gmail.com:uid-z:900', { userId: other.id, role: 'PG_OWNER' })).statusCode, 401, 'stale token');
  });

  it('stops Google sign-in after unlinking', async () => {
    const res = respond();
    await auth.unlinkGoogle({ user: { userId: googleOwner.id, role: 'PG_OWNER' } } as any, res as any);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.googleLinked, false);
    assert.equal((await signIn('g:asha.personal@gmail.com:uid-o')).statusCode, 403);
    assert.equal((await link('g:asha.personal@gmail.com:uid-o', { userId: googleOwner.id, role: 'PG_OWNER' })).statusCode, 200, 'relink for later tests');
  });

  it('grants no platform admin through Google, even for emails in the retired ADMIN_GOOGLE_EMAILS', async () => {
    assert.equal((await signIn('g:founder@example.com:uid-a')).statusCode, 403);
  });

  it('refuses unknown emails, residents and PGs the owner has no access to', async () => {
    assert.equal((await signIn('g:stranger@example.com:uid-s')).statusCode, 403);
    assert.equal((await signIn('g:resident.google@example.com:uid-r')).statusCode, 403);
    assert.equal((await signIn('g:asha.personal@gmail.com:uid-o', ids.prop.id)).statusCode, 403, 'linked owner, but not on this PG');
  });

  it('refuses forged, stale, unverified and non-Google tokens', async () => {
    assert.equal((await signIn('forged')).statusCode, 401);
    assert.equal((await signIn('g:owner.google@example.com:uid-o:900')).statusCode, 401, 'older than 10 minutes');
    assert.equal((await signIn('g:owner.google@example.com:uid-o:5:password')).statusCode, 401, 'not a Google sign-in');
    assert.equal((await signIn('g:owner.google@example.com:uid-o:5:google.com:no')).statusCode, 401, 'email not verified');
  });

  it('is off unless enabled, and publishes its config when on', async () => {
    const { getPublicConfig } = await import('../src/controllers/pg.controller.js');
    const res = respond();
    await getPublicConfig({} as any, res as any);
    assert.deepEqual(res.body.googleSignIn, {
      firebase: { apiKey: 'AIza-test-web-key', authDomain: 'livingplus-demo.firebaseapp.com', projectId: 'livingplus-demo', appId: '' }
    });
    process.env.ENABLE_GOOGLE_SIGN_IN = 'false';
    try {
      assert.equal((await signIn('g:owner.google@example.com:uid-o')).statusCode, 404);
      const off = respond();
      await getPublicConfig({} as any, off as any);
      assert.equal(off.body.googleSignIn, null);
    } finally {
      process.env.ENABLE_GOOGLE_SIGN_IN = 'true';
    }
  });
});

describe('semantic PG search', () => {
  let search: any;
  let embeddingsMod: any;
  let quietPg: any;
  const embedCalls: string[] = [];
  // Deterministic stand-in for an embedding model: words hashed into 64 buckets.
  const fakeVector = (text: string) => {
    const v = new Array(64).fill(0);
    for (const word of text.toLowerCase().match(/[a-z]+/g) || []) {
      let h = 0;
      for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % 64;
      v[h] += 1;
    }
    return v;
  };
  const fakeEmbeddings = (purpose: string) => ({
    model: 'fake:bag-of-words',
    taskType: purpose === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
    dimensions: 64,
    async embedQuery(text: string) { embedCalls.push(`${purpose}:query`); return fakeVector(text); },
    async embedDocuments(texts: string[]) { embedCalls.push(`${purpose}:docs:${texts.length}`); return texts.map(fakeVector); }
  });

  const semanticDeps = { createEmbeddings: async (purpose: any) => fakeEmbeddings(purpose) };

  before(async () => {
    search = await import('../src/services/semantic-search.js');
    embeddingsMod = await import('../src/services/ai-embeddings.js');
    process.env.ENABLE_SEMANTIC_SEARCH = 'true';
    process.env.AI_EMBEDDING_MODEL = 'fake:bag-of-words';
    process.env.SEMANTIC_SEARCH_MIN_SCORE = '0.3';
    quietPg = await prisma.pGProperty.create({
      data: {
        name: 'Lotus Nest', address: '9, Rajiv Gandhi Salai', locality: 'Thoraipakkam', city: 'Chennai', genderPolicy: 'ANY',
        description: 'Quiet calm PG near the OMR tech park, pure veg food, study friendly.',
        amenities: ['Wi-Fi', 'Veg meals'], houseRules: ['No loud music'], status: 'ACTIVE'
      }
    });
    const room = await prisma.pGRoom.create({ data: { propertyId: quietPg.id, roomNumber: 'L1', roomType: 'SHARED', monthlyRent: 9000, foodIncluded: true, status: 'ACTIVE' } });
    await prisma.pGBed.create({ data: { roomId: room.id, label: 'Bed A', status: 'AVAILABLE' } });
  });
  after(async () => {
    await prisma.pGProperty.update({ where: { id: quietPg.id }, data: { status: 'INACTIVE' } });
    search.clearSemanticQueryCache();
    for (const key of ['ENABLE_SEMANTIC_SEARCH', 'AI_EMBEDDING_MODEL', 'SEMANTIC_SEARCH_MIN_SCORE']) delete process.env[key];
  });

  it('describes listings from stable facts only', async () => {
    const property = await prisma.pGProperty.findUnique({ where: { id: quietPg.id }, include: { rooms: true } });
    const text = search.propertySearchText(property);
    assert.match(text, /Lotus Nest: a paying-guest \(PG\) accommodation in Thoraipakkam, Chennai\./);
    assert.match(text, /OMR tech park/);
    assert.match(text, /Food included\./);
    assert.match(text, /Monthly rent from 9000 to 9000 rupees\./);
    assert.doesNotMatch(text, /bed/i, 'live bed availability is not embedded');
  });

  it('indexes listings once and re-embeds only what changed', async () => {
    const first = await search.indexProperties({}, semanticDeps);
    assert.ok(first.indexed >= 3);
    assert.deepEqual(await search.indexProperties({}, semanticDeps), { indexed: 0, skipped: first.indexed + first.skipped });
    await prisma.pGProperty.update({ where: { id: quietPg.id }, data: { description: 'Quiet calm PG near the OMR tech park, pure veg food, study friendly, rooftop garden.' } });
    const again = await search.indexProperties({}, semanticDeps);
    assert.equal(again.indexed, 1);
  });

  it('keeps vectors out of normal property queries', async () => {
    const plain = await prisma.pGProperty.findUnique({ where: { id: quietPg.id } });
    assert.equal('searchEmbedding' in (plain as object), false);
    const explicit = await prisma.pGProperty.findUnique({ where: { id: quietPg.id }, select: { searchEmbedding: true } });
    assert.equal(explicit!.searchEmbedding.length, 64);
  });

  it('ranks listings by meaning through the search endpoint', async () => {
    const { createSearchPropertiesSemanticHandler } = await import('../src/controllers/pg.controller.js');
    const searchSemantic = createSearchPropertiesSemanticHandler(semanticDeps);
    const res: any = { status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
    await searchSemantic({ query: { q: 'quiet place near OMR tech park with veg food' }, headers: {}, user: {} } as any, res);
    assert.equal(res.body.semantic, true);
    assert.equal(res.body.results[0].propertyId, quietPg.id);
    for (let i = 1; i < res.body.results.length; i += 1) assert.ok(res.body.results[i - 1].score >= res.body.results[i].score);
  });

  it('ranks identically in PostgreSQL (pgvector) and in process', async () => {
    const backend = await search.searchBackend();
    if (process.env.EXPECT_PGVECTOR === 'true') assert.equal(backend, 'pgvector', 'CI provides pgvector');
    const query = 'quiet calm veg food near OMR tech park';
    const scores = await search.semanticScores(query, {}, semanticDeps);
    const queryVector = fakeVector(query);
    const stored = await prisma.pGProperty.findMany({ where: { id: { in: [...scores.keys()] } }, select: { id: true, searchEmbedding: true } });
    assert.ok(stored.length >= 3);
    for (const row of stored) {
      const expected = search.cosineSimilarity(queryVector, row.searchEmbedding);
      assert.ok(Math.abs(scores.get(row.id)! - expected) < 1e-6, `${backend} score for ${row.id}`);
    }
  });

  it('caches query vectors', async () => {
    search.clearSemanticQueryCache();
    embedCalls.length = 0;
    await search.semanticScores('veg food near OMR', {}, semanticDeps);
    await search.semanticScores('veg food near OMR', {}, semanticDeps);
    assert.deepEqual(embedCalls, ['query:query']);
  });

  it('lets the assistant rank structured results by a free-text wish', async () => {
    const results = await tools.toolCatalogue.search_properties.execute(guestActor, { query: 'calm study friendly PG near OMR tech park, veg food' }, semanticDeps);
    assert.equal(results[0].property_id, quietPg.id);
    assert.ok(results.every((r: any) => typeof r.match_score === 'number'));
  });

  it('falls back cleanly when semantic search is off', async () => {
    process.env.ENABLE_SEMANTIC_SEARCH = 'false';
    try {
      const { searchPropertiesSemantic } = await import('../src/controllers/pg.controller.js');
      const res: any = { status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
      await searchPropertiesSemantic({ query: { q: 'veg food' }, headers: {}, user: {} } as any, res);
      assert.deepEqual(res.body, { semantic: false, results: [] });
      const results = await tools.toolCatalogue.search_properties.execute(guestActor, { query: 'veg food' }, semanticDeps);
      assert.ok(results.length > 0);
      assert.ok(results.every((r: any) => r.match_score === undefined));
    } finally {
      process.env.ENABLE_SEMANTIC_SEARCH = 'true';
    }
  });

  it('builds Vertex AI embeddings (service account, no key) at the stored vector size', async () => {
    const keep = { model: process.env.AI_EMBEDDING_MODEL, location: process.env.GOOGLE_CLOUD_LOCATION };
    try {
      process.env.AI_EMBEDDING_MODEL = 'google-vertexai:gemini-embedding-001';
      process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';
      const vertex: any = await embeddingsMod.createEmbeddings('document');
      assert.equal(vertex.model, 'gemini-embedding-001');
      assert.equal(vertex.taskType, 'RETRIEVAL_DOCUMENT');
      assert.equal(vertex.dimensions, 768, 'must match the 768-dim vectors already stored');
    } finally {
      if (keep.model === undefined) delete process.env.AI_EMBEDDING_MODEL; else process.env.AI_EMBEDDING_MODEL = keep.model;
      if (keep.location === undefined) delete process.env.GOOGLE_CLOUD_LOCATION; else process.env.GOOGLE_CLOUD_LOCATION = keep.location;
    }
  });

  it('configures Gemini embeddings per purpose and reports missing providers', async () => {
    const keep = process.env.AI_EMBEDDING_MODEL;
    try {
      process.env.AI_EMBEDDING_MODEL = 'google-genai:gemini-embedding-001';
      const api = fakeGemini([{ embeddings: [{ values: [0.1, 0.2, 0.3] }] }]);
      try {
        const query = await embeddingsMod.createEmbeddings('query');
        assert.deepEqual(await query.embedQuery('veg food near OMR'), [0.1, 0.2, 0.3]);
        const sent = api.seen[0]!;
        assert.match(sent.url, /models\/gemini-embedding-001:batchEmbedContents/);
        assert.equal(sent.body.requests[0].taskType, 'RETRIEVAL_QUERY');
        assert.equal(sent.body.requests[0].outputDimensionality, 768);
        assert.equal((await embeddingsMod.createEmbeddings('document') as any).taskType, 'RETRIEVAL_DOCUMENT');
      } finally {
        api.restore();
      }
      process.env.AI_EMBEDDING_MODEL = 'cohere:embed-v4';
      await assert.rejects(embeddingsMod.createEmbeddings('query'), /EMBEDDINGS_INIT_FAILED: unsupported provider "cohere"/);
      process.env.AI_EMBEDDING_MODEL = 'acme:x';
      await assert.rejects(embeddingsMod.createEmbeddings('query'), /unsupported provider "acme"/);
    } finally {
      process.env.AI_EMBEDDING_MODEL = keep;
    }
  });
});

describe('HTTP hardening', () => {
  let base = '';
  let server: http.Server;
  before(async () => {
    const { default: app } = await import('../src/app.js');
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  after(() => { server?.close(); });

  it('speaks plain JSON (TLS protects transport; no app-level payload encryption)', async () => {
    const res = await fetch(`${base}/api/pg/config`);
    const body = await res.json() as any;
    assert.match(String(res.headers.get('content-type')), /application\/json/);
    assert.equal(typeof body.phoneVerification?.provider, 'string');
    assert.equal('data' in body, false);
  });

  it('serves the public PG site directory with name and place only', async () => {
    const { prisma } = await import('../src/app.js');
    await prisma.pGProperty.upsert({
      where: { slug: 'site-directory-spec' },
      update: {},
      create: { slug: 'site-directory-spec', name: 'Site Directory Spec PG', address: '1 Test St', locality: 'Adyar', city: 'Chennai', genderPolicy: 'ANY' } as any
    });
    const list = await (await fetch(`${base}/api/pg/sites?search=directory spec`)).json() as any[];
    assert.equal(list.length, 1);
    assert.deepEqual(Object.keys(list[0]).sort(), ['city', 'locality', 'name', 'slug']);
    const site = await fetch(`${base}/api/pg/sites/${list[0].slug}`);
    assert.equal(site.status, 200);
    assert.equal(((await site.json()) as any).slug, list[0].slug);
    assert.equal((await fetch(`${base}/api/pg/sites/no-such-pg`)).status, 404);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(res.headers.get('strict-transport-security'));
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
  });

  it('allows only listed browser origins', async () => {
    const preflight = (origin: string) => fetch(`${base}/api/pg/ai/status`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }
    });
    assert.equal((await preflight('http://localhost:5173')).headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal((await preflight('https://sunrise.livingplus.com')).headers.get('access-control-allow-origin'), 'https://sunrise.livingplus.com');
    assert.equal((await preflight('https://evil.example')).headers.get('access-control-allow-origin'), null);
    assert.equal((await preflight('https://livingplus.com.evil.example')).headers.get('access-control-allow-origin'), null);
  });

  it('drops localhost origins in production and honours CORS_ORIGINS', async () => {
    const hardening = await import('../src/middleware/http-hardening.js');
    const keep = { env: process.env.NODE_ENV, extra: process.env.CORS_ORIGINS };
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://livingplus-web-abc123.a.run.app';
    try {
      assert.equal(hardening.isAllowedOrigin('http://localhost:5173'), false);
      assert.equal(hardening.isAllowedOrigin('https://livingplus-web-abc123.a.run.app'), true);
      assert.equal(hardening.isAllowedOrigin('https://admin.livingplus.com'), true);
      assert.equal(hardening.isAllowedOrigin(undefined), true, 'non-browser callers are not subject to CORS');
    } finally {
      if (keep.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = keep.env;
      if (keep.extra === undefined) delete process.env.CORS_ORIGINS; else process.env.CORS_ORIGINS = keep.extra;
    }
  });

  it('trusts one proxy hop on Cloud Run and loopback locally', async () => {
    const hardening = await import('../src/middleware/http-hardening.js');
    const keep = { k: process.env.K_SERVICE, t: process.env.TRUST_PROXY };
    try {
      delete process.env.TRUST_PROXY;
      delete process.env.K_SERVICE;
      assert.equal(hardening.trustProxySetting(), 'loopback');
      process.env.K_SERVICE = 'livingplus-api';
      assert.equal(hardening.trustProxySetting(), 1);
      process.env.TRUST_PROXY = '2';
      assert.equal(hardening.trustProxySetting(), 2);
    } finally {
      if (keep.k === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = keep.k;
      if (keep.t === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = keep.t;
    }
  });

  it('rate-limits AI chat per caller over HTTP', async () => {
    const send = (ip: string) => fetch(`${base}/api/pg/ai/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: '{}'
    });
    // The loopback test client is a trusted proxy, so X-Forwarded-For is the caller.
    for (let i = 0; i < 20; i += 1) assert.equal((await send('203.0.113.7')).status, 400, `request ${i + 1} reaches the handler`);
    const limited = await send('203.0.113.7');
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('ratelimit-policy'));
    assert.equal((await send('198.51.100.9')).status, 400, 'other callers are unaffected');
  });

  it('gives Google sign-in its own rate limit, separate from OTP verification', async () => {
    const post = (path: string) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.50' }, body: '{}' });
    for (let i = 0; i < 10; i += 1) await post('/api/auth/otp-verify');
    assert.equal((await post('/api/auth/otp-verify')).status, 429, 'OTP budget used up');
    assert.notEqual((await post('/api/auth/google')).status, 429, 'Google sign-in still allowed');
  });

  it('redacts secrets from structured logs', async () => {
    const { pino } = await import('pino');
    const { loggerOptions } = await import('../src/utils/logger.js');
    const lines: string[] = [];
    const log = pino({ ...loggerOptions, level: 'info' }, { write: (line: string) => { lines.push(line); } });
    log.info({ req: { headers: { authorization: 'Bearer abc' } }, body: { password: 'hunter2', otp: '123456' } }, 'login attempt');
    const entry = JSON.parse(lines[0]!);
    assert.equal(entry.severity, 'INFO');
    assert.equal(entry.message, 'login attempt');
    assert.equal(entry.req.headers.authorization, '[redacted]');
    assert.equal(entry.body.password, '[redacted]');
    assert.equal(entry.body.otp, '[redacted]');
  });
});

describe('scheduled jobs over HTTP (Cloud Scheduler)', () => {
  let base = '';
  let server: http.Server;
  before(async () => {
    const { default: app } = await import('../src/app.js');
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  after(() => { server?.close(); });

  const post = (path: string, token?: string) => fetch(`${base}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('is disabled unless a cron credential is configured', async () => {
    const keep = { s: process.env.CRON_SECRET, a: process.env.CRON_OIDC_AUDIENCE };
    delete process.env.CRON_SECRET; delete process.env.CRON_OIDC_AUDIENCE;
    try {
      assert.equal((await post('/internal/cron/monthly-rent', 'anything')).status, 404);
    } finally {
      if (keep.s !== undefined) process.env.CRON_SECRET = keep.s;
      if (keep.a !== undefined) process.env.CRON_OIDC_AUDIENCE = keep.a;
    }
  });

  it('rejects missing or wrong credentials, including forged OIDC tokens', async () => {
    process.env.CRON_SECRET = 'cron-test-secret-value';
    process.env.CRON_OIDC_AUDIENCE = 'https://api.example.test';
    try {
      assert.equal((await post('/internal/cron/monthly-rent')).status, 401);
      assert.equal((await post('/internal/cron/monthly-rent', 'wrong-secret')).status, 403);
      const forged = ['{"alg":"RS256","kid":"x"}', '{"aud":"https://api.example.test","email":"a@b.c","email_verified":true}']
        .map((part) => Buffer.from(part).toString('base64url')).join('.') + '.c2ln';
      assert.equal((await post('/internal/cron/monthly-rent', forged)).status, 403);
    } finally {
      delete process.env.CRON_SECRET; delete process.env.CRON_OIDC_AUDIENCE;
    }
  });

  it('runs the monthly rent and reminder jobs with the shared secret', async () => {
    process.env.CRON_SECRET = 'cron-test-secret-value';
    try {
      const rent = await post('/internal/cron/monthly-rent', 'cron-test-secret-value');
      assert.equal(rent.status, 200);
      const body = await rent.json() as any;
      assert.equal(body.job, 'monthly-rent');
      assert.match(body.period, /^\d{4}-\d{2}$/);
      assert.equal(typeof body.tenants, 'number');
      const again = await post('/internal/cron/monthly-rent', 'cron-test-secret-value');
      assert.equal(again.status, 200, 'the job is idempotent');
      const reminders = await post('/internal/cron/rent-reminders', 'cron-test-secret-value');
      assert.equal(reminders.status, 200);
      assert.equal((await reminders.json() as any).job, 'rent-reminders');
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('serves a plain health check for Cloud Run', async () => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

describe('model configuration', () => {
  it('stays unconfigured until the assistant is enabled and a model is set', async () => {
    await withEnv({ ENABLE_AI_ORCHESTRATOR: 'false' }, async () => {
      await assert.rejects(providerMod.createChatModel(), /AI_ORCHESTRATOR_NOT_CONFIGURED/);
      assert.equal((await providerMod.modelStatus()).configured, false);
    });
    await withEnv({ AI_MODEL: '' }, async () => {
      await assert.rejects(providerMod.createChatModel(), /AI_ORCHESTRATOR_NOT_CONFIGURED/);
    });
  });

  it('reports provider and model from a provider:model id', async () => {
    assert.deepEqual(providerMod.describeModel('google:gemini-3.8-flash'), { provider: 'google', name: 'gemini-3.8-flash' });
    assert.deepEqual(await providerMod.modelStatus(), { enabled: true, configured: true, provider: 'google', model: 'gemini-3.8-flash' });
  });

  it('resolves the VibeCheck ADK model from VIBECHECK_AI_MODEL or the google AI_MODEL', async () => {
    const agent = await import('../src/services/vibe-agent.js');
    assert.equal(agent.vibeModelName(), 'gemini-3.8-flash');
    assert.deepEqual(agent.vibeAiStatus(), { enabled: true, configured: true, model: 'gemini-3.8-flash' });
    await withEnv({ AI_MODEL: 'openai:gpt-5-mini' }, async () => {
      assert.equal(agent.vibeModelName(), null, 'only Gemini models run on ADK');
      assert.equal(agent.vibeAiStatus().configured, false);
    });
    await withEnv({ AI_MODEL: 'openai:gpt-5-mini', VIBECHECK_AI_MODEL: 'gemini-2.5-flash' }, async () => {
      assert.equal(agent.vibeModelName(), 'gemini-2.5-flash');
    });
    await withEnv({ AI_MODEL: '' }, async () => {
      assert.equal(agent.vibeModelName(), null);
    });
  });

  it('fails clearly when the provider is unsupported or options are invalid', async () => {
    await withEnv({ AI_MODEL: 'perplexity:sonar' }, async () => {
      await assert.rejects(providerMod.createChatModel(), /AI_MODEL_INIT_FAILED/);
      const status = await providerMod.modelStatus();
      assert.equal(status.configured, false);
      assert.equal(status.provider, 'perplexity');
    });
    await withEnv({ AI_MODEL_OPTIONS: '[1,2]' }, async () => {
      await assert.rejects(providerMod.createChatModel(), /AI_MODEL_INIT_FAILED: AI_MODEL_OPTIONS must be a JSON object/);
    });
  });

  it('uses AI_VOICE_MODEL for voice when set, else AI_MODEL', async () => {
    assert.equal(providerMod.modelConfig('voice').model, 'google:gemini-3.8-flash');
    await withEnv({ AI_VOICE_MODEL: 'google:gemini-3.5-flash-lite', AI_MODEL_OPTIONS: '{"temperature":0.1}' }, async () => {
      assert.equal(providerMod.modelConfig('voice').model, 'google:gemini-3.5-flash-lite');
      assert.deepEqual(providerMod.modelConfig('chat').options, { temperature: 0.1 });
    });
  });
});

describe('agent tracing', () => {
  it('sends no trace uploads: the optional tracers are gone', async () => {
    const bodies: string[] = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        bodies.push(Buffer.concat(chunks).toString('utf8'));
        res.setHeader('content-type', 'application/json');
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const vars = {
      LANGSMITH_TRACING: 'true',
      LANGSMITH_API_KEY: 'ls-test-key',
      LANGSMITH_ENDPOINT: `http://127.0.0.1:${(server.address() as any).port}`,
      LANGSMITH_PROJECT: 'livingplus-tests'
    };
    try {
      await withEnv(vars, async () => {
        const result = await orchestrator.runChat(guestReq(), stubProvider([{ text: 'Traced hello.' }]), { message: 'hi' });
        assert.equal(result.reply, 'Traced hello.');
      });
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(bodies.length, 0, 'no trace upload leaves the process');
    } finally {
      server.close();
    }
  });
});

describe('chat agent with the Google provider', () => {
  it('uses Vertex AI with the service account when enterprise mode is on (no API key)', async () => {
    const keep = {
      key: process.env.GOOGLE_API_KEY,
      genai: process.env.GOOGLE_GENAI_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      flag: process.env.GOOGLE_GENAI_USE_ENTERPRISE,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION
    };
    try {
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_GENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      process.env.GOOGLE_GENAI_USE_ENTERPRISE = 'true';
      process.env.GOOGLE_CLOUD_PROJECT = 'livingplus-test';
      process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';
      const model: any = await providerMod.createChatModel();
      assert.equal(model.backend, 'vertex-ai');
      assert.equal(model.model, 'gemini-3.8-flash');
      delete process.env.GOOGLE_GENAI_USE_ENTERPRISE;
      await assert.rejects(providerMod.createChatModel(), /AI_MODEL_INIT_FAILED/);
    } finally {
      for (const [env, value] of Object.entries({ GOOGLE_API_KEY: keep.key, GOOGLE_GENAI_API_KEY: keep.genai, GEMINI_API_KEY: keep.gemini, GOOGLE_GENAI_USE_ENTERPRISE: keep.flag, GOOGLE_CLOUD_PROJECT: keep.project, GOOGLE_CLOUD_LOCATION: keep.location })) {
        if (value === undefined) delete process.env[env]; else process.env[env] = value;
      }
    }
  });

  it('runs a tool round trip and echoes the Gemini thought signature', async () => {
    const api = fakeGemini([
      {
        candidates: [{
          content: {
            role: 'model', parts: [
              { functionCall: { id: 'fc_1', name: 'search_properties', args: { location: 'Sholinganallur' } }, thoughtSignature: 'sig-A' }
            ]
          }, finishReason: 'STOP'
        }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4, totalTokenCount: 15 }
      },
      { ...geminiText('I found PGs in Sholinganallur.'), usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 6, totalTokenCount: 26 } }
    ]);
    try {
      const model = await providerMod.createChatModel();
      const result = await orchestrator.runChat(guestReq(), model, { message: 'PGs in Sholinganallur?' });
      assert.equal(result.reply, 'I found PGs in Sholinganallur.');
      assert.deepEqual(result.toolCalls, ['search_properties']);
      assert.deepEqual(result.usage, { prompt_tokens: 20, completion_tokens: 6 });

      assert.equal(api.seen.length, 2);
      const [first, second] = api.seen;
      assert.match(first!.url, /\/models\/gemini-3\.8-flash:generateContent$/);
      assert.equal(first!.key, 'test-key');
      assert.ok(first!.body.systemInstruction.parts[0].text.includes('PG OS assistant'));
      const declared = first!.body.tools[0].functionDeclarations.map((d: any) => d.name);
      assert.ok(declared.includes('search_properties'));
      assert.ok(!declared.includes('create_maintenance_ticket'), 'guests never see resident tools');

      const modelTurn = second!.body.contents.find((c: any) => c.role === 'model');
      assert.equal(modelTurn.parts[0].thoughtSignature, 'sig-A');
      assert.equal(modelTurn.parts[0].functionCall.id, 'fc_1');
      const toolTurn = second!.body.contents[second!.body.contents.length - 1];
      assert.equal(toolTurn.role, 'user');
      assert.equal(toolTurn.parts[0].functionResponse.id, 'fc_1');
      assert.equal(toolTurn.parts[0].functionResponse.name, 'search_properties');
    } finally {
      api.restore();
    }
  });

  it('pauses sensitive tools for confirmation without executing them', async () => {
    const api = fakeGemini([
      {
        candidates: [{
          content: {
            role: 'model', parts: [
              { functionCall: { id: 'fc_9', name: 'send_rent_reminders', args: {} }, thoughtSignature: 'sig-B' }
            ]
          }, finishReason: 'STOP'
        }]
      }
    ]);
    try {
      const model = await providerMod.createChatModel();
      const result = await orchestrator.runChat(userReq(ids.owner), model, { message: 'remind everyone' });
      assert.equal(result.needsConfirmation?.tool, 'send_rent_reminders');
      assert.deepEqual(result.toolCalls, []);
      assert.equal(api.seen.length, 1, 'the model is not called again until the user confirms');
    } finally {
      api.restore();
    }
  });

  it('maps provider HTTP errors to MODEL_API_FAILED', async () => {
    const api = fakeGemini([new Response('{"error":{"code":400,"message":"bad request"}}', { status: 400, headers: { 'content-type': 'application/json' } })]);
    try {
      const model = await providerMod.createChatModel();
      await assert.rejects(orchestrator.runChat(guestReq(), model, { message: 'hi' }), /MODEL_API_FAILED/);
    } finally {
      api.restore();
    }
  });

  it('times out a hanging model endpoint', async () => {
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = (_input: any, init?: any) => new Promise((_resolve, reject) => {
      const signal: AbortSignal | undefined = init?.signal ?? (_input instanceof Request ? _input.signal : undefined);
      signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    try {
      await withEnv({ MODEL_API_TIMEOUT_MS: '1000' }, async () => {
        const model = await providerMod.createChatModel();
        await assert.rejects(orchestrator.runChat(guestReq(), model, { message: 'hi' }), /MODEL_API_FAILED/);
      });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('photo attachments', () => {
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('accepts a small JPEG/PNG/WebP photo', async () => {
    assert.equal(providerMod.parseImageDataUrl(pixel), pixel);
  });

  it('rejects unsupported types, bad payloads and oversized photos', async () => {
    assert.throws(() => providerMod.parseImageDataUrl('data:image/gif;base64,R0lGODdhAQABAIAAAP///////ywAAAAAAQABAAACAkQBADs='), /AI_IMAGE_INVALID/);
    assert.throws(() => providerMod.parseImageDataUrl('not-a-data-url'), /AI_IMAGE_INVALID/);
    assert.throws(() => providerMod.parseImageDataUrl(undefined), /AI_IMAGE_INVALID/);
    assert.throws(() => providerMod.parseImageDataUrl(`data:image/png;base64,${'A'.repeat(6 * 1024 * 1024)}`), /AI_IMAGE_INVALID/);
  });

  it('sends attached photos to the model as inline image data', async () => {
    const api = fakeGemini([geminiText('I see a leak.')]);
    try {
      const model = await providerMod.createChatModel();
      const result = await orchestrator.runChat(guestReq(), model, { message: 'what is wrong?', imageDataUrl: pixel });
      assert.equal(result.reply, 'I see a leak.');
      const parts = api.seen[0]!.body.contents[api.seen[0]!.body.contents.length - 1].parts;
      assert.deepEqual(parts[0], { text: 'what is wrong?' });
      assert.deepEqual(parts[1], { inlineData: { mimeType: 'image/png', data: pixel.split(',')[1] } });
    } finally {
      api.restore();
    }
  });
});

describe('voice transcription', () => {
  it('sends audio to the voice model and returns the trimmed transcript', async () => {
    const api = fakeGemini([geminiText('  fix the sink please  ')]);
    try {
      const text = await voice.transcribeAudio(Buffer.from([1, 2, 3, 4]), 'note.wav', 'audio/wav');
      assert.equal(text, 'fix the sink please');
      assert.match(api.seen[0]!.url, /\/models\/gemini-3\.8-flash:generateContent$/);
      const parts = api.seen[0]!.body.contents[0].parts;
      assert.ok(parts[0].text.startsWith('Transcribe this voice note'));
      assert.deepEqual(parts[1], { inlineData: { mimeType: 'audio/wav', data: Buffer.from([1, 2, 3, 4]).toString('base64') } });
    } finally {
      api.restore();
    }
  });

  it('rejects non-audio uploads without calling the API', async () => {
    let called = false;
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => { called = true; throw new Error('must not happen'); };
    try {
      await assert.rejects(voice.transcribeAudio(Buffer.from([1]), 'note.txt', 'text/plain'), /AI_VOICE_INVALID_AUDIO/);
      await assert.rejects(voice.transcribeAudio(Buffer.alloc(0), 'note.wav', 'audio/wav'), /AI_VOICE_INVALID_AUDIO/);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('refuses to transcribe when unconfigured and on empty transcripts', async () => {
    const keepEnabled = process.env.ENABLE_AI_ORCHESTRATOR;
    process.env.ENABLE_AI_ORCHESTRATOR = 'false';
    try {
      await assert.rejects(voice.transcribeAudio(Buffer.from([1]), 'note.wav', 'audio/wav'), /AI_ORCHESTRATOR_NOT_CONFIGURED/);
    } finally {
      process.env.ENABLE_AI_ORCHESTRATOR = keepEnabled;
    }
    const api = fakeGemini([geminiText('   ')]);
    try {
      await assert.rejects(voice.transcribeAudio(Buffer.from([1]), 'note.wav', 'audio/wav'), /AI_VOICE_EMPTY_TRANSCRIPT/);
    } finally {
      api.restore();
    }
  });
});

describe('rent reminders', () => {
  const calls: Array<{ to: string; params: string[] }> = [];
  const fakeSender = async (_event: any, to: string, params: string[] = []) => {
    calls.push({ to, params });
    return { sent: true as const };
  };

  it('sends reminders for open entries and stamps them', async () => {
    const summary = await reminders.sendDueRentReminders(prisma, { propertyIds: [ids.prop.id], actorId: ids.owner.id }, fakeSender);
    assert.equal(summary.total, 2);
    assert.equal(summary.sent, 2);
    assert.equal(summary.skipped, 0);
    assert.equal(calls.length, 2);
    const stamped = await prisma.pGRentEntry.count({ where: { tenant: { propertyId: ids.prop.id }, lastReminderAt: { not: null } } });
    assert.equal(stamped, 2);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await prisma.pHAuditLog.count({ where: { action: 'RENT_REMINDER_SENT' } }), 2);
  });

  it('throttles repeat runs unless forced', async () => {
    const quiet = await reminders.sendDueRentReminders(prisma, { propertyIds: [ids.prop.id] }, fakeSender);
    assert.equal(quiet.sent, 0);
    assert.ok(quiet.results.every((r: any) => r.outcome === 'throttled'));
    const forced = await reminders.sendDueRentReminders(prisma, { propertyIds: [ids.prop.id], force: true }, fakeSender);
    assert.equal(forced.sent, 2);
  });

  it('skips phoneless tenants and ignores settled entries', async () => {
    const ghost = await prisma.pGTenant.create({
      data: { propertyId: ids.prop.id, name: 'Ghost', phone: '', moveInDate: new Date('2026-09-01'), monthlyRent: 6000, status: 'ACTIVE' }
    });
    await prisma.pGRentEntry.create({ data: { tenantId: ghost.id, period: '2026-11', entryType: 'RENT', amount: 6000, paidAmount: 0, dueDate: new Date('2026-11-05'), status: 'DUE' } });
    await prisma.pGRentEntry.create({ data: { tenantId: ids.tenant.id, period: '2026-09', entryType: 'RENT', amount: 4000, paidAmount: 4000, dueDate: new Date('2026-09-05'), status: 'PAID' } });
    const before = calls.length;
    const summary = await reminders.sendDueRentReminders(prisma, { propertyIds: [ids.prop.id], force: true }, fakeSender);
    const outcomes = summary.results.map((r: any) => r.outcome);
    assert.ok(outcomes.includes('no-phone'));
    assert.ok(!summary.results.some((r: any) => r.period === '2026-09'));
    assert.equal(calls.length, before + 2);
  });

  it('respects the property scope', async () => {
    const stranger = await prisma.pGTenant.create({
      data: { propertyId: ids.other.id, name: 'Stranger', phone: '9400000055', moveInDate: new Date('2026-09-01'), monthlyRent: 5000, status: 'ACTIVE' }
    });
    const entry = await prisma.pGRentEntry.create({ data: { tenantId: stranger.id, period: '2026-11', entryType: 'RENT', amount: 5000, paidAmount: 0, dueDate: new Date('2026-11-05'), status: 'DUE' } });
    const before = calls.length;
    await reminders.sendDueRentReminders(prisma, { propertyIds: [ids.prop.id], force: true }, fakeSender);
    assert.ok(!calls.slice(before).some((c) => c.to.includes('9400000055')));
    assert.equal((await prisma.pGRentEntry.findUnique({ where: { id: entry.id } })).lastReminderAt, null);
  });

  it('records sender failures without crashing', async () => {
    const failing = async () => { throw new Error('transport down'); };
    const summary = await reminders.sendDueRentReminders(prisma, { propertyIds: [ids.other.id], force: true }, failing as any);
    assert.equal(summary.sent, 0);
    assert.ok(summary.results.every((r: any) => r.outcome === 'failed'));
  });

  it('runs through AI confirmation without leaking phone numbers', async () => {
    const provider = stubProvider([{ calls: [{ name: 'send_rent_reminders', args: {} }] }]);
    const prepared = await orchestrator.runChat(userReq(ids.owner), provider, { message: 'remind everyone about rent' });
    assert.ok(prepared.needsConfirmation);
    assert.match(prepared.needsConfirmation.preview, /rent-due/i);
    const done = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(done.reply, /^Done\./);
    assert.ok(!/\d{10}/.test(done.reply));
  });

  it('serves the owner endpoint over HTTP with authentication', async () => {
    const { default: app } = await import('../src/app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.on('listening', () => r()));
    const port = (server.address() as any).port;
    const readBody = async (res: any) => res.json();
    try {
      const denied = await fetch(`http://127.0.0.1:${port}/api/pg/owner/rent/reminders`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ force: true })
      });
      assert.equal(denied.status, 401);
      const token = jwt.sign({ userId: ids.owner.id, role: 'PG_OWNER' }, process.env.JWT_SECRET as string);
      const allowed = await fetch(`http://127.0.0.1:${port}/api/pg/owner/rent/reminders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force: true })
      });
      assert.equal(allowed.status, 200);
      const body = await readBody(allowed);
      assert.equal(typeof body.sent, 'number');
      assert.ok(body.total >= 2);
    } finally {
      server.close();
    }
  });
});

describe('chat authentication', () => {
  const callMiddleware = (headers: any = {}) => new Promise<any>((resolve) => {
    const req = { headers } as any;
    const res = {} as any;
    import('../src/middleware/auth.middleware.js').then(({ optionalAuthenticate }) => {
      optionalAuthenticate(req, res, () => resolve(req));
    });
  });

  it('attaches the user from a valid token', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign({ userId: ids.owner.id, role: 'PG_OWNER' }, process.env.JWT_SECRET as string);
    const req = await callMiddleware({ authorization: `Bearer ${token}` });
    assert.equal(req.user?.userId, ids.owner.id);
    assert.equal(req.user?.role, 'PG_OWNER');
  });

  it('continues as guest without a token or with a bad one', async () => {
    assert.equal((await callMiddleware()).user, undefined);
    assert.equal((await callMiddleware({ authorization: 'Bearer bogus' })).user, undefined);
  });
});

describe('production authentication configuration', () => {
  it('uses a random development secret and rejects missing or weak production secrets', async () => {
    const { getJwtSecret } = await import('../src/utils/auth-config.js');
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';
      const developmentSecret = getJwtSecret();
      assert.equal(developmentSecret.length, 64);
      assert.equal(getJwtSecret(), developmentSecret);

      process.env.NODE_ENV = 'production';
      assert.throws(() => getJwtSecret(), /at least 32 bytes/);
      process.env.JWT_SECRET = 'short';
      assert.throws(() => getJwtSecret(), /at least 32 bytes/);
      process.env.JWT_SECRET = 'production-test-secret-with-at-least-32-bytes';
      assert.equal(getJwtSecret(), process.env.JWT_SECRET);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });

  it('does not create or return a production OTP when SMS delivery is unconfigured', async () => {
    const { requestOtp } = await import('../src/controllers/pg-auth.controller.js');
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSmsUrl = process.env.SMS_API_URL;
    const phone = '919990001234';
    const before = await prisma.otpCode.count({ where: { phone, purpose: 'BOOKING' } });
    const response = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; }
    };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SMS_API_URL;
      await requestOtp({ body: { phone: '9990001234', purpose: 'BOOKING' } } as any, response as any);
      assert.equal(response.statusCode, 500);
      assert.equal((response.body as any)?.devCode, undefined);
      assert.equal(await prisma.otpCode.count({ where: { phone, purpose: 'BOOKING' } }), before);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSmsUrl === undefined) delete process.env.SMS_API_URL;
      else process.env.SMS_API_URL = previousSmsUrl;
    }
  });
});

describe('one-time OTP token consumption', () => {
  it('allows exactly one concurrent consumer', async () => {
    const { phone, token } = await otpFor('9660001234', 'single-use');
    const { consumePhoneToken } = await import('../src/controllers/pg-auth.controller.js');
    const normalizedPhone = phone.length === 10 ? `91${phone}` : phone;
    const results = await Promise.all([
      consumePhoneToken(normalizedPhone, token),
      consumePhoneToken(normalizedPhone, token)
    ]);
    assert.equal(results.filter(Boolean).length, 1);
  });
});

describe('OTP route throttling', () => {
  it('limits requests by client IP even when each request uses a different phone', async () => {
    const { default: app } = await import('../src/app.js');
    const previousFetch = globalThis.fetch;
    const previousSmsUrl = process.env.SMS_API_URL;
    globalThis.fetch = async (input, init) => {
      if (typeof input === 'string' && input.startsWith('https://sms.test/')) return new Response(null, { status: 200 });
      return previousFetch(input, init);
    };
    process.env.SMS_API_URL = 'https://sms.test/send';
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.on('listening', resolve));
    const port = (server.address() as any).port;
    try {
      const statuses: number[] = [];
      for (let index = 0; index < 6; index += 1) {
        const response = await fetch(`http://127.0.0.1:${port}/api/auth/otp-request`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phone: `96800000${String(index).padStart(2, '0')}` })
        });
        statuses.push(response.status);
      }
      assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    } finally {
      server.close();
      globalThis.fetch = previousFetch;
      if (previousSmsUrl === undefined) delete process.env.SMS_API_URL;
      else process.env.SMS_API_URL = previousSmsUrl;
    }
  });
});

describe('S3 image access', () => {
  it('requires authentication for uploads and KYC signing and limits public signing to gallery keys', async () => {
    const { default: app } = await import('../src/app.js');
    const jwt = (await import('jsonwebtoken')).default;
    await prisma.pGTenant.create({
      data: {
        propertyId: ids.prop.id, name: 'Private KYC Tenant', phone: '9670001234',
        kycDocumentUrl: 'uploads/private-test.pdf', moveInDate: new Date(), monthlyRent: 1000, status: 'ACTIVE'
      }
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.on('listening', resolve));
    const port = (server.address() as any).port;
    try {
      const upload = await fetch(`http://127.0.0.1:${port}/api/upload-s3`, { method: 'POST' });
      assert.equal(upload.status, 401);

      const privateImage = await fetch(`http://127.0.0.1:${port}/api/view-image/uploads%2Fprivate-test.pdf`);
      assert.equal(privateImage.status, 401);

      const tenantToken = jwt.sign({ userId: ids.tenantUser.id, role: 'PG_TENANT' }, process.env.JWT_SECRET as string);
      const tenantUpload = await fetch(`http://127.0.0.1:${port}/api/upload-s3`, {
        method: 'POST', headers: { Authorization: `Bearer ${tenantToken}` }
      });
      assert.equal(tenantUpload.status, 403);

      const ownerToken = jwt.sign({ userId: ids.owner.id, role: 'PG_OWNER' }, process.env.JWT_SECRET as string);
      const svgUpload = new FormData();
      svgUpload.append('image', new Blob(['<svg></svg>'], { type: 'image/svg+xml' }), 'test.svg');
      const unsupportedImage = await fetch(`http://127.0.0.1:${port}/api/upload-s3`, {
        method: 'POST', headers: { Authorization: `Bearer ${ownerToken}` }, body: svgUpload
      });
      assert.equal(unsupportedImage.status, 400);

      const outsiderToken = jwt.sign({ userId: ids.outsider.id, role: 'PG_OWNER' }, process.env.JWT_SECRET as string);
      const crossPropertyKyc = await fetch(`http://127.0.0.1:${port}/api/view-image/uploads%2Fprivate-test.pdf`, {
        headers: { Authorization: `Bearer ${outsiderToken}` }
      });
      // Row-Level Security hides another PG's resident record, so the document does not even exist for them.
      assert.equal(crossPropertyKyc.status, 404);

      const bulk = await fetch(`http://127.0.0.1:${port}/api/view-image/bulk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keys: ['uploads/private-test.pdf'] })
      });
      assert.equal(bulk.status, 200);
      const body = await bulk.json() as { urls: Record<string, string> };
      assert.deepEqual(body.urls, {});
    } finally {
      server.close();
    }
  });
});

describe('local filesystem media storage', () => {
  it('stores uploads privately and serves authorized gallery/KYC previews without S3', async () => {
    const { default: app } = await import('../src/app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const privateTenant = await prisma.pGTenant.create({
      data: {
        propertyId: ids.prop.id, name: 'Local KYC Tenant', phone: '9650001234',
        moveInDate: new Date(), monthlyRent: 1000, status: 'ACTIVE'
      }
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.on('listening', resolve));
    const port = (server.address() as any).port;
    const ownerToken = jwt.sign({ userId: ids.owner.id, role: 'PG_OWNER' }, process.env.JWT_SECRET as string);
    const outsiderToken = jwt.sign({ userId: ids.outsider.id, role: 'PG_OWNER' }, process.env.JWT_SECRET as string);
    const readBody = async (response: any) => response.json();

    try {
      const image = new FormData();
      image.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'gallery.png');
      const imageResponse = await fetch(`http://127.0.0.1:${port}/api/upload-s3`, {
        method: 'POST', headers: { Authorization: `Bearer ${ownerToken}` }, body: image
      });
      assert.equal(imageResponse.status, 200);
      const { fileKey: galleryKey } = await imageResponse.json() as { fileKey: string };
      assert.match(galleryKey, /^local\/[0-9a-f-]+\.webp$/i);
      const imageId = galleryKey.split('/')[1]!.replace(/\.webp$/, '');
      assert.ok(fs.existsSync(path.join(UPLOAD_TEST_DIR, `${imageId}.webp`)));
      await prisma.pGProperty.update({ where: { id: ids.prop.id }, data: { photoUrls: [galleryKey] } });

      const pdf = new FormData();
      pdf.append('image', new Blob([Buffer.from('%PDF-1.7\nLocal QA document\n%%EOF')], { type: 'application/pdf' }), 'identity.pdf');
      const pdfResponse = await fetch(`http://127.0.0.1:${port}/api/upload-s3`, {
        method: 'POST', headers: { Authorization: `Bearer ${ownerToken}` }, body: pdf
      });
      assert.equal(pdfResponse.status, 200);
      const { fileKey: kycKey } = await pdfResponse.json() as { fileKey: string };
      const pdfId = kycKey.split('/')[1]!.replace(/\.pdf$/, '');
      assert.ok(fs.existsSync(path.join(UPLOAD_TEST_DIR, `${pdfId}.pdf`)));
      await prisma.pGTenant.update({ where: { id: privateTenant.id }, data: { kycDocumentUrl: kycKey } });

      const galleryResponse = await fetch(`http://127.0.0.1:${port}/api/view-image/bulk`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keys: [galleryKey, kycKey, 'local/not-a-real-key.webp'] })
      });
      const gallery = await readBody(galleryResponse);
      assert.equal(galleryResponse.status, 200);
      assert.ok(gallery.urls[galleryKey]?.includes('/api/local-media/'));
      assert.equal(gallery.urls[kycKey], undefined);
      const imagePreview = await fetch(gallery.urls[galleryKey]);
      assert.equal(imagePreview.status, 200);
      assert.match(imagePreview.headers.get('content-type') || '', /image\/webp/);
      assert.equal(imagePreview.headers.get('cache-control'), 'private, no-store');

      const authorizedKyc = await fetch(`http://127.0.0.1:${port}/api/view-image/${encodeURIComponent(kycKey)}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      });
      const { viewUrl } = await readBody(authorizedKyc);
      assert.equal(authorizedKyc.status, 200);
      const pdfPreview = await fetch(viewUrl);
      assert.equal(pdfPreview.status, 200);
      assert.match(pdfPreview.headers.get('content-type') || '', /application\/pdf/);
      assert.match(await pdfPreview.text(), /Local QA document/);

      const deniedKyc = await fetch(`http://127.0.0.1:${port}/api/view-image/${encodeURIComponent(kycKey)}`, {
        headers: { Authorization: `Bearer ${outsiderToken}` }
      });
      // Row-Level Security hides another PG's resident record, so the document does not exist for them.
      assert.equal(deniedKyc.status, 404);
      const tampered = await fetch(viewUrl.slice(0, -1) + (viewUrl.endsWith('a') ? 'b' : 'a'));
      assert.equal(tampered.status, 403);
    } finally {
      server.close();
      await prisma.pGProperty.update({ where: { id: ids.prop.id }, data: { photoUrls: [] } });
      await prisma.pGTenant.delete({ where: { id: privateTenant.id } });
      fs.rmSync(UPLOAD_TEST_DIR, { recursive: true, force: true });
    }
  });
});

describe('check-in billing consistency', () => {
  it('uses the scheduled rent calculation and creates each current-period entry once', async () => {
    const property = await prisma.pGProperty.create({
      data: {
        name: 'Check-in Billing House', address: '3 Test Road', locality: 'Velachery', city: 'Chennai',
        rentDueDay: 14, amenities: [], houseRules: [], status: 'ACTIVE'
      }
    });
    await prisma.pGPropertyAccess.create({ data: { propertyId: property.id, userId: ids.owner.id, role: 'OWNER' } });
    const room = await prisma.pGRoom.create({
      data: { propertyId: property.id, roomNumber: '301', monthlyRent: 7000, maintenanceFee: 300, utilitiesSurcharge: 200, foodCharge: 800 }
    });
    const bed = await prisma.pGBed.create({ data: { roomId: room.id, label: 'Bed 1', status: 'RESERVED' } });
    const tenant = await prisma.pGTenant.create({
      data: {
        propertyId: property.id, bedId: bed.id, name: 'Billing Tenant', phone: '9690001234',
        moveInDate: new Date(), monthlyRent: 9000, status: 'RESERVED'
      }
    });
    const { checkInTenant } = await import('../src/controllers/pg.controller.js');
    const checkIn = async () => {
      const response = {
        statusCode: 200,
        body: undefined as any,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { this.body = body; return this; }
      };
      await checkInTenant({ params: { tenantId: tenant.id }, user: { userId: ids.owner.id, role: 'PG_OWNER' } } as any, response as any);
      return response;
    };

    const first = await checkIn();
    assert.equal(first.statusCode, 200);
    const period = periodOf();
    const rent = await prisma.pGRentEntry.findUnique({ where: { tenantId_period_entryType: { tenantId: tenant.id, period, entryType: 'RENT' } } });
    const food = await prisma.pGRentEntry.findUnique({ where: { tenantId_period_entryType: { tenantId: tenant.id, period, entryType: 'FOOD' } } });
    assert.equal(rent?.amount, 9500);
    assert.equal(inAppZone(rent!.dueDate).getDate(), 14);
    assert.equal(food?.amount, 800);

    const second = await checkIn();
    assert.equal(second.statusCode, 409);
    assert.equal(await prisma.pGRentEntry.count({ where: { tenantId: tenant.id, period, entryType: 'RENT' } }), 1);
    assert.equal(await prisma.pGRentEntry.count({ where: { tenantId: tenant.id, period, entryType: 'FOOD' } }), 1);
  });
});

describe('concurrent rent payments', () => {
  it('does not lose or over-apply simultaneous payments', async () => {
    const tenant = await prisma.pGTenant.create({
      data: {
        propertyId: ids.prop.id, name: 'Payment Tenant', phone: '9680001234',
        moveInDate: new Date(), monthlyRent: 1000, status: 'ACTIVE'
      }
    });
    const entry = await prisma.pGRentEntry.create({
      data: { tenantId: tenant.id, period: '2026-12', amount: 1000, dueDate: new Date('2026-12-05'), status: 'DUE' }
    });
    const { recordRentPayment } = await import('../src/controllers/pg.controller.js');
    const record = async () => {
      const response = {
        statusCode: 200,
        body: undefined as any,
        status(code: number) { this.statusCode = code; return this; },
        json(body: unknown) { this.body = body; return this; }
      };
      await recordRentPayment({
        params: { entryId: entry.id },
        body: { amount: 700, method: 'CASH' },
        user: { userId: ids.owner.id, role: 'PG_OWNER' }
      } as any, response as any);
      return response;
    };

    const results = await Promise.all([record(), record()]);
    const saved = await prisma.pGRentEntry.findUnique({ where: { id: entry.id } });
    assert.ok(results.some((result) => [200, 409].includes(result.statusCode)));
    assert.equal(saved?.paidAmount, 1000);
    assert.equal(saved?.status, 'PAID');
  });
});

describe('property expenses', () => {
  it('rejects invalid expense input precisely', async () => {
    const expenses = await import('../src/services/pg-expenses.js');
    assert.throws(() => expenses.validateExpenseInput({ propertyId: ids.prop.id, amount: -50 }), /INVALID_AMOUNT/);
    assert.throws(() => expenses.validateExpenseInput({ propertyId: ids.prop.id, amount: 100, category: 'YACHT' }), /INVALID_CATEGORY/);
    assert.throws(() => expenses.validateExpenseInput({ propertyId: ids.prop.id, amount: 100, spentOn: 'not-a-date' }), /INVALID_DATE/);
    await assert.rejects(expenses.createExpense(prisma, ids.owner.id, { propertyId: 'missing', amount: 100 }), /PROPERTY_NOT_FOUND/);
  });

  it('records expenses with audit and totals them by category', async () => {
    const expenses = await import('../src/services/pg-expenses.js');
    await expenses.createExpense(prisma, ids.owner.id, { propertyId: ids.prop.id, category: 'food', amount: 2000, spentOn: '2026-11-02', note: 'Groceries' });
    await expenses.createExpense(prisma, ids.owner.id, { propertyId: ids.prop.id, category: 'STAFF', amount: 5000, spentOn: '2026-11-03' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await prisma.pHAuditLog.count({ where: { action: 'EXPENSE_CREATED' } }), 2);
    const all = await expenses.listExpenses(prisma, [ids.prop.id]);
    assert.equal(all.total, 7000);
    assert.deepEqual(all.byCategory, { FOOD: 2000, STAFF: 5000 });
    const nov = await expenses.listExpenses(prisma, [ids.prop.id], '2026-11');
    assert.equal(nov.total, 7000);
    const oct = await expenses.listExpenses(prisma, [ids.prop.id], '2026-10');
    assert.equal(oct.total, 0);
  });

  it('enforces scope on expense deletion', async () => {
    const expenses = await import('../src/services/pg-expenses.js');
    const row = await expenses.createExpense(prisma, ids.owner.id, { propertyId: ids.prop.id, amount: 999 });
    await assert.rejects(expenses.deleteExpense(prisma, ids.outsider.id, row.id, []), /FORBIDDEN/);
    await assert.rejects(expenses.deleteExpense(prisma, ids.owner.id, 'missing-id', [ids.prop.id]), /EXPENSE_NOT_FOUND/);
    await expenses.deleteExpense(prisma, ids.owner.id, row.id, [ids.prop.id]);
    assert.equal(await prisma.pGExpense.findUnique({ where: { id: row.id } }), null);
  });

  it('logs an expense through AI confirmation', async () => {
    const provider = stubProvider([{ calls: [{ name: 'log_expense', args: { property_id: ids.prop.id, category: 'MAINTENANCE', amount: 1200, spent_on: '2026-11-04', note: 'Tap washer' } }] }]);
    const prepared = await orchestrator.runChat(userReq(ids.owner), provider, { message: 'log 1200 for tap repair' });
    assert.ok(prepared.needsConfirmation);
    assert.match(prepared.needsConfirmation.preview, /1200/);
    const done = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(done.reply, /^Done\./);
    const row = await prisma.pGExpense.findFirst({ where: { propertyId: ids.prop.id, amount: 1200 } });
    assert.ok(row && row.category === 'MAINTENANCE');
  });

  it('refuses AI expense writes outside the caller scope', async () => {
    await assert.rejects(
      tools.toolCatalogue.log_expense.execute(
        { userId: ids.outsider.id, role: 'PG_OWNER', phones: [], propertyIds: [] },
        { property_id: ids.prop.id, amount: 50 }),
      /FORBIDDEN/);
  });

  it('summarizes expenses for owners without touching the ledger', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id] };
    const summary: any = await tools.toolCatalogue.get_expense_summary.execute(actor, { period: '2026-11' });
    assert.ok(summary.total >= 8200);
    assert.equal(summary.by_category.FOOD, 2000);
    const count = await prisma.pGExpense.count({});
    assert.ok(count >= 3);
  });

  it('serves expense endpoints over HTTP with authentication', async () => {
    const { default: app } = await import('../src/app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.on('listening', () => r()));
    const port = (server.address() as any).port;
    const readBody = async (res: any) => res.json();
    const post = (token?: string, payload: any = {}) => fetch(`http://127.0.0.1:${port}/api/pg/owner/expenses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload)
    });
    try {
      assert.equal((await post(undefined, { propertyId: ids.prop.id, amount: 10 })).status, 401);
      const token = jwt.sign({ userId: ids.owner.id, role: 'PG_OWNER' }, process.env.JWT_SECRET as string);
      const bad = await post(token, { propertyId: ids.prop.id, amount: -5 });
      assert.equal(bad.status, 400);
      const created = await post(token, { propertyId: ids.prop.id, category: 'UTILITIES', amount: 750, note: 'Water tanker' });
      assert.equal(created.status, 201);
      const listed = await fetch(`http://127.0.0.1:${port}/api/pg/owner/expenses?period=2026-11`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(listed.status, 200);
      const body = await readBody(listed);
      assert.ok(body.total >= 750);
      assert.ok(Array.isArray(body.entries));
    } finally {
      server.close();
    }
  });
});

describe('electricity billing and food charges', () => {
  it('splits one bill equally across occupied beds whatever the sharing', async () => {
    const billing = await import('../src/services/pg-billing.js');
    const solo = await prisma.pGRoom.create({ data: { propertyId: ids.other.id, roomNumber: 'S1', roomType: 'SINGLE', monthlyRent: 15000, status: 'ACTIVE' } });
    const dorm = await prisma.pGRoom.create({ data: { propertyId: ids.other.id, roomNumber: 'D1', roomType: 'SHARED', monthlyRent: 5000, status: 'ACTIVE' } });
    const soloBed = await prisma.pGBed.create({ data: { roomId: solo.id, label: 'Bed 1', status: 'OCCUPIED' } });
    await prisma.pGTenant.create({ data: { propertyId: ids.other.id, bedId: soloBed.id, name: 'Solo', phone: '9500000001', moveInDate: new Date('2026-10-01'), monthlyRent: 15000, status: 'ACTIVE' } });
    for (let i = 1; i <= 5; i += 1) {
      const bed = await prisma.pGBed.create({ data: { roomId: dorm.id, label: `Bed ${i}`, status: 'OCCUPIED' } });
      await prisma.pGTenant.create({ data: { propertyId: ids.other.id, bedId: bed.id, name: `Dorm${i}`, phone: `95000000${10 + i}`, moveInDate: new Date('2026-10-01'), monthlyRent: 5000, status: 'ACTIVE' } });
    }
    const split = await billing.computeElectricitySplit(prisma, ids.other.id, 1200);
    assert.equal(split.occupiedBeds, 6);
    assert.ok(split.rows.every((r: any) => r.share === 200));
  });

  it('rounds shares so the parts always equal the bill', async () => {
    const billing = await import('../src/services/pg-billing.js');
    const split = await billing.computeElectricitySplit(prisma, ids.other.id, 1000);
    assert.equal(split.rows.reduce((t: number, r: any) => t + r.share, 0), 1000);
    assert.deepEqual(split.rows.map((r: any) => r.share).sort((a: number, b: number) => a - b), [166, 166, 167, 167, 167, 167]);
  });

  it('absorbs vacant beds into the owner share and refuses empty houses', async () => {
    const billing = await import('../src/services/pg-billing.js');
    const prop = await prisma.pGProperty.create({ data: { name: 'Half Empty', address: 'x', locality: 'Velachery', city: 'Chennai', genderPolicy: 'ANY', amenities: [], houseRules: [], status: 'ACTIVE' } });
    const room = await prisma.pGRoom.create({ data: { propertyId: prop.id, roomNumber: '101', monthlyRent: 8000, status: 'ACTIVE' } });
    const taken = await prisma.pGBed.create({ data: { roomId: room.id, label: 'Bed 1', status: 'OCCUPIED' } });
    await prisma.pGBed.create({ data: { roomId: room.id, label: 'Bed 2', status: 'AVAILABLE' } });
    await prisma.pGTenant.create({ data: { propertyId: prop.id, bedId: taken.id, name: 'Half', phone: '9500000099', moveInDate: new Date('2026-10-01'), monthlyRent: 8000, status: 'ACTIVE' } });
    const split = await billing.computeElectricitySplit(prisma, prop.id, 900);
    assert.equal(split.rows.length, 1);
    assert.equal(split.rows[0]!.share, 900);
    assert.equal(split.ownerAbsorbed, 450);
    const ghost = await prisma.pGProperty.create({ data: { name: 'Empty', address: 'y', locality: 'Velachery', city: 'Chennai', genderPolicy: 'ANY', amenities: [], houseRules: [], status: 'ACTIVE' } });
    const groom = await prisma.pGRoom.create({ data: { propertyId: ghost.id, roomNumber: '101', monthlyRent: 8000, status: 'ACTIVE' } });
    await prisma.pGBed.create({ data: { roomId: groom.id, label: 'Bed 1', status: 'AVAILABLE' } });
    await assert.rejects(billing.computeElectricitySplit(prisma, ghost.id, 500), /NO_OCCUPANTS/);
  });

  it('approves a bill exactly once into ledger entries', async () => {
    const billing = await import('../src/services/pg-billing.js');
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id] };
    const bill = await billing.proposeElectricityBill(prisma, ids.owner.id, { propertyId: ids.prop.id, period: '2026-12', totalAmount: 2400 });
    assert.equal(bill.status, 'DRAFT');
    assert.ok(JSON.parse(bill.splitJson).length >= 1);
    const first = await billing.approveElectricityBill(prisma, ids.owner.id, bill.id, actor.propertyIds);
    assert.equal(first.bill.status, 'APPROVED');
    assert.ok(first.entries >= 1);
    const second = await billing.approveElectricityBill(prisma, ids.owner.id, bill.id, actor.propertyIds);
    assert.equal(second.entries, first.entries);
    const amounts = await prisma.pGRentEntry.findMany({ where: { tenant: { propertyId: ids.prop.id }, period: '2026-12', entryType: 'ELECTRICITY' } });
    assert.equal(amounts.reduce((t: number, e: any) => t + e.amount, 0), 2400);
    await assert.rejects(billing.proposeElectricityBill(prisma, ids.owner.id, { propertyId: ids.prop.id, period: '2026-12', totalAmount: 100 }), /ALREADY_BILLED/);
    await assert.rejects(billing.approveElectricityBill(prisma, ids.outsider.id, bill.id, []), /FORBIDDEN/);
  });

  it('generates food entries only for opted-in tenants of food rooms', async () => {
    await prisma.pGRoom.update({ where: { id: ids.roomB.id }, data: { foodCharge: 1500 } });
    const spare = await prisma.pGBed.create({ data: { roomId: ids.roomA.id, label: 'Bed 9', status: 'OCCUPIED' } });
    await prisma.pGTenant.create({ data: { propertyId: ids.prop.id, bedId: spare.id, name: 'NoMeals', phone: '9500000077', moveInDate: new Date('2026-10-01'), monthlyRent: 8000, status: 'ACTIVE', foodOptOut: true } });
    const scheduler = await import('../src/services/pg-rent-scheduler.js');
    await scheduler.generateMonthlyRentEntries(prisma, new Date('2026-12-15T00:00:00Z'));
    const foods = await prisma.pGRentEntry.findMany({ where: { period: '2026-12', entryType: 'FOOD' }, include: { tenant: { select: { name: true } } } });
    assert.ok(foods.some((f: any) => f.tenant.name === 'Spec Tenant' && f.amount === 1500));
    assert.ok(!foods.some((f: any) => f.tenant.name === 'NoMeals'));
    await scheduler.generateMonthlyRentEntries(prisma, new Date('2026-12-15T00:00:00Z'));
    assert.equal(await prisma.pGRentEntry.count({ where: { period: '2026-12', entryType: 'FOOD' } }), foods.length);
  });

  it('proposes and approves a bill through AI confirmation', async () => {
    const proposeProvider = stubProvider([{ calls: [{ name: 'propose_electricity_split', args: { property_id: ids.prop.id, period: '2027-01', total_amount: 1500 } }] }]);
    const proposal = await orchestrator.runChat(userReq(ids.owner), proposeProvider, { message: 'split the January electricity bill of 1500' });
    assert.ok(!proposal.needsConfirmation);
    const bill = await prisma.pGElectricityBill.findFirst({ where: { propertyId: ids.prop.id, period: '2027-01' } });
    const confirmer = stubProvider([{ calls: [{ name: 'approve_electricity_bill', args: { bill_id: bill.id } }] }]);
    const prepared = await orchestrator.runChat(userReq(ids.owner), confirmer, { message: 'approve it' });
    assert.ok(prepared.needsConfirmation);
    assert.equal(prepared.needsConfirmation.tool, 'approve_electricity_bill');
    const done = await orchestrator.runChat(userReq(ids.owner), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(done.reply, /^Done\./);
    assert.ok((await prisma.pGRentEntry.findMany({ where: { tenant: { propertyId: ids.prop.id }, period: '2027-01', entryType: 'ELECTRICITY' } })).length >= 1);
  });

  it('lets a tenant set their own meal preference, and no one else’s', async () => {
    const provider = stubProvider([{ calls: [{ name: 'set_meal_preference', args: { opt_out: true } }] }]);
    const prepared = await orchestrator.runChat(userReq(ids.tenantUser), provider, { message: 'I want to opt out of food' });
    assert.ok(prepared.needsConfirmation);
    const done = await orchestrator.runChat(userReq(ids.tenantUser), stubProvider([]), { message: 'yes', confirmationId: prepared.needsConfirmation.confirmationId });
    assert.match(done.reply, /^Done\./);
    assert.equal((await prisma.pGTenant.findFirst({ where: { name: 'Spec Tenant' } })).foodOptOut, true);
    await assert.rejects(
      tools.toolCatalogue.set_meal_preference.execute(guestActor, { opt_out: false }),
      /NO_TENANT_RECORD/);
    const otherHostActor = await tools.actorFromRequest({ ...userReq(ids.tenantUser), pgPropertyId: ids.other.id });
    assert.deepEqual(otherHostActor.propertyIds, []);
    await assert.rejects(
      tools.toolCatalogue.set_meal_preference.execute(otherHostActor, { opt_out: false }),
      /NO_TENANT_RECORD/);
  });

  it('serves electricity bills over HTTP with authentication', async () => {
    const { default: app } = await import('../src/app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.on('listening', () => r()));
    const port = (server.address() as any).port;
    const readBody = async (res: any) => res.json();
    try {
      const denied = await fetch(`http://127.0.0.1:${port}/api/pg/owner/electricity/bills`, { method: 'GET' });
      assert.equal(denied.status, 401);
      const token = jwt.sign({ userId: ids.owner.id, role: 'PG_OWNER' }, process.env.JWT_SECRET as string);
      const auth = { Authorization: `Bearer ${token}` };
      const bad = await fetch(`http://127.0.0.1:${port}/api/pg/owner/electricity/bills`, {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ propertyId: ids.prop.id, period: '2027-02', totalAmount: -10 })
      });
      assert.equal(bad.status, 400);
      const created = await fetch(`http://127.0.0.1:${port}/api/pg/owner/electricity/bills`, {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ propertyId: ids.prop.id, period: '2027-02', totalAmount: 1800 })
      });
      assert.equal(created.status, 201);
      const draft = await readBody(created);
      assert.ok(draft.split.rows.length >= 1);
      const approved = await fetch(`http://127.0.0.1:${port}/api/pg/owner/electricity/bills/${draft.id}/approve`, {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({})
      });
      assert.equal(approved.status, 200);
      const result = await readBody(approved);
      assert.equal(result.bill.status, 'APPROVED');
      assert.ok(result.entries >= 1);
    } finally {
      server.close();
    }
  });
});

describe('workspace isolation enforced by PostgreSQL (Row-Level Security)', () => {
  // Every query here deliberately leaves out any PG filter: only the database stops it.
  const asUser = (context: Record<string, unknown>, fn: () => Promise<any>): Promise<any> => dbContext.runAsDbUser(context as any, fn);
  // Fresh workspaces: earlier suites change access on the shared fixtures.
  const iso: Record<string, any> = {};
  before(async () => {
    iso.ownerA = await prisma.user.create({ data: { phone: '9811100001', password: 'x', name: 'Iso Owner A', role: 'PG_OWNER' } });
    iso.ownerB = await prisma.user.create({ data: { phone: '9811100002', password: 'x', name: 'Iso Owner B', role: 'PG_OWNER' } });
    iso.residentUser = await prisma.user.create({ data: { phone: '9811100003', password: 'x', name: 'Iso Resident', role: 'PG_TENANT' } });
    iso.prop = await prisma.pGProperty.create({ data: { name: 'Iso House A', address: '1 Iso Rd', locality: 'Adyar', city: 'Chennai', genderPolicy: 'ANY', status: 'ACTIVE' } as any });
    iso.other = await prisma.pGProperty.create({ data: { name: 'Iso House B', address: '2 Iso Rd', locality: 'Guindy', city: 'Chennai', genderPolicy: 'ANY', status: 'ACTIVE' } as any });
    await prisma.pGPropertyAccess.create({ data: { propertyId: iso.prop.id, userId: iso.ownerA.id, role: 'OWNER' } });
    await prisma.pGPropertyAccess.create({ data: { propertyId: iso.other.id, userId: iso.ownerB.id, role: 'OWNER' } });
    iso.roomA = await prisma.pGRoom.create({ data: { propertyId: iso.prop.id, roomNumber: '1', roomType: 'SHARED', monthlyRent: 5000, status: 'ACTIVE' } });
    const roomB = await prisma.pGRoom.create({ data: { propertyId: iso.other.id, roomNumber: '1', roomType: 'SHARED', monthlyRent: 5000, status: 'ACTIVE' } });
    const bedA = await prisma.pGBed.create({ data: { roomId: iso.roomA.id, label: 'Bed 1', status: 'OCCUPIED' } });
    iso.otherBed = await prisma.pGBed.create({ data: { roomId: roomB.id, label: 'Bed 1', status: 'AVAILABLE' } });
    iso.tenant = await prisma.pGTenant.create({ data: { propertyId: iso.prop.id, bedId: bedA.id, name: 'Iso Resident', phone: '9811100003', moveInDate: new Date('2026-10-01'), monthlyRent: 5000, status: 'ACTIVE' } });
    iso.otherTenant = await prisma.pGTenant.create({ data: { propertyId: iso.other.id, name: 'Other Resident', phone: '9811100004', moveInDate: new Date('2026-10-01'), monthlyRent: 5000, status: 'ACTIVE' } });
    await prisma.pGRentEntry.create({ data: { tenantId: iso.tenant.id, period: '2026-11', entryType: 'RENT', amount: 5000, dueDate: new Date('2026-11-05') } });
    iso.otherTicket = await prisma.pGMaintenanceTicket.create({ data: { propertyId: iso.other.id, title: 'Other', description: 'x', category: 'OTHER', status: 'OPEN' } });
    await prisma.pGExpense.create({ data: { propertyId: iso.prop.id, category: 'OTHER', amount: 100, spentOn: new Date('2026-11-02'), note: 'Iso expense' } });
  });
  const owner = () => ({ userId: iso.ownerA.id, role: 'PG_OWNER' });
  const outsider = () => ({ userId: iso.ownerB.id, role: 'PG_OWNER' });
  const resident = () => ({ userId: iso.residentUser.id, role: 'PG_TENANT', tokenPropertyId: iso.prop.id });

  it('runs requests as a role that owns nothing and cannot bypass RLS', async () => {
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'livingplus_app'`);
    assert.deepEqual(rows, [{ rolsuper: false, rolbypassrls: false }]);
    const current: any[] = await asUser(owner(), () => prisma.$queryRawUnsafe('SELECT current_user AS role'));
    assert.equal(current[0].role, 'livingplus_app');
  });

  it('shows an owner only their own PG, even with no WHERE clause', async () => {
    const tenants = await asUser(owner(), () => prisma.pGTenant.findMany());
    assert.ok(tenants.length > 0);
    assert.ok(tenants.every((t: any) => t.propertyId === iso.prop.id));
    const tickets = await asUser(owner(), () => prisma.pGMaintenanceTicket.findMany());
    assert.ok(!tickets.some((t: any) => t.id === iso.otherTicket.id), 'another PG\'s ticket leaked');
  });

  it('shows an owner of another PG none of this PG\'s private data', async () => {
    const [tenants, rent, tickets, access] = await asUser(outsider(), () => Promise.all([
      prisma.pGTenant.findMany({ where: { propertyId: iso.prop.id } }),
      prisma.pGRentEntry.findMany({ where: { propertyId: iso.prop.id } }),
      prisma.pGMaintenanceTicket.findMany({ where: { propertyId: iso.prop.id } }),
      prisma.pGPropertyAccess.findMany({ where: { propertyId: iso.prop.id } })
    ]));
    assert.deepEqual([tenants.length, rent.length, tickets.length, access.length], [0, 0, 0, 0]);
  });

  it('refuses writes into another PG', async () => {
    const renamed = await asUser(outsider(), () => prisma.pGProperty.updateMany({ where: { id: iso.prop.id }, data: { name: 'Hijacked' } }));
    assert.equal(renamed.count, 0);
    await assert.rejects(asUser(outsider(), () => prisma.pGMaintenanceTicket.create({
      data: { propertyId: iso.prop.id, title: 'Injected', description: 'x', category: 'OTHER', status: 'OPEN' }
    })), /row-level security/i);
    await assert.rejects(asUser(outsider(), () => prisma.pGPropertyAccess.create({
      data: { propertyId: iso.prop.id, userId: iso.ownerB.id, role: 'OWNER' }
    })), /row-level security/i, 'nobody can grant themselves access to a PG');
  });

  it('lets a resident see their PG but not its staff-only data or other PGs', async () => {
    const stays = await asUser(resident(), () => prisma.pGTenant.findMany());
    assert.ok(stays.length > 0 && stays.every((t: any) => t.propertyId === iso.prop.id));
    const [bookings, expenses, tickets] = await asUser(resident(), () => Promise.all([
      prisma.pGBooking.findMany(), prisma.pGExpense.findMany(), prisma.pGMaintenanceTicket.findMany({ where: { id: iso.otherTicket.id } })
    ]));
    assert.deepEqual([bookings.length, expenses.length, tickets.length], [0, 0, 0]);
  });

  it('limits a staff session to the PG the request is scoped to', async () => {
    const tenants = await asUser({ ...owner(), hostPropertyId: iso.other.id }, () => prisma.pGTenant.findMany());
    assert.equal(tenants.length, 0);
  });

  it('gives guests published listings only', async () => {
    const hidden = await prisma.pGProperty.create({ data: { name: 'Unpublished House', address: '9 Test Rd', locality: 'Adyar', city: 'Chennai', genderPolicy: 'ANY', status: 'INACTIVE' } as any });
    const [properties, rooms, tenants, rent] = await asUser({}, () => Promise.all([
      prisma.pGProperty.findMany({ select: { id: true } }), prisma.pGRoom.findMany({ where: { propertyId: iso.prop.id } }),
      prisma.pGTenant.findMany(), prisma.pGRentEntry.findMany()
    ]));
    assert.ok(properties.some((p: any) => p.id === iso.prop.id));
    assert.ok(!properties.some((p: any) => p.id === hidden.id), 'unpublished PG visible to guests');
    assert.ok(rooms.length > 0);
    assert.deepEqual([tenants.length, rent.length], [0, 0]);
  });

  it('blocks rows that point at another PG, even for that PG\'s own owner', async () => {
    await assert.rejects(asUser(owner(), () => prisma.pGTenant.create({
      data: { propertyId: iso.prop.id, bedId: iso.otherBed.id, name: 'Cross Link', phone: '9333300000', moveInDate: new Date(), monthlyRent: 1000 }
    })), /same PG/);
  });

  it('derives the workspace of beds and rent entries from their parent, ignoring the client', async () => {
    const entry = await prisma.pGRentEntry.create({
      data: { tenantId: iso.tenant.id, propertyId: iso.other.id, period: '2031-01', entryType: 'RENT', amount: 1, dueDate: new Date('2031-01-05') } as any
    });
    assert.equal(entry.propertyId, iso.prop.id);
    const bed = await prisma.pGBed.create({ data: { roomId: iso.roomA.id, label: 'Derived', propertyId: iso.other.id } as any });
    assert.equal(bed.propertyId, iso.prop.id);
  });

  it('protects every table that holds PG data (new tables must add a policy)', async () => {
    const unprotected: any[] = await prisma.$queryRawUnsafe(`
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'propertyId' AND NOT a.attisdropped
      WHERE c.relkind = 'r' AND (NOT c.relrowsecurity OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
      ORDER BY 1`);
    assert.deepEqual(unprotected.map((r) => r.relname).filter((name) => name !== 'OtpCode'), []);
  });

  it('runs HTTP requests under RLS: an owner cannot read another PG\'s tenants through the API', async () => {
    const { default: app } = await import('../src/app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const { getJwtSecret } = await import('../src/utils/auth-config.js');
    const server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    try {
      const token = jwt.sign({ userId: iso.ownerB.id, role: 'PG_OWNER' }, getJwtSecret());
      const res = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/pg/owner/tenants?propertyId=${iso.prop.id}`, { headers: { authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => null) as any;
      const rows = Array.isArray(body) ? body : Array.isArray(body?.tenants) ? body.tenants : [];
      assert.ok(!rows.some((t: any) => t.propertyId === iso.prop.id), 'tenant rows leaked across PGs');
    } finally {
      server.close();
    }
  });
});

describe('guest booking requests need a verified phone', () => {
  let base = '';
  let server: http.Server;
  let token: (phone: string) => string;
  const victim = '9822200001';
  const attacker = '9822200002';
  let ref = '';

  before(async () => {
    const { default: app } = await import('../src/app.js');
    ({ issueGuestToken: token } = await import('../src/utils/guest-token.js'));
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    ref = `PG-GUEST-${Date.now()}`;
    await prisma.pGBooking.create({ data: { propertyId: ids.prop.id, bookingRef: ref, residentName: 'Victim Guest', phone: `91${victim}`, moveInDate: new Date('2026-12-20'), status: 'PENDING' } });
  });
  after(() => { server?.close(); });

  const mine = (headers: Record<string, string> = {}, query = '') => fetch(`${base}/api/pg/bookings/mine${query}`, { headers });
  const cancel = (headers: Record<string, string> = {}) => fetch(`${base}/api/pg/bookings/${ref}/cancel`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ phone: victim })
  });

  it('refuses to list requests for a typed phone number', async () => {
    assert.equal((await mine({}, `?phone=${victim}`)).status, 401);
  });

  it('lists only the verified number\'s requests, ignoring ?phone=', async () => {
    const theirs = await (await mine({ 'x-guest-token': token(attacker) }, `?phone=${victim}`)).json() as any[];
    assert.ok(!theirs.some((b) => b.bookingRef === ref), 'another number\'s booking leaked');
    const own = await (await mine({ 'x-guest-token': token(`91${victim}`) })).json() as any[];
    assert.ok(own.some((b) => b.bookingRef === ref));
  });

  it('rejects staff tokens, forged tokens and expired sessions as guest proof', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { getJwtSecret } = await import('../src/utils/auth-config.js');
    const staff = jwt.sign({ userId: ids.owner.id, role: 'PG_OWNER', phone: victim, typ: 'guest' }, getJwtSecret());
    const forged = jwt.sign({ typ: 'guest', phone: victim }, 'not-the-secret', { audience: 'livingplus-guest' });
    const expired = jwt.sign({ typ: 'guest', phone: victim }, getJwtSecret(), { audience: 'livingplus-guest', expiresIn: -10 });
    for (const bad of [staff, forged, expired]) assert.equal((await mine({ 'x-guest-token': bad })).status, 401);
  });

  it('lets only the verified owner of the number cancel', async () => {
    assert.equal((await cancel()).status, 401, 'a typed phone number is not proof');
    assert.equal((await cancel({ 'x-guest-token': token(attacker) })).status, 404, 'other numbers must not learn the request exists');
    assert.equal((await prisma.pGBooking.findUnique({ where: { bookingRef: ref } }))!.status, 'PENDING');
    assert.equal((await cancel({ 'x-guest-token': token(victim) })).status, 200);
    assert.equal((await prisma.pGBooking.findUnique({ where: { bookingRef: ref } }))!.status, 'CANCELLED');
  });
});

describe('VibeCheck roommate matching', () => {
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const early = { sleep: 0, wake: 0, tidiness: 0, noise: 0, guests: 0, kitchen: 1, schedule: 0, cooling: 1 };
  const night = { sleep: 2, wake: 2, tidiness: 2, noise: 2, guests: 2, kitchen: 1, schedule: 2, cooling: 1 };
  const vibe: Record<string, any> = {};
  let base = '';
  let server: http.Server;

  before(async () => {
    vibe.shared = await import('@livingplus/shared');
    vibe.pg = await import('../src/controllers/pg.controller.js');
    vibe.prop = await prisma.pGProperty.create({ data: { name: 'Vibe House', address: '3 Vibe Rd', locality: 'Adyar', city: 'Chennai', genderPolicy: 'ANY', status: 'ACTIVE' } as any });
    vibe.room = await prisma.pGRoom.create({ data: { propertyId: vibe.prop.id, roomNumber: 'V1', roomType: 'DOUBLE', monthlyRent: 7000, status: 'ACTIVE' } });
    vibe.emptyRoom = await prisma.pGRoom.create({ data: { propertyId: vibe.prop.id, roomNumber: 'V2', roomType: 'DOUBLE', monthlyRent: 7000, status: 'ACTIVE' } });
    const taken = await prisma.pGBed.create({ data: { roomId: vibe.room.id, label: 'Bed 1', status: 'OCCUPIED' } });
    vibe.freeBed = await prisma.pGBed.create({ data: { roomId: vibe.room.id, label: 'Bed 2', status: 'AVAILABLE' } });
    vibe.emptyBed = await prisma.pGBed.create({ data: { roomId: vibe.emptyRoom.id, label: 'Bed 1', status: 'AVAILABLE' } });
    vibe.user = await prisma.user.create({ data: { phone: '9877700001', password: 'x', name: 'Vibe Resident', role: 'PG_TENANT' } });
    vibe.tenant = await prisma.pGTenant.create({ data: { propertyId: vibe.prop.id, bedId: taken.id, name: 'Kavya Iyer', phone: '9877700001', moveInDate: new Date(), monthlyRent: 7000, status: 'ACTIVE', vibeAnswers: early } });
    const { default: app } = await import('../src/app.js');
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  after(() => { server?.close(); });

  it('scores lifestyle answers with plain reasons and drops anything else', () => {
    const same = vibe.shared.vibeMatch(early, [early]);
    assert.equal(same.score, 100);
    assert.deepEqual(same.reasons, ['You both sleep before 11 pm', 'You both keep things spotless']);
    const apart = vibe.shared.vibeMatch(early, [night]);
    assert.ok(apart.score < 40);
    assert.equal(apart.differences.length, 1);
    assert.match(apart.differences[0], /^A roommate tends to /);
    assert.equal(vibe.shared.vibeMatch(early, []).score, null);
    assert.deepEqual(vibe.shared.cleanVibeAnswers({ sleep: 1, religion: 2, noise: 9, tidiness: 1.5 }), { sleep: 1 });
  });

  it('scores every free bed for a visitor, revealing only scores and habit-level reasons', async () => {
    const res = await fetch(`${base}/api/pg/properties/${vibe.prop.id}/vibecheck`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: early })
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('Kavya') && !text.includes('9877700001') && !text.includes('vibeAnswers'), 'no names, phones or raw answers');
    const beds = JSON.parse(text).beds as any[];
    const shared = beds.find((bed) => bed.bedId === vibe.freeBed.id);
    assert.equal(shared.score, 100);
    assert.equal(shared.compared, 1);
    assert.equal(beds.find((bed) => bed.bedId === vibe.emptyBed.id).score, null, 'empty rooms have nobody to compare with');
    const bad = await fetch(`${base}/api/pg/properties/${vibe.prop.id}/vibecheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers: { religion: 1 } }) });
    assert.equal(bad.status, 400);
  });

  it('judges rooms with the ADK agent when it answers, keeping residents anonymous', async () => {
    let seen = '';
    const vibeCheck = vibe.pg.createVibeCheckPropertyHandler({
      runMatcherText: async (prompt: string) => {
        seen = prompt;
        return JSON.stringify({ rooms: { [vibe.room.id]: { score: 92, reasons: ['You both sleep before 11 pm'], differences: [], headline: 'Nearly identical routines' } } });
      }
    });
    const res = respond();
    await vibeCheck({ params: { propertyId: vibe.prop.id }, body: { answers: early } } as any, res as any);
    assert.equal(res.statusCode, 200);
    const bed = (res.body.beds as any[]).find((item) => item.bedId === vibe.freeBed.id);
    assert.equal(bed.score, 92);
    assert.equal(bed.compared, 1);
    assert.equal(bed.ai, true);
    assert.equal(bed.headline, 'Nearly identical routines');
    const empty = (res.body.beds as any[]).find((item) => item.bedId === vibe.emptyBed.id);
    assert.equal(empty.score, null, 'empty rooms never reach the agent');
    assert.equal(empty.ai, false);
    assert.ok(seen.length > 0, 'the agent saw the prompt');
    assert.ok(!seen.includes('Kavya') && !seen.includes('9877700001'), 'the prompt carries habits, never names or phones');
  });

  it('falls back to deterministic scoring when the AI agent fails or rambles', async () => {
    const stubs: Array<() => Promise<string>> = [
      async () => { throw new Error('MODEL_API_FAILED: boom'); },
      async () => 'sorry, I cannot answer as JSON {{{'
    ];
    for (const stub of stubs) {
      const vibeCheck = vibe.pg.createVibeCheckPropertyHandler({ runMatcherText: stub });
      const res = respond();
      await vibeCheck({ params: { propertyId: vibe.prop.id }, body: { answers: early } } as any, res as any);
      assert.equal(res.statusCode, 200);
      const bed = (res.body.beds as any[]).find((item) => item.bedId === vibe.freeBed.id);
      assert.equal(bed.score, 100);
      assert.equal(bed.ai, false);
      assert.deepEqual(bed.reasons, ['You both sleep before 11 pm', 'You both keep things spotless']);
    }
  });

  it('lets residents save answers and see their roommate match with the rematch window', async () => {
    const newcomer = await prisma.pGTenant.create({ data: { propertyId: vibe.prop.id, bedId: vibe.freeBed.id, name: 'New Resident', phone: '9877700002', moveInDate: new Date(), monthlyRent: 7000, status: 'ACTIVE' } });
    const newcomerUser = await prisma.user.create({ data: { phone: '9877700002', password: 'x', name: 'New Resident', role: 'PG_TENANT' } });
    const req = (body: any = {}) => ({ user: { userId: newcomerUser.id, role: 'PG_TENANT' }, params: { tenantId: newcomer.id }, body }) as any;

    const saved = respond();
    await vibe.pg.saveTenantVibe(req({ answers: night }), saved as any);
    assert.equal(saved.statusCode, 200);
    const match = respond();
    await vibe.pg.getTenantVibeMatch(req(), match as any);
    assert.equal(match.statusCode, 200);
    assert.ok(match.body.match.score < 40, 'night owl vs early riser');
    assert.equal(match.body.rematchOpen, true, 'first 30 days after move-in');

    const stranger = respond();
    await vibe.pg.getTenantVibeMatch({ user: { userId: vibe.user.id, role: 'PG_TENANT' }, params: { tenantId: newcomer.id }, body: {} } as any, stranger as any);
    assert.equal(stranger.statusCode, 404, 'residents only see their own VibeCheck');
  });
});

describe('AI-assisted KYC reading', () => {
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const k: Record<string, any> = {};
  before(async () => {
    k.kyc = await import('../src/services/kyc-check.js');
    k.pg = await import('../src/controllers/pg.controller.js');
    k.storage = await import('../src/services/storage.js');
    k.fileKey = k.storage.newFileKey('webp');
    await k.storage.putFile(k.fileKey, Buffer.from('fake-image-bytes'), 'image/webp');
    k.user = await prisma.user.create({ data: { phone: '9866600001', password: 'x', name: 'Priya Sharma', role: 'PG_TENANT' } });
    k.tenant = await prisma.pGTenant.create({ data: { propertyId: ids.prop.id, name: 'Priya Sharma', phone: '9866600001', moveInDate: new Date(), monthlyRent: 7000, status: 'ACTIVE', kycType: 'AADHAAR', kycDocumentUrl: k.fileKey } });
  });
  const req = (userId: string) => ({ user: { userId, role: 'PG_TENANT' }, params: { tenantId: k.tenant.id }, body: {} }) as any;

  it('compares printed and declared names tolerantly', () => {
    assert.equal(k.kyc.compareNames('Priya Sharma', 'PRIYA SHARMA'), 'match');
    assert.equal(k.kyc.compareNames('Priya Sharma', 'Priya K. Sharma'), 'match');
    assert.equal(k.kyc.compareNames('Priya Sharma', 'Priya Nair'), 'partial');
    assert.equal(k.kyc.compareNames('Priya Sharma', 'Meera Iyer'), 'mismatch');
    assert.equal(k.kyc.compareNames('Priya Sharma', ''), 'unknown');
  });

  it('flags a mismatched ID for the owner and keeps only the last 4 digits', async () => {
    let seenBytes = 0;
    const checkMyKyc = k.pg.createCheckMyKycHandler({
      readDocument: async (data: Buffer) => {
        seenBytes = data.length;
        return { documentType: 'PAN', nameOnDocument: 'MEERA IYER', idNumberLast4: 'ABCDE1234F', legible: true, notes: [] };
      }
    });
    const res = respond();
    await checkMyKyc(req(k.user.id), res as any);
    assert.equal(res.statusCode, 200);
    assert.equal(seenBytes, 'fake-image-bytes'.length, 'reads the stored file');
    assert.equal(res.body.nameMatch, 'mismatch');
    assert.equal(res.body.typeMatch, false);
    assert.equal(res.body.idNumberLast4, '234F', 'never more than 4 characters');
    assert.ok(res.body.flags.some((flag: string) => /does not match/.test(flag)));
    const stored = await prisma.pGTenant.findUnique({ where: { id: k.tenant.id } });
    assert.equal((stored!.kycAiCheck as any).nameMatch, 'mismatch');
    assert.equal(stored!.kycVerified, false, 'the AI never verifies on its own');
  });

  it('only lets residents check their own document', async () => {
    const res = respond();
    await k.pg.checkMyKyc(req(ids.tenantUser.id), res as any);
    assert.equal(res.statusCode, 404);
  });
});

describe('move-in and move-out condition records', () => {
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const c: Record<string, any> = {};
  before(async () => {
    c.pg = await import('../src/controllers/pg.controller.js');
    c.user = await prisma.user.create({ data: { phone: '9855500001', password: 'x', name: 'Record Resident', role: 'PG_TENANT' } });
    c.tenant = await prisma.pGTenant.create({ data: { propertyId: ids.prop.id, name: 'Record Resident', phone: '9855500001', moveInDate: new Date(), monthlyRent: 7000, status: 'RESERVED' } });
  });
  const ownerReq = (body: any, query: any = {}) => ({ user: { userId: ids.owner.id, role: 'PG_OWNER' }, body, query, params: {} }) as any;
  const residentReq = (body: any, query: any = {}) => ({ user: { userId: c.user.id, role: 'PG_TENANT' }, body, query, params: {} }) as any;

  it('lets staff and the resident add timestamped records, newest first', async () => {
    const byOwner = respond();
    await c.pg.createConditionReport(ownerReq({ tenantId: c.tenant.id, kind: 'MOVE_IN', notes: 'Wardrobe hinge loose', photoUrls: [] }), byOwner as any);
    assert.equal(byOwner.statusCode, 201);
    const byResident = respond();
    await c.pg.createConditionReport(residentReq({ tenantId: c.tenant.id, kind: 'MOVE_IN', notes: 'Small crack in the window' }), byResident as any);
    assert.equal(byResident.statusCode, 201);
    assert.equal(byResident.body.createdByRole, 'RESIDENT');
    const list = respond();
    await c.pg.listConditionReports(residentReq({}, { tenantId: c.tenant.id }), list as any);
    assert.deepEqual(list.body.map((r: any) => r.notes), ['Small crack in the window', 'Wardrobe hinge loose']);
    assert.ok(list.body.every((r: any) => r.createdAt));
    assert.ok(list.body.every((r: any) => Array.isArray(r.photoViews) && r.photoViews.length === r.photoUrls.length), 'each photo gets a view link (or null) for people allowed to see the record');
  });

  it('rejects bad input and other PGs', async () => {
    const bad = respond();
    await c.pg.createConditionReport(ownerReq({ tenantId: c.tenant.id, kind: 'DURING', notes: 'x' }), bad as any);
    assert.equal(bad.statusCode, 400);
    const empty = respond();
    await c.pg.createConditionReport(ownerReq({ tenantId: c.tenant.id, kind: 'MOVE_OUT' }), empty as any);
    assert.equal(empty.statusCode, 400);
    const outsider = respond();
    await c.pg.createConditionReport({ user: { userId: ids.outsider.id, role: 'PG_OWNER' }, body: { tenantId: c.tenant.id, kind: 'MOVE_OUT', notes: 'x' }, query: {}, params: {} } as any, outsider as any);
    assert.equal(outsider.statusCode, 404);
  });

  it('is append-only in the database, even for the PG owner', async () => {
    const record = await prisma.pGConditionReport.findFirst({ where: { tenantId: c.tenant.id } });
    await assert.rejects(dbContext.runAsDbUser({ userId: ids.owner.id, role: 'PG_OWNER' }, async () => {
      await prisma.pGConditionReport.update({ where: { id: record!.id }, data: { notes: 'edited' } });
    }), /permission denied/i);
    await assert.rejects(dbContext.runAsDbUser({ userId: ids.owner.id, role: 'PG_OWNER' }, async () => {
      await prisma.pGConditionReport.delete({ where: { id: record!.id } });
    }), /permission denied/i);
  });
});

describe('meal orders, housekeeping and per-PG service switches', () => {
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const o: Record<string, any> = {};
  const dayIn = (days: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000));
  before(async () => {
    o.svc = await import('../src/controllers/services.controller.js');
    o.pg = await import('../src/controllers/pg.controller.js');
    o.user = await prisma.user.create({ data: { phone: '9844400001', password: 'x', name: 'Meal Resident', role: 'PG_TENANT' } });
    o.tenant = await prisma.pGTenant.create({ data: { propertyId: ids.prop.id, name: 'Meal Resident', phone: '9844400001', moveInDate: new Date(), monthlyRent: 7000, status: 'ACTIVE' } });
  });
  const owner = (body: any = {}, params: any = {}, query: any = {}) => ({ user: { userId: ids.owner.id, role: 'PG_OWNER' }, body, params, query }) as any;
  const resident = (body: any = {}, params: any = {}) => ({ user: { userId: o.user.id, role: 'PG_TENANT' }, body, params: { tenantId: o.tenant.id, ...params }, query: {} }) as any;

  it('only takes orders for services the owner switched on, at the owner\'s prices', async () => {
    const off = respond();
    await o.svc.createServiceOrder(resident({ type: 'MEAL', slot: 'LUNCH', forDate: dayIn(1) }), off as any);
    assert.equal(off.statusCode, 409, 'meals are off by default');

    const saved = respond();
    await o.svc.updateServiceSettings(owner({ settings: { mealOrders: { enabled: true, prices: { LUNCH: 90, DINNER: 110, BREAKFAST: 50 } }, housekeeping: { enabled: false } } }, { propertyId: ids.prop.id }), saved as any);
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.body.vibeCheck, true, 'defaults kept for untouched switches');

    const lunch = respond();
    await o.svc.createServiceOrder(resident({ type: 'MEAL', slot: 'LUNCH', forDate: dayIn(1), quantity: 2 }), lunch as any);
    assert.equal(lunch.statusCode, 201);
    assert.equal(lunch.body.unitPrice, 90);
    assert.equal(lunch.body.quantity, 2);

    const cleaning = respond();
    await o.svc.createServiceOrder(resident({ type: 'HOUSEKEEPING', slot: 'MORNING', forDate: dayIn(1) }), cleaning as any);
    assert.equal(cleaning.statusCode, 409, 'housekeeping still off');

    for (const [body, why] of [[{ type: 'MEAL', slot: 'MORNING', forDate: dayIn(1) }, 'cleaning slot for a meal'], [{ type: 'MEAL', slot: 'LUNCH', forDate: dayIn(-1) }, 'past date'], [{ type: 'MEAL', slot: 'LUNCH', forDate: dayIn(30) }, 'too far ahead']] as const) {
      const bad = respond();
      await o.svc.createServiceOrder(resident(body), bad as any);
      assert.equal(bad.statusCode, 400, why);
    }
  });

  it('gives the kitchen a head-count and lets staff confirm while residents cancel only unconfirmed orders', async () => {
    const day = respond();
    await o.svc.listStaffServiceOrders(owner({}, {}, { date: dayIn(1) }), day as any);
    assert.equal(day.body.mealCounts.LUNCH, 2);
    const order = day.body.orders.find((item: any) => item.tenantId === o.tenant.id);
    const confirmed = respond();
    await o.svc.updateServiceOrderStatus(owner({ status: 'CONFIRMED' }, { orderId: order.id }), confirmed as any);
    assert.equal(confirmed.body.status, 'CONFIRMED');
    const cancel = respond();
    await o.svc.cancelMyServiceOrder(resident({}, { orderId: order.id }), cancel as any);
    assert.equal(cancel.statusCode, 409);
    const outsider = respond();
    await o.svc.updateServiceOrderStatus({ user: { userId: ids.outsider.id, role: 'PG_OWNER' }, body: { status: 'DONE' }, params: { orderId: order.id }, query: {} } as any, outsider as any);
    assert.equal(outsider.statusCode, 404);
  });

  it('turns VibeCheck off for guests when the owner switches it off', async () => {
    const off = respond();
    await o.svc.updateServiceSettings(owner({ settings: { vibeCheck: false } }, { propertyId: ids.prop.id }), off as any);
    const check = respond();
    await o.pg.vibeCheckProperty({ params: { propertyId: ids.prop.id }, body: { answers: { sleep: 0 } }, user: undefined } as any, check as any);
    assert.equal(check.statusCode, 404);
    await o.svc.updateServiceSettings(owner({ settings: { vibeCheck: true } }, { propertyId: ids.prop.id }), respond() as any);
  });
});

describe('staff roles: warden, cook, housekeeping, accountant', () => {
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const r: Record<string, any> = {};
  before(async () => {
    r.pg = await import('../src/controllers/pg.controller.js');
    r.svc = await import('../src/controllers/services.controller.js');
    r.shared = await import('@livingplus/shared');
    for (const [role, phone] of [['COOK', '9833300001'], ['HOUSEKEEPING', '9833300002'], ['ACCOUNTANT', '9833300003']] as const) {
      const res = respond();
      await r.pg.createPropertyStaff({ user: { userId: ids.owner.id, role: 'PG_OWNER' }, body: { propertyId: ids.prop.id, name: `${role} Staff`, phone, password: 'Strong@pass1', email: '', role }, params: {}, query: {} } as any, res as any);
      assert.equal(res.statusCode, 201, `create ${role}`);
      r[role] = await prisma.user.findFirst({ where: { phone: { endsWith: phone } } });
    }
    const resident = await prisma.pGTenant.create({ data: { propertyId: ids.prop.id, name: 'Order Resident', phone: '9833300009', moveInDate: new Date(), monthlyRent: 7000, status: 'ACTIVE' } });
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    r.meal = await prisma.pGServiceOrder.create({ data: { propertyId: ids.prop.id, tenantId: resident.id, type: 'MEAL', slot: 'LUNCH', forDate: day } });
    r.clean = await prisma.pGServiceOrder.create({ data: { propertyId: ids.prop.id, tenantId: resident.id, type: 'HOUSEKEEPING', slot: 'MORNING', forDate: day } });
    r.today = day.toISOString().slice(0, 10);
  });
  const as = (role: string, extra: any = {}) => ({ user: { userId: r[role].id, role: 'PG_WARDEN' }, body: {}, params: {}, query: {}, ...extra }) as any;

  it('maps each role to its own views', () => {
    assert.deepEqual(r.shared.viewsForRoles(['COOK']), ['services']);
    assert.deepEqual(r.shared.viewsForRoles(['ACCOUNTANT']), ['rent', 'payments', 'expenses', 'utilities', 'reports']);
    assert.ok(!r.shared.viewsForRoles(['WARDEN']).includes('rent'), 'wardens never see the ledger');
  });

  it('shows cooks meal orders and housekeeping cleaning orders only', async () => {
    const cook = respond();
    await r.svc.listStaffServiceOrders(as('COOK', { query: { date: r.today } }), cook as any);
    assert.ok(cook.body.orders.some((o: any) => o.id === r.meal.id));
    assert.ok(!cook.body.orders.some((o: any) => o.id === r.clean.id));
    const sneaky = respond();
    await r.svc.updateServiceOrderStatus(as('COOK', { body: { status: 'DONE' }, params: { orderId: r.clean.id } }), sneaky as any);
    assert.equal(sneaky.statusCode, 404, 'a cook cannot close a cleaning order');
    const cleaner = respond();
    await r.svc.updateServiceOrderStatus(as('HOUSEKEEPING', { body: { status: 'DONE' }, params: { orderId: r.clean.id } }), cleaner as any);
    assert.equal(cleaner.body.status, 'DONE');
  });

  it('gives accountants the ledger but not bookings, and cooks neither', async () => {
    const ledger = respond();
    await r.pg.listOwnerRentEntries(as('ACCOUNTANT'), ledger as any);
    assert.equal(ledger.statusCode, 200);
    assert.ok(Array.isArray(ledger.body) && ledger.body.length > 0, 'accountant sees rent entries');
    const cookLedger = respond();
    await r.pg.listOwnerRentEntries(as('COOK'), cookLedger as any);
    assert.deepEqual(cookLedger.body, [], 'cooks see no money');
    const bookings = respond();
    await r.pg.listOwnerBookings(as('ACCOUNTANT'), bookings as any);
    assert.deepEqual(bookings.body, [], 'accountants see no booking requests');
    const summary = respond();
    await r.pg.getOwnerSummary(as('COOK'), summary as any);
    assert.deepEqual(summary.body.staffRoles, ['COOK']);
  });

  it('refuses unknown staff roles', async () => {
    const res = respond();
    await r.pg.createPropertyStaff({ user: { userId: ids.owner.id, role: 'PG_OWNER' }, body: { propertyId: ids.prop.id, name: 'X', phone: '9833300099', password: 'Strong@pass1', email: '', role: 'MANAGER' }, params: {}, query: {} } as any, res as any);
    assert.equal(res.statusCode, 400);
  });
});

describe('verified owners', () => {
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });
  const v: Record<string, any> = {};
  before(async () => {
    v.auth = await import('../src/controllers/pg-auth.controller.js');
    v.pg = await import('../src/controllers/pg.controller.js');
  });
  const signup = (extra: any = {}) => ({ body: { name: 'Verified Owner', phone: '9822211001', password: 'Strong@pass1', propertyName: 'Verified House', propertyAddress: '7 Trust Rd', locality: 'Adyar', city: 'Chennai', email: '', contactPhone: '', genderPolicy: 'ANY', ...extra }, headers: {} }) as any;

  it('requires a phone code to register, and marks the owner verified', async () => {
    const missing = respond();
    await v.auth.register(signup(), missing as any);
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.body.code, 'PHONE_NOT_VERIFIED');
    const { token } = await otpFor('9822211001', 'signup');
    const ok = respond();
    await v.auth.register(signup({ phoneToken: token }), ok as any);
    assert.equal(ok.statusCode, 201);
    const owner = await prisma.user.findFirst({ where: { phone: { endsWith: '9822211001' } } });
    assert.ok(owner?.phoneVerifiedAt, 'phone verified at registration');
    v.owner = owner;
  });

  it('shows "Verified owner" on listings only when an owner proved their phone', async () => {
    const listing = respond();
    await v.pg.listProperties({ query: {}, user: undefined, headers: {} } as any, listing as any);
    const mine = listing.body.find((p: any) => p.name === 'Verified House');
    const spec = listing.body.find((p: any) => p.id === ids.prop.id);
    assert.equal(mine.ownerVerified, true);
    assert.equal(spec.ownerVerified, false, 'the spec owner never verified');
  });

  it('lets existing owners verify from their account', async () => {
    const { token } = await otpFor('9100000001', 'existing');
    const res = respond();
    await v.auth.verifyMyPhone({ user: { userId: ids.owner.id, role: 'PG_OWNER' }, body: { phoneToken: token }, headers: {} } as any, res as any);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.phoneVerified, true);
    const reused = respond();
    await v.auth.verifyMyPhone({ user: { userId: ids.owner.id, role: 'PG_OWNER' }, body: { phoneToken: token }, headers: {} } as any, reused as any);
    assert.equal(reused.statusCode, 400, 'codes are single-use');
  });
});

describe('assistant reply language', () => {
  it('asks for Tamil or Hindi in their own script and keeps facts unchanged', async () => {
    const { languageInstruction } = await import('../src/services/ai-orchestrator.js');
    assert.match(languageInstruction('ta'), /Tamil \(தமிழ்\)/);
    assert.match(languageInstruction('hi'), /Hindi \(हिन्दी\)/);
    assert.match(languageInstruction('ta'), /rupee amounts/);
    assert.match(languageInstruction('xx'), /Reply in English/);
  });
});

describe('WhatsApp inbound assistant', () => {
  const w: Record<string, any> = {};
  const envKeys = ['ENABLE_WHATSAPP_CLOUD_API', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'];
  const saved: Record<string, string | undefined> = {};
  let base = '';
  let server: http.Server;
  before(async () => {
    w.wa = await import('../src/services/whatsapp-inbound.js');
    const { default: app } = await import('../src/app.js');
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    for (const key of envKeys) saved[key] = process.env[key];
  });
  after(() => {
    server?.close();
    for (const key of envKeys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  });
  const enable = () => Object.assign(process.env, { ENABLE_WHATSAPP_CLOUD_API: 'true', WHATSAPP_APP_SECRET: 'app-secret', WHATSAPP_VERIFY_TOKEN: 'verify-me', WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '1' });

  it('stays off until fully configured, then checks the handshake and every signature', async () => {
    for (const key of envKeys) delete process.env[key];
    assert.equal((await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`)).status, 404);
    enable();
    const ok = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=4242`);
    assert.equal(await ok.text(), '4242');
    assert.equal((await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)).status, 403);
    const body = JSON.stringify({ entry: [] });
    const forged = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=deadbeef' }, body });
    assert.equal(forged.status, 401);
    const sig = 'sha256=' + crypto.createHmac('sha256', 'app-secret').update(body).digest('hex');
    const signed = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
    assert.equal(signed.status, 200);
  });

  it('answers residents as residents and strangers as guests, with YES to confirm', async () => {
    const handleInbound = w.wa.createWhatsAppInboundHandler();
    const calls: any[] = [];
    const sent: string[] = [];
    const chat = async (req: any, input: any) => {
      calls.push({ role: req.user?.role ?? 'GUEST', input });
      return input.confirmationId
        ? { reply: 'Ticket created.', sessionId: 's1' }
        : { reply: 'I can log that.', sessionId: 's1', needsConfirmation: { confirmationId: 'cfm.s1.n1', preview: 'Report: tap leaking' } };
    };
    const send = async (_to: string, body: string) => { sent.push(body); };
    const resident = await prisma.pGTenant.findFirst({ where: { status: 'ACTIVE', phone: { endsWith: '9000000001' } } }).catch(() => null);
    const residentPhone = resident ? '919000000001' : '919200000002';
    await handleInbound({ id: 'm1', from: residentPhone, text: 'Tap is leaking in my room' }, { chat, send });
    assert.equal(calls[0].role, 'PG_TENANT', 'a number with an active stay talks to the resident assistant');
    assert.match(sent[0] ?? "", /Reply YES to confirm/);
    await handleInbound({ id: 'm2', from: residentPhone, text: 'yes' }, { chat, send });
    assert.equal(calls[1].input.confirmationId, 'cfm.s1.n1');
    assert.equal(calls[1].input.sessionId, 's1', 'the same conversation continues');
    assert.equal(await handleInbound({ id: 'm2', from: residentPhone, text: 'yes' }, { chat, send }), null, 'Meta retries are ignored');
    await handleInbound({ id: 'm3', from: '919999988888', text: 'PGs near OMR?' }, { chat, send });
    assert.equal(calls[2].role, 'GUEST');
  });
});

describe('VibeCheck agents on Google ADK', () => {
  const v: Record<string, any> = {};
  const keep = { enabled: process.env.ENABLE_AI_ORCHESTRATOR, model: process.env.AI_MODEL };
  before(async () => {
    v.agent = await import('../src/services/vibe-agent.js');
    v.provider = await import('../src/services/ai-provider.js');
    v.pg = await import('../src/controllers/pg.controller.js');
    process.env.ENABLE_AI_ORCHESTRATOR = 'true';
    process.env.AI_MODEL = 'google:gemini-3.8-flash';
  });
  after(() => {
    if (keep.enabled === undefined) delete process.env.ENABLE_AI_ORCHESTRATOR; else process.env.ENABLE_AI_ORCHESTRATOR = keep.enabled;
    if (keep.model === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = keep.model;
  });
  const respond = () => ({
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  });

  it('turns a free-text routine into habits, drops identity details and asks one follow-up', async () => {
    const buildProfile = v.pg.createBuildVibeProfileHandler({
      runProfiler: async () => ({
        answers: { sleep: 2, wake: 2, tidiness: null, noise: 1, guests: 0, kitchen: null, schedule: 2, cooling: 9 },
        summary: 'Night owl who studies late, plays guitar softly on weekends.',
        followUp: 'How tidy do you keep your space?'
      })
    });
    const res = respond();
    await buildProfile({ body: { text: 'Naan 2 mani varaikkum padippen, weekends guitar vaasippen', answers: { kitchen: 1 } } } as any, res as any);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.answers, { kitchen: 1, sleep: 2, wake: 2, noise: 1, guests: 0, schedule: 2 }, 'null and invalid values dropped; earlier answers kept');
    assert.equal(res.body.followUp, 'How tidy do you keep your space?');
    assert.deepEqual(res.body.missing, ['tidiness', 'cooling']);
    const short = respond();
    await buildProfile({ body: { text: 'hi' } } as any, short as any);
    assert.equal(short.statusCode, 400);
  });

  it('runs the voice interview one turn at a time, hearing audio and keeping earlier habits', async () => {
    let seen: any = null;
    const interviewStep = v.pg.createVibeInterviewStepHandler({
      runInterviewer: async (input: any) => {
        seen = input;
        return {
          heard: 'Naan 1 mani varaikkum padippen, room clean-aa vechuppen',
          answers: { sleep: 2, wake: null, tidiness: 0, noise: null, guests: null, kitchen: null, schedule: 2, cooling: null },
          summary: 'Studies late, keeps the room tidy.',
          reply: 'Super! Room-la sound irundha okay-aa, illa quiet venuma?',
          done: false
        };
      }
    });
    const res = respond();
    await interviewStep({
      body: {
        history: [{ role: 'assistant', text: 'Hi! When do you usually sleep?' }, { role: 'hacker', text: 'ignored' }],
        answers: { guests: 1 },
        audio: { mimeType: 'audio/wav', data: 'UklGRiQAAABXQVZF' }
      }
    } as any, res as any);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.answers, { guests: 1, sleep: 2, tidiness: 0, schedule: 2 }, 'new habits merged with earlier ones');
    assert.match(res.body.reply, /quiet venuma/);
    assert.equal(res.body.done, false);
    assert.deepEqual(res.body.missing, ['wake', 'noise', 'kitchen', 'cooling']);
    assert.equal(seen.audio.mimeType, 'audio/wav');
    assert.deepEqual(seen.history, [{ role: 'assistant', text: 'Hi! When do you usually sleep?' }], 'only real turns are passed on');

    const bad = respond();
    await interviewStep({ body: { audio: { mimeType: 'video/mp4', data: 'AAAA' } } } as any, bad as any);
    assert.equal(bad.statusCode, 400);
    const big = respond();
    await interviewStep({ body: { audio: { mimeType: 'audio/wav', data: 'A'.repeat(900_004) } } } as any, big as any);
    assert.equal(big.statusCode, 413);
    const empty = respond();
    await interviewStep({ body: { history: [] } } as any, empty as any);
    assert.equal(empty.statusCode, 400);
  });

  it('only talks about what applies at the PG: no kitchen or AC questions where there is none', async () => {
    const shared = await import('@livingplus/shared');
    const live = await import('../src/services/vibe-live.js');
    const noKitchen = shared.vibeTopicsFor({ name: 'Palm Grove', locality: 'Perungudi', amenities: ['Wi-Fi', 'Meals'], rooms: [{ hasAc: false, foodIncluded: true }] });
    assert.deepEqual(noKitchen.skip, ['kitchen', 'cooling']);
    assert.ok(noKitchen.facts.includes('There is no shared kitchen for residents.'));
    assert.deepEqual(shared.vibeTopicsFor({ amenities: ['Shared kitchen'], rooms: [{ hasAc: true }] }).skip, []);
    const result = live.applyHabitCall({}, { answers: { sleep: 2, kitchen: 2, cooling: 0 }, summary: 'Night owl.', done: false }, noKitchen.skip);
    assert.deepEqual(result.answers, { sleep: 2 }, 'kitchen and cooling answers are dropped where they do not apply');
    assert.ok(!result.missing.includes('kitchen') && !result.missing.includes('cooling'));

    let seen: any = null;
    const interviewStep = v.pg.createVibeInterviewStepHandler({
      runInterviewer: async (input: any) => {
        seen = input;
        return { heard: 'Working', answers: { sleep: 1, wake: null, tidiness: null, noise: null, guests: null, kitchen: 2, schedule: null, cooling: null }, summary: 'Works days.', reply: 'Nice!', done: false };
      }
    });
    const prop = await prisma.pGProperty.create({ data: { name: 'No Kitchen House', address: '9, Test Road', locality: 'Adyar', city: 'Chennai', genderPolicy: 'ANY', amenities: ['Wi-Fi'], houseRules: [], status: 'ACTIVE' } });
    try {
      const res = respond();
      await interviewStep({ body: { propertyId: prop.id, text: 'Working at a bank' } } as any, res as any);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.answers, { sleep: 1 }, 'kitchen answer dropped for a PG without a kitchen');
      assert.ok(seen.topics.skip.includes('kitchen'));
      assert.ok(seen.topics.facts.some((fact: string) => fact.includes('No Kitchen House')));
    } finally {
      await prisma.pGProperty.delete({ where: { id: prop.id } });
    }
  });

  it('cleans live VibeCheck habit calls and only accepts same-site browsers', async () => {
    const live = await import('../src/services/vibe-live.js');
    const first = live.applyHabitCall({ guests: 1 }, { answers: { sleep: 2, tidiness: 0, noise: 7 }, summary: 'Night owl, very tidy.', done: false });
    assert.deepEqual(first.answers, { guests: 1, sleep: 2, tidiness: 0 }, 'out-of-range values dropped, earlier habits kept');
    assert.equal(first.done, false);
    assert.ok(first.missing.includes('noise'));
    assert.equal(live.applyHabitCall({}, 'nonsense').summary, null);
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.equal(live.originAllowed({ headers: { origin: 'https://livingplus.example', host: 'livingplus.example' } } as any), true);
      assert.equal(live.originAllowed({ headers: { origin: 'https://evil.example', host: 'livingplus.example' } } as any), false);
      assert.equal(live.originAllowed({ headers: { host: 'livingplus.example' } } as any), false, 'no origin, no session');
    } finally {
      if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved;
    }
  });

  it('offers the quiz instead when the profile agent is unavailable', async () => {
    process.env.ENABLE_AI_ORCHESTRATOR = 'false';
    const res = respond();
    await v.pg.buildVibeProfileFromText({ body: { text: 'I sleep early and keep my room tidy.' } } as any, res as any);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'VIBE_AI_UNAVAILABLE');
    process.env.ENABLE_AI_ORCHESTRATOR = 'true';
  });

  it('keeps the AI score within 15 points of the calculated one and passes habit summaries, never names', async () => {
    let prompt = '';
    const early = { sleep: 0, wake: 0, tidiness: 0, noise: 0, guests: 0, kitchen: 1, schedule: 0, cooling: 1 };
    const night = { sleep: 2, wake: 2, tidiness: 2, noise: 2, guests: 2, kitchen: 1, schedule: 2, cooling: 1 };
    const baseline = (await import('@livingplus/shared')).vibeMatch(early, [night]).score!;
    const matches = await v.agent.scoreVibeRooms(
      early,
      [{ roomId: 'r1', roomNumber: '101', roommates: [night], summaries: ['Plays drums most evenings.'] }],
      'Early riser who needs quiet.',
      {
        runMatcherText: async (text: string) => {
          prompt = text;
          return JSON.stringify({ rooms: { r1: { score: 99, reasons: ['You both sleep before 11 pm'], differences: [], headline: 'Calm, early room' } } });
        }
      }
    );
    const r1 = matches.get('r1');
    assert.equal(r1.ai, true);
    assert.equal(r1.score, baseline + 15, 'a 99 from the AI is held to baseline + 15');
    assert.match(prompt, /Plays drums most evenings/);
    assert.match(prompt, /Early riser who needs quiet/);
    assert.equal(v.agent.anchoredScore(-20, 10), 0);
    assert.equal(v.agent.anchoredScore(50, 40), 50);
  });

  it('retries once on a fallback model when Gemini is out of capacity, and only then', async () => {
    const env = { ENABLE_AI_ORCHESTRATOR: 'true', AI_MODEL: 'google:gemini-3.8-flash', AI_MODEL_OPTIONS: undefined, AI_FALLBACK_MODEL: undefined, GOOGLE_GENAI_USE_ENTERPRISE: undefined, GOOGLE_API_KEY: 'test-key' };
    const busy = new Response(JSON.stringify({ error: { code: 429, message: 'Resource exhausted.', status: 'RESOURCE_EXHAUSTED' } }), { status: 429, headers: { 'content-type': 'application/json' } });
    const api = fakeGemini([busy, geminiText('{"a":3}')]);
    try {
      const out = await withEnv(env, () => v.provider.generateStructured({ system: 'sys', parts: [{ text: 'hi' }], schema: z.object({ a: z.number() }) }));
      assert.deepEqual(out, { a: 3 });
      assert.equal(api.seen.length, 2);
      assert.match(api.seen[0]!.url, /models\/gemini-3\.8-flash:generateContent/);
      assert.match(api.seen[1]!.url, /models\/gemini-3\.5-flash-lite:generateContent/, 'the retry goes to the fallback model');
    } finally {
      api.restore();
    }

    const bad = new Response(JSON.stringify({ error: { code: 400, message: 'Invalid argument.', status: 'INVALID_ARGUMENT' } }), { status: 400, headers: { 'content-type': 'application/json' } });
    const api2 = fakeGemini([bad, geminiText('{"a":4}')]);
    try {
      await assert.rejects(withEnv(env, () => v.provider.generateStructured({ system: 'sys', parts: [{ text: 'hi' }], schema: z.object({ a: z.number() }) })));
      assert.equal(api2.seen.length, 1, 'a real error is not retried');
    } finally {
      api2.restore();
    }
    // A main model that hangs hands over to the fallback after the patience window.
    const hang = (request: Request) => new Promise<Response>((_, reject) => request.signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))));
    const api3 = fakeGemini([hang, geminiText('{"a":5}')]);
    try {
      const started = Date.now();
      const out = await withEnv({ ...env, AI_PRIMARY_PATIENCE_MS: '1000', MODEL_API_TIMEOUT_MS: '8000' }, () => v.provider.generateStructured({ system: 'sys', parts: [{ text: 'hi' }], schema: z.object({ a: z.number() }) }));
      assert.deepEqual(out, { a: 5 });
      assert.equal(api3.seen.length, 2);
      assert.match(api3.seen[1]!.url, /gemini-3\.5-flash-lite/);
      assert.ok(Date.now() - started < 4000, 'the fallback starts after the patience window, not the full timeout');
    } finally {
      api3.restore();
    }
    assert.equal(v.provider.fallbackModelName('gemini-3.5-flash-lite'), null, 'no fallback to itself');
    assert.equal(v.provider.isCapacityError({ status: 503 }), true);
    assert.equal(v.provider.isCapacityError(new Error('INVALID_ARGUMENT')), false);
  });

  it('makes one structured Gemini call for one-shot jobs, with the JSON schema', async () => {
    const api = fakeGemini([geminiText('```json\n{"a":2}\n```')]);
    try {
      const out = await withEnv({ ENABLE_AI_ORCHESTRATOR: 'true', AI_MODEL: 'google:gemini-4-hydrogen', AI_MODEL_OPTIONS: '{"thinkingConfig":{"thinkingLevel":"MEDIUM"}}', GOOGLE_GENAI_USE_ENTERPRISE: undefined, GOOGLE_API_KEY: 'test-key' }, () =>
        v.provider.generateStructured({ system: 'sys', parts: [{ text: 'hi' }], schema: z.object({ a: z.number() }) }));
      assert.deepEqual(out, { a: 2 });
      assert.match(api.seen[0]!.url, /models\/gemini-4-hydrogen:generateContent/);
      const body = api.seen[0]!.body;
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      assert.equal(body.generationConfig.responseJsonSchema.properties.a.type, 'number');
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'MEDIUM');
      assert.equal(body.systemInstruction.parts[0].text, 'sys');
    } finally {
      api.restore();
    }
  });

  it('issues scoped owner briefing passes, enforces live availability, and isolates money details by role', async () => {
    const briefing = await import('../src/services/owner-briefing.js');
    const insights = await import('../src/controllers/insights.controller.js');
    const jwt = (await import('jsonwebtoken')).default;
    const { getJwtSecret } = await import('../src/utils/auth-config.js');

    // Pass validation: valid pass resolves userId; wrong-purpose / invalid / null rejected.
    const pass = briefing.issueBriefingPass('owner-123');
    assert.equal(briefing.readBriefingPass(pass), 'owner-123');
    assert.equal(briefing.readBriefingPass(null), null);
    assert.equal(briefing.readBriefingPass('not-a-jwt'), null);
    const wrongPurpose = jwt.sign({ userId: 'owner-123', purpose: 'other' }, getJwtSecret(), { expiresIn: '60s' });
    assert.equal(briefing.readBriefingPass(wrongPurpose), null);

    const unauthRes = respond();
    await insights.postBriefingPass({} as any, unauthRes as any);
    assert.equal(unauthRes.statusCode, 401);

    const suffix = String(Date.now());
    const ownerUser = await prisma.user.create({ data: { name: 'Briefing Owner', email: `owner-brief-${suffix}@test.local`, phone: `97${suffix.slice(-8)}`, password: 'x', role: 'PG_OWNER' } });
    const wardenUser = await prisma.user.create({ data: { name: 'Briefing Warden', email: `warden-brief-${suffix}@test.local`, phone: `98${suffix.slice(-8)}`, password: 'x', role: 'PG_WARDEN' } });
    const pgOwned = await prisma.pGProperty.create({ data: { name: `Briefing Home ${suffix}`, address: '1, Test St', locality: 'Adyar', city: 'Chennai', genderPolicy: 'ANY', amenities: ['Wi-Fi'], houseRules: [], status: 'ACTIVE' } });
    const pgOther = await prisma.pGProperty.create({ data: { name: `Other Owner PG ${suffix}`, address: '2, Test St', locality: 'OMR', city: 'Chennai', genderPolicy: 'ANY', amenities: ['Wi-Fi'], houseRules: [], status: 'ACTIVE' } });
    try {
      await prisma.pGPropertyAccess.create({ data: { userId: ownerUser.id, propertyId: pgOwned.id, role: 'OWNER' } });
      await prisma.pGPropertyAccess.create({ data: { userId: wardenUser.id, propertyId: pgOwned.id, role: 'WARDEN' } });

      // postBriefingPass returns 503 when live voice is disabled.
      await withEnv({ VIBE_LIVE_ENABLED: 'false' }, async () => {
        const disabledRes = respond();
        await insights.postBriefingPass({ user: { userId: ownerUser.id, role: 'PG_OWNER' } } as any, disabledRes as any);
        assert.equal(disabledRes.statusCode, 503);
      });

      // postBriefingPass returns a valid pass for an owner when live voice is enabled.
      await withEnv({ ENABLE_AI_ORCHESTRATOR: 'true', VIBE_LIVE_ENABLED: 'true' }, async () => {
        const okRes = respond();
        await insights.postBriefingPass({ user: { userId: ownerUser.id, role: 'PG_OWNER' } } as any, okRes as any);
        assert.equal(okRes.statusCode, 200);
        assert.equal(briefing.readBriefingPass(okRes.body.pass), ownerUser.id);
      });

      // briefingFacts includes owner's PG and money details; never leaks another owner's PG.
      const ownerFacts = await briefing.briefingFacts(ownerUser.id);
      assert.ok(ownerFacts, 'owner receives briefing facts');
      assert.match(ownerFacts!.facts, new RegExp(pgOwned.name));
      assert.doesNotMatch(ownerFacts!.facts, new RegExp(pgOther.name), 'never leaks another owner PG');
      assert.match(ownerFacts!.facts, /Overdue rent:/);
      const prompt = briefing.briefingInstruction(ownerFacts!.facts);
      assert.match(prompt, /You cannot change anything/);

      // Warden gets no money details.
      const wardenFacts = await briefing.briefingFacts(wardenUser.id);
      assert.ok(wardenFacts);
      assert.match(wardenFacts!.facts, /cannot see money details/);
      assert.doesNotMatch(wardenFacts!.facts, /Overdue rent:/);
    } finally {
      await prisma.pGPropertyAccess.deleteMany({ where: { userId: { in: [ownerUser.id, wardenUser.id] } } });
      await prisma.pGProperty.deleteMany({ where: { id: { in: [pgOwned.id, pgOther.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerUser.id, wardenUser.id] } } });
    }
  });
});
