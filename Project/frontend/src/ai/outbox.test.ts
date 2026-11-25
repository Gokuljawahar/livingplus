import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetOutboxForTests,
  flushOfflineTicketOutbox,
  listQueuedTickets,
  queueOfflineTicket
} from './outbox';
import { _resetFirebaseCacheForTests } from './firebase';

const firestoreMocks = vi.hoisted(() => ({
  initializeFirestore: vi.fn(),
  getFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn()
}));

vi.mock('firebase/app', () => ({
  getApps: vi.fn(() => [{ name: 'livingplus' }]),
  initializeApp: vi.fn()
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: { uid: 'anon-resident-1' } })),
  signInAnonymously: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: firestoreMocks.initializeFirestore,
  getFirestore: firestoreMocks.getFirestore,
  persistentLocalCache: firestoreMocks.persistentLocalCache,
  doc: firestoreMocks.doc,
  setDoc: firestoreMocks.setDoc,
  getDocs: firestoreMocks.getDocs,
  collection: firestoreMocks.collection,
  deleteDoc: firestoreMocks.deleteDoc
}));

describe('Firestore offline maintenance outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetFirebaseCacheForTests();
    _resetOutboxForTests();

    const fakeDb = { _type: 'firestore' };
    firestoreMocks.initializeFirestore.mockReturnValue(fakeDb);
    firestoreMocks.doc.mockImplementation((_db, ...segments) => segments.join('/'));
    firestoreMocks.collection.mockImplementation((_db, ...segments) => segments.join('/'));
    firestoreMocks.setDoc.mockResolvedValue(undefined);
    firestoreMocks.deleteDoc.mockResolvedValue(undefined);
    firestoreMocks.getDocs.mockResolvedValue({ forEach: () => {} });
  });

  it('queues an offline ticket to Firestore persistent cache & local mirror and flushes when back online', async () => {
    const queued = await queueOfflineTicket({
      tenantId: 'stay-1',
      category: 'ELECTRICAL',
      priority: 'URGENT',
      title: 'Sparking switch in basement room',
      description: 'Outlet near staircase sparks when switched on.',
      safetyRisk: true,
      triageSource: 'on-device'
    });

    expect(queued.id).toBeTruthy();
    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      `outbox/anon-resident-1/tickets/${queued.id}`,
      expect.objectContaining({ title: 'Sparking switch in basement room', priority: 'URGENT' })
    );

    const listed = await listQueuedTickets('stay-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe('Sparking switch in basement room');

    const submitted: string[] = [];
    const flushResult = await flushOfflineTicketOutbox(async (ticket) => {
      submitted.push(ticket.id);
    });

    expect(flushResult.sentCount).toBe(1);
    expect(flushResult.remainingCount).toBe(0);
    expect(submitted).toEqual([queued.id]);
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith(
      `outbox/anon-resident-1/tickets/${queued.id}`
    );
    expect(await listQueuedTickets('stay-1')).toHaveLength(0);
  });

  it('keeps tickets queued if submission fails while signal drops again', async () => {
    await queueOfflineTicket({
      tenantId: 'stay-2',
      category: 'PLUMBING',
      priority: 'HIGH',
      title: 'Shower tap leaking',
      description: 'Continuous drip in Room 105.'
    });

    const res = await flushOfflineTicketOutbox(async () => {
      throw new Error('Network Error');
    });

    expect(res.sentCount).toBe(0);
    expect(res.remainingCount).toBe(1);
  });
});
