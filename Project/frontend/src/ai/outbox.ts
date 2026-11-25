import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Firestore } from 'firebase/firestore';
import { ensureAnonymousFirebaseUser, getLivingPlusFirebaseApp } from './firebase';

export interface QueuedMaintenanceTicket {
  id: string;
  tenantId: string;
  category: string;
  priority: string;
  title: string;
  description: string;
  photoDataUrl?: string | null;
  triageSource?: 'on-device' | 'cloud' | null;
  safetyRisk?: boolean;
  createdAt: string;
}

const LOCAL_STORAGE_KEY = 'lp_offline_ticket_outbox_v1';
let firestorePromise: Promise<Firestore | null> | null = null;
const outboxListeners = new Set<() => void>();

function notifyOutbox(): void {
  for (const listener of outboxListeners) listener();
}

function readLocalOutbox(): QueuedMaintenanceTicket[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalOutbox(items: QueuedMaintenanceTicket[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function getOutboxFirestore(): Promise<{ db: Firestore; uid: string } | null> {
  try {
    const [app, uid] = await Promise.all([
      getLivingPlusFirebaseApp(),
      ensureAnonymousFirebaseUser()
    ]);
    if (!app || !uid) return null;

    if (!firestorePromise) {
      firestorePromise = (async () => {
        const {
          initializeFirestore,
          getFirestore,
          persistentLocalCache
        } = await import('firebase/firestore');
        try {
          return initializeFirestore(app, { localCache: persistentLocalCache() });
        } catch {
          return getFirestore(app);
        }
      })();
    }

    const db = await firestorePromise;
    return db ? { db, uid } : null;
  } catch {
    return null;
  }
}

/**
 * Queues a triaged maintenance report when the resident has weak/no signal.
 * Writes to Cloud Firestore with `persistentLocalCache()` under
 * `outbox/{firebaseUid}/tickets/{ticketId}` and mirrors locally so the
 * queued ticket renders and auto-flushes reliably across offline reloads.
 */
export async function queueOfflineTicket(
  ticket: Omit<QueuedMaintenanceTicket, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<QueuedMaintenanceTicket> {
  const entry: QueuedMaintenanceTicket = {
    ...ticket,
    id: ticket.id || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: ticket.createdAt || new Date().toISOString()
  };

  const existing = readLocalOutbox().filter((item) => item.id !== entry.id);
  writeLocalOutbox([entry, ...existing]);
  notifyOutbox();

  try {
    const remote = await getOutboxFirestore();
    if (remote) {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(remote.db, 'outbox', remote.uid, 'tickets', entry.id), entry);
    }
  } catch {
    // Local cache / localStorage mirror preserves the entry until online.
  }

  return entry;
}

export async function listQueuedTickets(tenantId?: string): Promise<QueuedMaintenanceTicket[]> {
  const byId = new Map<string, QueuedMaintenanceTicket>();
  for (const item of readLocalOutbox()) {
    byId.set(item.id, item);
  }

  try {
    const remote = await getOutboxFirestore();
    if (remote) {
      const { collection, getDocs } = await import('firebase/firestore');
      const snap = await getDocs(collection(remote.db, 'outbox', remote.uid, 'tickets'));
      snap.forEach((d) => {
        const data = d.data() as QueuedMaintenanceTicket;
        if (data?.id) byId.set(data.id, data);
      });
    }
  } catch {
    // Keep local mirror items when Firestore cannot be reached
  }

  const all = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return tenantId ? all.filter((item) => item.tenantId === tenantId) : all;
}

async function deleteQueuedTicket(id: string): Promise<void> {
  writeLocalOutbox(readLocalOutbox().filter((item) => item.id !== id));
  notifyOutbox();

  try {
    const remote = await getOutboxFirestore();
    if (remote) {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(remote.db, 'outbox', remote.uid, 'tickets', id));
    }
  } catch {
    // Already removed locally
  }
}

export async function flushOfflineTicketOutbox(
  submitFn: (ticket: QueuedMaintenanceTicket) => Promise<void>
): Promise<{ sentCount: number; remainingCount: number }> {
  const queued = await listQueuedTickets();
  let sentCount = 0;

  for (const item of queued) {
    try {
      await submitFn(item);
      await deleteQueuedTicket(item.id);
      sentCount += 1;
    } catch {
      // Stop on network failure or error and leave remaining queued
      break;
    }
  }

  const remaining = await listQueuedTickets();
  return { sentCount, remainingCount: remaining.length };
}

/**
 * React hook keeping queued offline maintenance tickets in sync and flushing
 * them automatically when connectivity returns (`window` `'online'` event).
 */
export function useOfflineTicketOutbox(
  tenantIds: string[],
  submitFn: (ticket: QueuedMaintenanceTicket) => Promise<void>,
  onFlushed?: () => Promise<unknown>
) {
  const [queuedTickets, setQueuedTickets] = useState<QueuedMaintenanceTicket[]>(() => {
    const initial = readLocalOutbox();
    return tenantIds.length ? initial.filter((item) => tenantIds.includes(item.tenantId)) : initial;
  });
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [flushing, setFlushing] = useState(false);

  const tenantIdsKey = tenantIds.join(',');

  const reload = useCallback(async () => {
    const items = await listQueuedTickets();
    setQueuedTickets(
      tenantIds.length ? items.filter((item) => tenantIds.includes(item.tenantId)) : items
    );
  }, [tenantIds, tenantIdsKey]);

  const flush = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { sentCount: 0, remainingCount: queuedTickets.length };
    setFlushing(true);
    try {
      const res = await flushOfflineTicketOutbox(submitFn);
      if (res.sentCount > 0) {
        toast.success(`${res.sentCount} offline report${res.sentCount === 1 ? '' : 's'} sent`);
        await reload();
        await onFlushed?.();
      }
      return res;
    } finally {
      setFlushing(false);
    }
  }, [submitFn, onFlushed, reload, queuedTickets.length]);

  useEffect(() => {
    let cancelled = false;
    void listQueuedTickets().then((items) => {
      if (!cancelled) {
        setQueuedTickets(
          tenantIds.length ? items.filter((item) => tenantIds.includes(item.tenantId)) : items
        );
      }
    });

    const reloadHandler = () => {
      void reload();
    };
    outboxListeners.add(reloadHandler);

    const handleOnline = () => {
      setIsOnline(true);
      void flush();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      cancelled = true;
      outboxListeners.delete(reloadHandler);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [reload, flush, tenantIds, tenantIdsKey]);

  return {
    queuedTickets,
    isOnline,
    flushing,
    reloadOutbox: reload,
    flushOutbox: flush
  };
}

export function _resetOutboxForTests(): void {
  firestorePromise = null;
  writeLocalOutbox([]);
  notifyOutbox();
}
