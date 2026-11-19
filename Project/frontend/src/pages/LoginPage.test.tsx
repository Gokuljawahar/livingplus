import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));

import LoginPage from './LoginPage';
import { AuthProvider } from '../context/AuthContext';
import { renderWithProviders } from '../test/render';

beforeEach(() => api.post.mockReset());

describe('LoginPage', () => {
  it('asks for the mobile number before calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuthProvider><LoginPage /></AuthProvider>);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter your mobile number')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows the server message on failure and signs in on success', async () => {
    const user = userEvent.setup();
    api.post
      .mockRejectedValueOnce({ response: { data: { message: 'Invalid credentials' } } })
      .mockResolvedValueOnce({ data: { token: 't', user: { id: 'u1', email: '', name: 'Owner', role: 'PG_OWNER' } } });
    renderWithProviders(<AuthProvider><LoginPage /></AuthProvider>);

    await user.type(screen.getByLabelText('Mobile number'), '9100000001');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Mobile number'), '{End}');
    expect(screen.queryByText('Invalid credentials')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'right');
    expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(api.post).toHaveBeenLastCalledWith('/auth/login', { email: '9100000001', password: 'right' });
    expect(localStorage.getItem('ownerToken')).toBe('t');
  });
});
