import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
const googlePopup = vi.hoisted(() => vi.fn());
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  GoogleAuthProvider: class { setCustomParameters() {} },
  signInWithPopup: googlePopup,
  signOut: async () => undefined
}));

import GoogleLinkSection from './GoogleLinkSection';
import { AuthProvider } from '../context/AuthContext';
import { renderWithProviders } from '../test/render';

const firebase = { apiKey: 'AIza-test', authDomain: 'demo.firebaseapp.com', projectId: 'demo', appId: '' };
const owner = { id: 'u1', email: 'owner@example.com', name: 'Owner', role: 'PG_OWNER' };

function signedInAs(user: object) {
  localStorage.setItem('ownerToken', 't');
  localStorage.setItem('ownerUser', JSON.stringify(user));
}

beforeEach(() => {
  api.post.mockReset();
  api.get.mockReset();
  api.delete.mockReset();
  googlePopup.mockReset();
});

describe('GoogleLinkSection', () => {
  it('stays hidden when Google sign-in is off', async () => {
    api.get.mockResolvedValue({ data: { googleSignIn: null } });
    signedInAs(owner);
    renderWithProviders(<AuthProvider><GoogleLinkSection /></AuthProvider>);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /google account/i })).not.toBeInTheDocument();
  });

  it('links the Google account chosen in the pop-up, then offers to unlink', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: { googleSignIn: { firebase } } });
    googlePopup.mockResolvedValue({ user: { getIdToken: async () => 'firebase-id-token' } });
    api.post.mockResolvedValue({ data: { ...owner, googleLinked: true } });
    signedInAs(owner);
    renderWithProviders(<AuthProvider><GoogleLinkSection /></AuthProvider>);

    await user.click(await screen.findByRole('button', { name: 'Link Google account' }));
    expect(api.post).toHaveBeenCalledWith('/auth/google/link', { firebaseIdToken: 'firebase-id-token' });
    expect(await screen.findByRole('button', { name: 'Unlink Google account' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('ownerUser')!).googleLinked).toBe(true);
  });

  it('is not offered to the platform admin, who uses ADMIN_GOOGLE_EMAILS', async () => {
    api.get.mockResolvedValue({ data: { googleSignIn: { firebase } } });
    signedInAs({ ...owner, id: 'env-admin', role: 'SUPER_ADMIN' });
    renderWithProviders(<AuthProvider><GoogleLinkSection /></AuthProvider>);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /google account/i })).not.toBeInTheDocument();
  });
});
