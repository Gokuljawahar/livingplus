import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));

beforeEach(() => {
  vi.resetModules();
  api.get.mockReset();
  api.post.mockReset();
});

describe('phone OTP helper', () => {
  it('formats Indian numbers as E.164', async () => {
    const { toE164 } = await import('./phone-otp');
    expect(toE164('98765 43210')).toBe('+919876543210');
    expect(toE164('919876543210')).toBe('+919876543210');
  });

  it('maps Firebase error codes to friendly messages and falls back to API messages', async () => {
    const { phoneOtpErrorMessage } = await import('./phone-otp');
    expect(phoneOtpErrorMessage({ code: 'auth/invalid-verification-code' }, 'x')).toBe('Invalid verification code');
    expect(phoneOtpErrorMessage({ response: { data: { message: 'Code expired. Request a new one.' } } }, 'x')).toBe('Code expired. Request a new one.');
    expect(phoneOtpErrorMessage(new Error('boom'), 'Could not send code')).toBe('Could not send code');
  });

  it('uses server-sent codes when the API says provider sms', async () => {
    api.get.mockResolvedValue({ data: { phoneVerification: { provider: 'sms' } } });
    api.post.mockImplementation(async (url: string) => (url === '/auth/otp-request'
      ? { data: { devCode: '123456' } }
      : { data: { phoneToken: 'vrf_abc' } }));
    const { startPhoneVerification } = await import('./phone-otp');
    const challenge = await startPhoneVerification('9876543210', 'BOOKING');
    expect(challenge.devCode).toBe('123456');
    await expect(challenge.verify(' 123456 ')).resolves.toEqual({ phoneToken: 'vrf_abc' });
    expect(api.post).toHaveBeenLastCalledWith('/auth/otp-verify', { phone: '9876543210', code: ' 123456 ', purpose: 'BOOKING' });
  });

  it('refuses Firebase mode without a web config', async () => {
    api.get.mockResolvedValue({ data: { phoneVerification: { provider: 'firebase', firebase: null } } });
    const { startPhoneVerification } = await import('./phone-otp');
    await expect(startPhoneVerification('9876543210', 'BOOKING')).rejects.toThrow(/not configured/);
  });

  it('loads the provider config once', async () => {
    api.get.mockResolvedValue({ data: { phoneVerification: { provider: 'sms' } } });
    api.post.mockResolvedValue({ data: {} });
    const { startPhoneVerification } = await import('./phone-otp');
    await startPhoneVerification('9876543210', 'BOOKING');
    await startPhoneVerification('9876543211', 'BOOKING');
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
