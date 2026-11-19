import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));
const googlePopup = vi.hoisted(() => vi.fn());
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  GoogleAuthProvider: class { setCustomParameters() {} },
  signInWithPopup: googlePopup,
  signOut: async () => undefined
}));

import LoginPage from './LoginPage';
import { AuthProvider } from '../context/AuthContext';
import { renderWithProviders } from '../test/render';

const firebase = { apiKey: 'AIza-test', authDomain: 'demo.firebaseapp.com', projectId: 'demo', appId: '' };

beforeEach(() => {
  api.post.mockReset();
  api.get.mockReset();
  api.get.mockResolvedValue({ data: { googleSignIn: null } });
  googlePopup.mockReset();
});

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

  it('hides Google sign-in unless the server enables it', async () => {
    renderWithProviders(<AuthProvider><LoginPage /></AuthProvider>);
    await screen.findByRole('button', { name: /sign in/i });
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: /continue with google/i })).not.toBeInTheDocument();
  });

  it('signs in with Google and exchanges the Firebase token for a session', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: { googleSignIn: { firebase } } });
    googlePopup.mockResolvedValue({ user: { getIdToken: async () => 'firebase-id-token' } });
    api.post.mockResolvedValue({ data: { token: 'g-token', user: { id: 'u2', email: 'owner@example.com', name: 'Owner', role: 'PG_OWNER' } } });
    renderWithProviders(<AuthProvider><LoginPage /></AuthProvider>);

    await user.click(await screen.findByRole('button', { name: /continue with google/i }));
    await vi.waitFor(() => expect(localStorage.getItem('ownerToken')).toBe('g-token'));
    expect(api.post).toHaveBeenCalledWith('/auth/google', { firebaseIdToken: 'firebase-id-token' });
  });

  it('shows the server reason when Google sign-in is refused, and stays quiet on cancel', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: { googleSignIn: { firebase } } });
    googlePopup.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    renderWithProviders(<AuthProvider><LoginPage /></AuthProvider>);

    const button = await screen.findByRole('button', { name: /continue with google/i });
    await user.click(button);
    await vi.waitFor(() => expect(googlePopup).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    googlePopup.mockResolvedValueOnce({ user: { getIdToken: async () => 'firebase-id-token' } });
    api.post.mockRejectedValueOnce({ response: { data: { message: 'No LivingPlus account uses this Google email.' } } });
    await user.click(await screen.findByRole('button', { name: /continue with google/i }));
    expect(await screen.findByText('No LivingPlus account uses this Google email.')).toBeInTheDocument();
  });
});
