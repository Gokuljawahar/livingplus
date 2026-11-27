import { create } from 'zustand';

export const GUEST_PHONE_KEY = 'guestPhone';
export const GUEST_TOKEN_KEY = 'guestPhoneToken';
export const GUEST_AT_KEY = 'guestPhoneAt';
/** Signed proof of the verified phone; the API reads "My requests" from it, never from a typed number. */
export const GUEST_SESSION_KEY = 'guestSessionToken';

export interface GuestSession {
  phone: string;
  /** Single-use proof for the next booking request (may be empty once used). */
  phoneToken: string;
  /** Long-lived guest session token, sent as X-Guest-Token. */
  guestToken: string;
}

export function normalizePhoneDigits(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

function readStoredGuestSession(): GuestSession | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const phone = normalizePhoneDigits(localStorage.getItem(GUEST_PHONE_KEY) || '');
  const guestToken = localStorage.getItem(GUEST_SESSION_KEY) || '';
  if (phone.length < 10 || !guestToken) return null;
  return { phone, phoneToken: localStorage.getItem(GUEST_TOKEN_KEY) || '', guestToken };
}

interface GuestSessionStoreState {
  revision: number;
  bump: () => void;
}

export const useGuestSessionStore = create<GuestSessionStoreState>((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 }))
}));

export function saveGuestSession(phone: string, phoneToken: string, guestToken: string): GuestSession {
  const session = { phone: normalizePhoneDigits(phone), phoneToken, guestToken };
  localStorage.setItem(GUEST_PHONE_KEY, session.phone);
  localStorage.setItem(GUEST_TOKEN_KEY, session.phoneToken);
  localStorage.setItem(GUEST_SESSION_KEY, session.guestToken);
  localStorage.setItem(GUEST_AT_KEY, String(Date.now()));
  useGuestSessionStore.getState().bump();
  return session;
}

export function getGuestSession(): GuestSession | null {
  return readStoredGuestSession();
}

export function clearGuestSession(): void {
  localStorage.removeItem(GUEST_PHONE_KEY);
  localStorage.removeItem(GUEST_TOKEN_KEY);
  localStorage.removeItem(GUEST_AT_KEY);
  localStorage.removeItem(GUEST_SESSION_KEY);
  useGuestSessionStore.getState().bump();
}

export function updateGuestToken(phoneToken: string): void {
  if (phoneToken) localStorage.setItem(GUEST_TOKEN_KEY, phoneToken);
  else localStorage.removeItem(GUEST_TOKEN_KEY);
  useGuestSessionStore.getState().bump();
}

export function useGuestSession(): GuestSession | null {
  const revision = useGuestSessionStore((s) => s.revision);
  void revision;
  return readStoredGuestSession();
}

export function _resetGuestSessionStoreForTests(): void {
  useGuestSessionStore.setState({ revision: 0 });
}
