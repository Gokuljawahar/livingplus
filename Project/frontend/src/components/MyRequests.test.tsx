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
    renderWithProviders(<MyRequests phone="9876543210" />);
    expect(await screen.findByText('Sunrise PG')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/pg/bookings/mine', { params: { phone: '9876543210' } });
  });

  it('cancels a request and refreshes the list', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.get.mockResolvedValueOnce({ data: [pending] }).mockResolvedValueOnce({ data: [{ ...pending, status: 'CANCELLED' }] });
    api.post.mockResolvedValue({ data: {} });
    renderWithProviders(<MyRequests phone="9876543210" />);

    await user.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(api.post).toHaveBeenCalledWith('/pg/bookings/BK-1/cancel', { phone: '9876543210' });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });
});
