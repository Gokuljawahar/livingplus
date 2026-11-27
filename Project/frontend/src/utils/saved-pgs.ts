// Shortlist of saved PGs keyed by the verified guest's phone number, managed by Zustand.
import { create } from 'zustand';

const KEY_PREFIX = 'livingplus_saved_pgs_';

function normalizedPhoneKey(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function storageKey(phone: string): string {
  return `${KEY_PREFIX}${normalizedPhoneKey(phone)}`;
}

function readStoredIds(phone: string): string[] {
  const key = storageKey(phone);
  if (key === KEY_PREFIX) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

interface SavedPgsState {
  byPhone: Record<string, string[]>;
  getForPhone: (phone: string) => string[];
  toggle: (phone: string, propertyId: string) => string[];
}

export const useSavedPgsStore = create<SavedPgsState>((set, get) => ({
  byPhone: {},
  getForPhone: (phone: string) => {
    const pKey = normalizedPhoneKey(phone);
    if (!pKey) return [];
    const cached = get().byPhone[pKey];
    if (cached) return cached;
    return readStoredIds(phone);
  },
  toggle: (phone: string, propertyId: string) => {
    const pKey = normalizedPhoneKey(phone);
    if (!pKey) return [];
    const current = get().getForPhone(phone);
    const next = current.includes(propertyId)
      ? current.filter((id) => id !== propertyId)
      : [...current, propertyId];
    try {
      localStorage.setItem(`${KEY_PREFIX}${pKey}`, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
    set((s) => ({ byPhone: { ...s.byPhone, [pKey]: next } }));
    return next;
  }
}));

export function getSavedPgIds(phone: string): string[] {
  return useSavedPgsStore.getState().getForPhone(phone);
}

export function toggleSavedPg(phone: string, propertyId: string): string[] {
  return useSavedPgsStore.getState().toggle(phone, propertyId);
}

export function useSavedPgs(phone: string): string[] {
  const pKey = normalizedPhoneKey(phone);
  const cached = useSavedPgsStore((s) => (pKey ? s.byPhone[pKey] : undefined));
  if (!pKey) return [];
  return cached ?? readStoredIds(phone);
}

export function _resetSavedPgsStoreForTests(): void {
  useSavedPgsStore.setState({ byPhone: {} });
}
