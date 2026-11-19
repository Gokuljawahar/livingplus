import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import MyRequests from './MyRequests';
import { renderWithProviders } from '../test/render';

const pending = { id: 'b1', bookingRef: 'BK-1', status: 'PENDING', property: { name: 'Sunrise PG', locality: 'OMR' } };

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe('MyRequests', () => {
  it('loads the guest’s booking requests', async () => {
    api.get.mockResolvedValue({ data: [pending] });
    renderWithProviders(<MyRequests guestToken="gst-token" />);
    expect(await screen.findByText('Sunrise PG')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/pg/bookings/mine', { headers: { 'X-Guest-Token': 'gst-token' } });
  });

  it('cancels a request and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.get.mockResolvedValueOnce({ data: [pending] }).mockResolvedValueOnce({ data: [{ ...pending, status: 'CANCELLED' }] });
    api.post.mockResolvedValue({ data: {} });
    renderWithProviders(<MyRequests guestToken="gst-token" />);

    await user.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(api.post).toHaveBeenCalledWith('/pg/bookings/BK-1/cancel', {}, { headers: { 'X-Guest-Token': 'gst-token' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('asks the guest to verify again when the session is refused', async () => {
    const onSessionExpired = vi.fn();
    api.get.mockRejectedValue({ isAxiosError: true, response: { status: 401, data: { code: 'GUEST_VERIFICATION_REQUIRED' } } });
    renderWithProviders(<MyRequests guestToken="stale" onSessionExpired={onSessionExpired} />);
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });
});
