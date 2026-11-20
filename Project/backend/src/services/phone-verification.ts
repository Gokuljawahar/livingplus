// Who proves phone ownership for OTP flows (OTP_PROVIDER):
//   "firebase": the browser verifies the number with Firebase Phone Auth and
//               sends us the resulting Firebase ID token; we verify the token
//               and read the phone number from it. No SMS provider needed.
//   "sms"     : the API generates the code and sends it via SMS_API_URL
//               (outside production without SMS_API_URL, the code is returned
//               as devCode for local testing).
// Either way, the rest of the flow (phone tokens, resident login) is unchanged.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export type OtpProvider = 'firebase' | 'sms';

/** "Sign in with Google" for owners, wardens and admins (needs the Firebase web config). */
export const googleSignInEnabled = (): boolean => process.env.ENABLE_GOOGLE_SIGN_IN === 'true' && firebaseWebConfig() !== null;

export const otpProvider = (): OtpProvider => (process.env.OTP_PROVIDER === 'firebase' ? 'firebase' : 'sms');

/** Public Firebase web config for the browser SDK (these values are not secrets). */
export function firebaseWebConfig(): { apiKey: string; authDomain: string; projectId: string; appId: string } | null {
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const apiKey = process.env.FIREBASE_WEB_API_KEY || '';
  if (!projectId || !apiKey) return null;
  return {
    apiKey,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    appId: process.env.FIREBASE_APP_ID || ''
  };
}

export interface VerifiedPhone {
  /** Digits only, e.g. "919876543210". */
  phone: string;
  /** Seconds since epoch when the user completed the SMS challenge. */
  authTime: number;
  uid: string;
}

type Verifier = (idToken: string) => Promise<{
  phone_number?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  auth_time: number;
  uid: string;
  firebase?: { sign_in_provider?: string };
}>;

let verifierOverride: Verifier | null = null;

/** Test hook: replace Firebase token verification (null restores). */
export function setFirebaseVerifierForTests(verifier: Verifier | null): void {
  verifierOverride = verifier;
}

function firebaseVerifier(): Verifier {
  if (verifierOverride) return verifierOverride;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('FIREBASE_NOT_CONFIGURED');
  // Verifying ID tokens needs only the project id: Google's public signing
  // keys are fetched and cached by the SDK. No service account key required.
  const app = getApps().find((a) => a.name === 'phone-verification') ?? initializeApp({ projectId }, 'phone-verification');
  const auth = getAuth(app);
  return (idToken) => auth.verifyIdToken(idToken, false);
}

/** Tokens older than this are refused, so a leaked token cannot be replayed later. */
const MAX_TOKEN_AGE_SECONDS = 10 * 60;

/**
 * Verifies a Firebase ID token from a phone sign-in and returns the phone
 * number it proves. Throws PHONE_TOKEN_INVALID for anything else.
 */
export async function verifyFirebasePhoneToken(idToken: string, now = Date.now()): Promise<VerifiedPhone> {
  let decoded;
  try {
    decoded = await firebaseVerifier()(idToken);
  } catch (error: any) {
    if (error?.message === 'FIREBASE_NOT_CONFIGURED') throw error;
    throw new Error('PHONE_TOKEN_INVALID');
  }
  const phone = String(decoded.phone_number || '').replace(/\D/g, '');
  if (!phone || decoded.firebase?.sign_in_provider !== 'phone') throw new Error('PHONE_TOKEN_INVALID');
  if (!decoded.auth_time || now / 1000 - decoded.auth_time > MAX_TOKEN_AGE_SECONDS) throw new Error('PHONE_TOKEN_INVALID');
  return { phone, authTime: decoded.auth_time, uid: decoded.uid };
}

export interface VerifiedGoogleAccount {
  /** Lower-cased, verified by Google. */
  email: string;
  name: string;
  uid: string;
}

/**
 * Verifies a Firebase ID token from a Google sign-in and returns the Google
 * account's verified email. Throws GOOGLE_TOKEN_INVALID for anything else.
 */
export async function verifyFirebaseGoogleToken(idToken: string, now = Date.now()): Promise<VerifiedGoogleAccount> {
  let decoded;
  try {
    decoded = await firebaseVerifier()(idToken);
  } catch (error: any) {
    if (error?.message === 'FIREBASE_NOT_CONFIGURED') throw error;
    throw new Error('GOOGLE_TOKEN_INVALID');
  }
  const email = String(decoded.email || '').trim().toLowerCase();
  if (!email || decoded.email_verified !== true || decoded.firebase?.sign_in_provider !== 'google.com') throw new Error('GOOGLE_TOKEN_INVALID');
  if (!decoded.auth_time || now / 1000 - decoded.auth_time > MAX_TOKEN_AGE_SECONDS) throw new Error('GOOGLE_TOKEN_INVALID');
  return { email, name: String(decoded.name || '').trim(), uid: decoded.uid };
}
