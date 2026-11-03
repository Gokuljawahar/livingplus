export const GUEST_PHONE_KEY = 'guestPhone';
export const GUEST_TOKEN_KEY = 'guestPhoneToken';
export const GUEST_AT_KEY = 'guestPhoneAt';

export interface GuestSession {
  phone: string;
  phoneToken: string;
}

export function normalizePhoneDigits(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

export function saveGuestSession(phone: string, phoneToken: string): GuestSession {
  const session = { phone: normalizePhoneDigits(phone), phoneToken };
  localStorage.setItem(GUEST_PHONE_KEY, session.phone);
  localStorage.setItem(GUEST_TOKEN_KEY, session.phoneToken);
  localStorage.setItem(GUEST_AT_KEY, String(Date.now()));
  return session;
}

export function getGuestSession(): GuestSession | null {
  // The phone stays signed in until explicit sign-out. The OTP phoneToken is
  // single-use (the server consumes it on booking), so it may be empty.
  const phone = normalizePhoneDigits(localStorage.getItem(GUEST_PHONE_KEY) || '');
  if (phone.length < 10) return null;
  return { phone, phoneToken: localStorage.getItem(GUEST_TOKEN_KEY) || '' };
}

export function clearGuestSession(): void {
  localStorage.removeItem(GUEST_PHONE_KEY);
  localStorage.removeItem(GUEST_TOKEN_KEY);
  localStorage.removeItem(GUEST_AT_KEY);
}

export function updateGuestToken(phoneToken: string): void {
  if (phoneToken) localStorage.setItem(GUEST_TOKEN_KEY, phoneToken);
  else localStorage.removeItem(GUEST_TOKEN_KEY);
}
