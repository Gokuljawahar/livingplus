import { useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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

interface OutboxStoreState {
  items: QueuedMaintenanceTicket[];
  isOnline: boolean;
  flushing: boolean;
  setItems: (items: QueuedMaintenanceTicket[]) => void;
  setOnline: (isOnline: boolean) => void;
  setFlushing: (flushing: boolean) => void;
}

export const useOutboxStore = create<OutboxStoreState>()(
  persist(
    (set) => ({
      items: [],
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      flushing: false,
      setItems: (items) => set({ items }),
      setOnline: (isOnline) => set({ isOnline }),
      setFlushing: (flushing) => set({ flushing })
    }),
    {
      name: 'lp_offline_ticket_outbox_v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items })
    }
  )
);

let firestorePromise: Promise<Firestore | null> | null = null;

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
 * `outbox/{firebaseUid}/tickets/{ticketId}` and mirrors in Zustand persist store.
 */
export async function queueOfflineTicket(
  ticket: Omit<QueuedMaintenanceTicket, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<QueuedMaintenanceTicket> {
  const entry: QueuedMaintenanceTicket = {
    ...ticket,
    id: ticket.id || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: ticket.createdAt || new Date().toISOString()
  };

  const existing = useOutboxStore.getState().items.filter((item) => item.id !== entry.id);
  useOutboxStore.getState().setItems([entry, ...existing]);

  try {
    const remote = await getOutboxFirestore();
    if (remote) {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(remote.db, 'outbox', remote.uid, 'tickets', entry.id), entry);
    }
  } catch {
    // Zustand persist cache preserves the entry until online.
  }

  return entry;
}

export async function listQueuedTickets(tenantId?: string): Promise<QueuedMaintenanceTicket[]> {
  const byId = new Map<string, QueuedMaintenanceTicket>();
  for (const item of useOutboxStore.getState().items) {
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
    // Keep Zustand persisted items when Firestore cannot be reached
  }

  const all = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useOutboxStore.getState().setItems(all);
  return tenantId ? all.filter((item) => item.tenantId === tenantId) : all;
}

async function deleteQueuedTicket(id: string): Promise<void> {
  const next = useOutboxStore.getState().items.filter((item) => item.id !== id);
  useOutboxStore.getState().setItems(next);

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
 * React hook keeping queued offline maintenance tickets in sync via Zustand
 * and flushing them automatically when connectivity returns (`window` `'online'` event).
 */
export function useOfflineTicketOutbox(
  tenantIds: string[],
  submitFn: (ticket: QueuedMaintenanceTicket) => Promise<void>,
  onFlushed?: () => Promise<unknown>
) {
  const allItems = useOutboxStore((s) => s.items);
  const isOnline = useOutboxStore((s) => s.isOnline);
  const flushing = useOutboxStore((s) => s.flushing);
  const setOnline = useOutboxStore((s) => s.setOnline);
  const setFlushing = useOutboxStore((s) => s.setFlushing);

  const tenantIdsKey = tenantIds.join(',');
  const allowedIds = tenantIdsKey ? tenantIdsKey.split(',') : [];
  const queuedTickets = allowedIds.length
    ? allItems.filter((item) => allowedIds.includes(item.tenantId))
    : allItems;

  const reload = useCallback(async () => {
    await listQueuedTickets();
  }, []);

  const flush = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { sentCount: 0, remainingCount: queuedTickets.length };
    }
    setFlushing(true);
    try {
      const res = await flushOfflineTicketOutbox(submitFn);
      if (res.sentCount > 0) {
        toast.success(`${res.sentCount} offline report${res.sentCount === 1 ? '' : 's'} sent`);
        await onFlushed?.();
      }
      return res;
    } finally {
      setFlushing(false);
    }
  }, [submitFn, onFlushed, queuedTickets.length, setFlushing]);

  useEffect(() => {
    void listQueuedTickets();

    const handleOnline = () => {
      setOnline(true);
      void flush();
    };
    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flush, setOnline, tenantIdsKey]);

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
  useOutboxStore.setState({ items: [], flushing: false, isOnline: true });
}
