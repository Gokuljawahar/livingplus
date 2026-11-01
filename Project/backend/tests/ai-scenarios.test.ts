// Scenario suite for the PG OS agentic layer (project report §16).
// Runs against a throwaway SQLite database with a scripted model stub, so no
// Meta API key, model network access, or running server is required.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const DB_FILE = './tests/tmp-ai-scenarios.db';
// Prisma resolves sqlite `file:` paths against the schema directory, so the
// engine file lives at ./prisma/tests/... while unlink runs against cwd.
const DB_FS = './prisma/tests/tmp-ai-scenarios.db';
process.env.DATABASE_URL = `file:${DB_FILE}`;
process.env.ENABLE_AI_ORCHESTRATOR = 'true';
process.env.META_MODEL_API_KEY = 'test-key';
process.env.META_MODEL_BASE_URL = 'https://api.meta.ai/v1';
process.env.META_MODEL_NAME = 'muse-spark-1.3';
process.env.MODEL_API_TIMEOUT_MS = '5000';
process.env.ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.JWT_SECRET = 'test-secret-for-pg-scenario-suite-32-bytes';

let prisma: any;
let tools: any;
let orchestrator: any;
let providerMod: any;
let voice: any;
let reminders: any;
let ids: any = {};

const guestReq = () => ({ user: {}, ip: '127.0.0.1' }) as any;
const userReq = (user: any) => ({ user: { userId: user.id, role: user.role }, ip: '127.0.0.1' }) as any;
const guestActor = { userId: null, role: 'GUEST', phones: [], propertyIds: [], isSuperAdmin: false };

// Scripted stand-in for the Meta model: each turn returns the next step.
function stubProvider(script: Array<{ text?: string; calls?: Array<{ name: string; args: any }> }>) {
  let i = 0;
  return {
    name: 'stub-model',
    configured: true,
    async complete() {
      const step = script[Math.min(i++, script.length - 1)]!;
      return {
        message: {
          role: 'assistant',
          content: step.text ?? null,
          tool_calls: (step.calls ?? []).map((c, n) => ({ id: `call_${i}_${n}`, name: c.name, arguments: JSON.stringify(c.args) }))
        }
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
  for (const f of [DB_FS, `${DB_FS}-journal`]) { try { fs.unlinkSync(f); } catch { /* fresh */ } }
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { stdio: 'pipe' });
  ({ prisma } = await import('../src/app.js'));
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
  ids = { owner, tenantUser, outsider, prop, other, roomA, roomB, bedFree1, bedFree2, bedFree3, bedOcc, bedSpare, tenant, ticket, otherTicket };
});

after(async () => {
  await prisma?.$disconnect();
  for (const f of [DB_FS, `${DB_FS}-journal`]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
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
  it('hides owner-only tools from guests', async () => {
    const names = tools.toolDefinitionsFor('GUEST').map((t: any) => t.name);
    for (const open of ['search_properties', 'get_property_details', 'check_bed_availability', 'get_booking_status', 'create_booking_request']) {
      assert.ok(names.includes(open), `guest should see ${open}`);
    }
    for (const closed of ['get_pending_rent', 'get_occupancy_report', 'update_maintenance_status', 'send_notification']) {
      assert.ok(!names.includes(closed), `guest must not see ${closed}`);
    }
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

  it('reports occupancy consistent with the database', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: ['9100000001'], propertyIds: [ids.prop.id], isSuperAdmin: false };
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

  it('refuses occupancy outside the caller property scope', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id], isSuperAdmin: false };
    await assert.rejects(
      tools.toolCatalogue.get_occupancy_report.execute(actor, { property_id: ids.other.id }),
      /FORBIDDEN/);
  });

  it('totals outstanding rent for permitted properties', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id], isSuperAdmin: false };
    const report: any = await tools.toolCatalogue.get_pending_rent.execute(actor, {});
    assert.equal(report.outstanding_total, 7000);
    assert.equal(report.entries_due, 2);
  });

  it('audits staff ticket updates', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id], isSuperAdmin: false };
    const updated: any = await tools.toolCatalogue.update_maintenance_status.execute(actor, { ticket_id: ids.ticket.id, status: 'IN_PROGRESS' });
    assert.equal(updated.status, 'IN_PROGRESS');
    await new Promise((r) => setTimeout(r, 300));
    const audit = await prisma.pHAuditLog.findFirst({ where: { entityId: ids.ticket.id, action: 'TICKET_STATUS_VIA_AI' } });
    assert.ok(audit);
  });

  it('refuses ticket updates outside the caller scope', async () => {
    const actor = { userId: ids.outsider.id, role: 'PG_OWNER', phones: [], propertyIds: [], isSuperAdmin: false };
    await assert.rejects(
      tools.toolCatalogue.update_maintenance_status.execute(actor, { ticket_id: ids.ticket.id, status: 'CLOSED' }),
      /FORBIDDEN/);
    const ownerActor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id], isSuperAdmin: false };
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
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id], isSuperAdmin: false };
    const res: any = await tools.toolCatalogue.send_notification.execute(actor, { recipient_phone: '9400000001', template: 'rent_due' });
    assert.deepEqual(res, { sent: false, skipped: 'channel-disabled' });
  });
});

describe('orchestrator behaviour', () => {
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
    const broken = {
      name: 'stub-model',
      configured: true,
      async complete() {
        (this as any).seen = ((this as any).seen ?? 0) + 1;
        if ((this as any).seen === 1) {
          return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_x', name: 'search_properties', arguments: '{oops' }] } };
        }
        return { message: { role: 'assistant', content: 'Let me try that differently.', tool_calls: [] } };
      }
    };
    const result = await orchestrator.runChat(guestReq(), broken as any, { message: 'search' });
    assert.equal(result.reply, 'Let me try that differently.');
  });
});

describe('model provider', () => {
  it('refuses to call when unconfigured', async () => {
    const keepEnabled = process.env.ENABLE_AI_ORCHESTRATOR;
    const keepKey = process.env.META_MODEL_API_KEY;
    process.env.ENABLE_AI_ORCHESTRATOR = 'false';
    process.env.META_MODEL_API_KEY = '';
    try {
      const provider = new providerMod.MetaModelProvider();
      assert.equal(provider.configured, false);
      await assert.rejects(provider.complete([], []), /AI_ORCHESTRATOR_NOT_CONFIGURED/);
    } finally {
      process.env.ENABLE_AI_ORCHESTRATOR = keepEnabled;
      process.env.META_MODEL_API_KEY = keepKey;
    }
  });

  it('normalizes nested OpenAI-style tool calls to the flat form', async () => {
    let seen: any = null;
    let calls = 0;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        seen = JSON.parse(body);
        calls += 1;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(calls === 1
          ? { choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_properties', arguments: JSON.stringify({ location: 'Sholinganallur' }) } }] } }] }
          : { choices: [{ message: { content: 'done' } }] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const keepBase = process.env.META_MODEL_BASE_URL;
    process.env.META_MODEL_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const provider = new providerMod.MetaModelProvider();
      const result = await provider.complete([{ role: 'user', content: 'find PGs' }], []);
      assert.deepEqual(result.message.tool_calls, [{ id: 'call_1', name: 'search_properties', arguments: JSON.stringify({ location: 'Sholinganallur' }) }]);
      assert.ok(seen);
      await provider.complete([
        { role: 'user', content: 'find PGs' },
        { role: 'assistant', content: null, tool_calls: result.message.tool_calls },
        { role: 'tool', tool_call_id: 'call_1', content: '[]' }
      ], []);
      const echoed = seen.messages[1].tool_calls[0];
      assert.equal(echoed.type, 'function');
      assert.deepEqual(echoed.function, { name: 'search_properties', arguments: JSON.stringify({ location: 'Sholinganallur' }) });
    } finally {
      process.env.META_MODEL_BASE_URL = keepBase;
      server.close();
    }
  });

  it('times out a hanging model endpoint', async () => {
    const server = http.createServer(() => { /* never responds */ });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;
    const keepBase = process.env.META_MODEL_BASE_URL;
    const keepTimeout = process.env.MODEL_API_TIMEOUT_MS;
    process.env.META_MODEL_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.MODEL_API_TIMEOUT_MS = '300';
    try {
      const provider = new providerMod.MetaModelProvider();
      await assert.rejects(provider.complete([{ role: 'user', content: 'hi' }], []), /MODEL_API_FAILED: TIMEOUT/);
    } finally {
      process.env.META_MODEL_BASE_URL = keepBase;
      process.env.MODEL_API_TIMEOUT_MS = keepTimeout;
      server.close();
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

  it('sends attached photos as image_url parts', async () => {
    let seen: any = null;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        seen = JSON.parse(body);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'I see a leak.' } }] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const keepBase = process.env.META_MODEL_BASE_URL;
    process.env.META_MODEL_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const provider = new providerMod.MetaModelProvider();
      const result = await provider.complete([{ role: 'user', content: 'what is wrong?', images: [pixel] }], []);
      assert.equal(result.message.content, 'I see a leak.');
      const parts = seen.messages[0].content;
      assert.deepEqual(parts[0], { type: 'text', text: 'what is wrong?' });
      assert.equal(parts[1].image_url.url, pixel);
    } finally {
      process.env.META_MODEL_BASE_URL = keepBase;
      server.close();
    }
  });
});

describe('voice transcription', () => {
  it('forwards audio as multipart and returns the trimmed transcript', async () => {
    let seen: any = {};
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, init: any) => {
      seen = { url, auth: init?.headers?.Authorization, isForm: init?.body instanceof FormData };
      return { ok: true, json: async () => ({ transcript: '  fix the sink please  ' }) };
    };
    try {
      const text = await voice.transcribeAudio(Buffer.from([1, 2, 3, 4]), 'note.wav', 'audio/wav');
      assert.equal(text, 'fix the sink please');
      assert.match(seen.url, /\/asr\/transcribe$/);
      assert.ok(String(seen.auth || '').startsWith('Bearer '));
      assert.equal(seen.isForm, true);
    } finally {
      globalThis.fetch = realFetch;
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
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ transcript: '   ' }) });
    try {
      await assert.rejects(voice.transcribeAudio(Buffer.from([1]), 'note.wav', 'audio/wav'), /AI_VOICE_EMPTY_TRANSCRIPT/);
    } finally {
      globalThis.fetch = realFetch;
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
    const key = Buffer.from(process.env.ENCRYPTION_KEY as string, 'hex');
    const decryptBody = async (res: any) => {
      const wrapper = await res.json();
      const combined = Buffer.from(wrapper.data, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, combined.subarray(0, 16));
      return JSON.parse(Buffer.concat([decipher.update(combined.subarray(16)), decipher.final()]).toString('utf8'));
    };
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
      const body = await decryptBody(allowed);
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
    const key = Buffer.from(process.env.ENCRYPTION_KEY as string, 'hex');
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
      assert.equal(crossPropertyKyc.status, 403);

      const bulk = await fetch(`http://127.0.0.1:${port}/api/view-image/bulk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keys: ['uploads/private-test.pdf'] })
      });
      assert.equal(bulk.status, 200);
      const wrapper = await bulk.json() as { data: string };
      const combined = Buffer.from(wrapper.data, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, combined.subarray(0, 16));
      const body = JSON.parse(Buffer.concat([decipher.update(combined.subarray(16)), decipher.final()]).toString('utf8'));
      assert.deepEqual(body.urls, {});
    } finally {
      server.close();
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
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rent = await prisma.pGRentEntry.findUnique({ where: { tenantId_period_entryType: { tenantId: tenant.id, period, entryType: 'RENT' } } });
    const food = await prisma.pGRentEntry.findUnique({ where: { tenantId_period_entryType: { tenantId: tenant.id, period, entryType: 'FOOD' } } });
    assert.equal(rent?.amount, 9500);
    assert.equal(rent?.dueDate.getDate(), 14);
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
        { userId: ids.outsider.id, role: 'PG_OWNER', phones: [], propertyIds: [], isSuperAdmin: false },
        { property_id: ids.prop.id, amount: 50 }),
      /FORBIDDEN/);
  });

  it('summarizes expenses for owners without touching the ledger', async () => {
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id], isSuperAdmin: false };
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
    const key = Buffer.from(process.env.ENCRYPTION_KEY as string, 'hex');
    const decryptBody = async (res: any) => {
      const wrapper = await res.json();
      const combined = Buffer.from(wrapper.data, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, combined.subarray(0, 16));
      return JSON.parse(Buffer.concat([decipher.update(combined.subarray(16)), decipher.final()]).toString('utf8'));
    };
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
      const body = await decryptBody(listed);
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
    const actor = { userId: ids.owner.id, role: 'PG_OWNER', phones: [], propertyIds: [ids.prop.id], isSuperAdmin: false };
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
  });

  it('serves electricity bills over HTTP with authentication', async () => {
    const { default: app } = await import('../src/app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.on('listening', () => r()));
    const port = (server.address() as any).port;
    const key = Buffer.from(process.env.ENCRYPTION_KEY as string, 'hex');
    const decryptBody = async (res: any) => {
      const wrapper = await res.json();
      const combined = Buffer.from(wrapper.data, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, combined.subarray(0, 16));
      return JSON.parse(Buffer.concat([decipher.update(combined.subarray(16)), decipher.final()]).toString('utf8'));
    };
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
      const draft = await decryptBody(created);
      assert.ok(draft.split.rows.length >= 1);
      const approved = await fetch(`http://127.0.0.1:${port}/api/pg/owner/electricity/bills/${draft.id}/approve`, {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({})
      });
      assert.equal(approved.status, 200);
      const result = await decryptBody(approved);
      assert.equal(result.bill.status, 'APPROVED');
      assert.ok(result.entries >= 1);
    } finally {
      server.close();
    }
  });
});
