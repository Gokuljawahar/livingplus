import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const otp = vi.hoisted(() => ({ startPhoneVerification: vi.fn(), verify: vi.fn() }));
vi.mock('../utils/phone-otp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/phone-otp')>()),
  startPhoneVerification: otp.startPhoneVerification
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import GuestLoginGate from './GuestLoginGate';
import { AuthProvider } from '../context/AuthContext';

function renderGate(onVerified = vi.fn()) {
  render(<MemoryRouter><AuthProvider><GuestLoginGate onVerified={onVerified} /></AuthProvider></MemoryRouter>);
  return onVerified;
}

beforeEach(() => {
  otp.startPhoneVerification.mockReset();
  otp.verify.mockReset();
});

describe('GuestLoginGate', () => {
  it('sends a code, verifies it and stores the guest session', async () => {
    const user = userEvent.setup();
    otp.startPhoneVerification.mockResolvedValue({ devCode: '123456', verify: otp.verify });
    otp.verify.mockResolvedValue({ phoneToken: 'vrf_test', guestToken: 'gst_test' });
    const onVerified = renderGate();

    await user.type(screen.getByPlaceholderText('98765 43210'), '9876543210');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    expect(otp.startPhoneVerification).toHaveBeenCalledWith(expect.stringMatching(/9876543210$/), 'BOOKING');

    await user.type(await screen.findByLabelText('6-digit verification code'), '123456');
    await user.click(screen.getByRole('button', { name: /verify & see requests/i }));

    expect(otp.verify).toHaveBeenCalledWith('123456');
    expect(onVerified).toHaveBeenCalledWith(expect.objectContaining({ phoneToken: 'vrf_test', guestToken: 'gst_test' }));
  });

  it('stays on the phone step when sending fails', async () => {
    const user = userEvent.setup();
    otp.startPhoneVerification.mockRejectedValue({ code: 'auth/too-many-requests' });
    renderGate();
    await user.type(screen.getByPlaceholderText('98765 43210'), '9876543210');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    expect(screen.queryByLabelText('6-digit verification code')).not.toBeInTheDocument();
  });
});
