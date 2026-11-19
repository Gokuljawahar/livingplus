import { describe, expect, it } from 'vitest';
import { clearGuestSession, getGuestSession, normalizePhoneDigits, saveGuestSession, updateGuestToken } from './guest-session';

describe('guest session', () => {
  it('normalizes phone digits', () => {
    expect(normalizePhoneDigits('+91 98765-43210')).toMatch(/9876543210$/);
  });

  it('saves, updates and clears the verified guest', () => {
    saveGuestSession('9876543210', 'vrf_1');
    expect(getGuestSession()).toMatchObject({ phone: '9876543210', phoneToken: 'vrf_1' });
    updateGuestToken('vrf_2');
    expect(getGuestSession()?.phoneToken).toBe('vrf_2');
    clearGuestSession();
    expect(getGuestSession()).toBeNull();
  });
});
