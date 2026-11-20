// "Sign in with Google" for owners, wardens and platform admins.
// The browser signs in with Firebase Auth (Google provider), then trades the
// Firebase ID token for this app's own session at /auth/google. Google only
// proves the email; the API decides the role and which PGs the account sees.
// Firebase is loaded on demand, so the login page stays light until it is used.
import api from '../api/axios';
import { apiErrorMessage } from './api-error';
import type { User } from '../context/auth';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface GoogleSignInResult {
  token: string;
  user: User;
}

/** The API's /pg/config says whether Google sign-in is on; null when off or unreachable. */
export async function loadGoogleSignInConfig(): Promise<FirebaseWebConfig | null> {
  try {
    const response = await api.get('/pg/config');
    return (response.data?.googleSignIn?.firebase as FirebaseWebConfig | undefined) || null;
  } catch {
    return null;
  }
}

const FIREBASE_MESSAGES: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
  'auth/unauthorized-domain': 'Google sign-in is not set up for this address yet.',
  'auth/network-request-failed': 'Network error. Check your connection and retry.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/account-exists-with-different-credential': 'This email already uses a different sign-in method.'
};

/** Closing the Google window is a choice, not an error worth showing. */
export function isGoogleSignInCancelled(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

/** User-facing message for a failure from either Firebase or the API. */
export function googleSignInErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  return FIREBASE_MESSAGES[code] || apiErrorMessage(error, 'Google sign-in failed. Please try again.');
}

/** Opens Google's account chooser and returns a fresh Firebase ID token for it. */
async function googleIdToken(config: FirebaseWebConfig): Promise<string> {
  const [{ getApps, initializeApp }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth')
  ]);
  const app = getApps().find((candidate) => candidate.name === 'livingplus') ?? initializeApp(config, 'livingplus');
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const credential = await signInWithPopup(auth, provider);
  const firebaseIdToken = await credential.user.getIdToken();
  // The app keeps its own session; the Firebase session was only the proof.
  await signOut(auth).catch(() => undefined);
  return firebaseIdToken;
}

/** Signs in with a Google account the user linked earlier; returns this app's session. */
export async function signInWithGoogle(config: FirebaseWebConfig): Promise<GoogleSignInResult> {
  const response = await api.post('/auth/google', { firebaseIdToken: await googleIdToken(config) });
  return response.data as GoogleSignInResult;
}

/** Links a Google account to the signed-in staff account (proves control of both). */
export async function linkGoogleAccount(config: FirebaseWebConfig): Promise<User> {
  const response = await api.post('/auth/google/link', { firebaseIdToken: await googleIdToken(config) });
  return response.data as User;
}

/** Removes the Google link; the account signs in with its password again. */
export async function unlinkGoogleAccount(): Promise<User> {
  const response = await api.delete('/auth/google/link');
  return response.data as User;
}
