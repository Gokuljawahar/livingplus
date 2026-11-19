// Phone OTP for guest verification and resident sign-in, independent of who
// sends the SMS. The API's /pg/config says which provider is active:
//   firebase: Firebase Phone Auth sends and checks the code in the browser;
//             the resulting Firebase ID token is exchanged for our phone token.
//   sms:      the API sends the code (or returns a demo code in development).
// Firebase is loaded on demand, so it costs nothing until a phone is verified.
import api from '../api/axios';
import { apiErrorMessage } from './api-error';
import type { User } from '../context/auth';

export type OtpPurpose = 'BOOKING' | 'TENANT_LOGIN';

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

interface PhoneVerificationConfig {
  provider: 'firebase' | 'sms';
  firebase?: FirebaseWebConfig | null;
}

/** /auth/otp-verify for BOOKING: a single-use phone token (plus a resident session if one exists). */
export interface BookingVerifyResult {
  phoneToken: string;
  resident?: { token: string; user: User };
}

/** /auth/otp-verify for TENANT_LOGIN: the resident's session. */
export interface ResidentLoginResult {
  token: string;
  user: User;
}

export type VerifyResultFor<P extends OtpPurpose> = P extends 'TENANT_LOGIN' ? ResidentLoginResult : BookingVerifyResult;

/** A sent code, waiting for the user to type it in. */
export interface PhoneChallenge<P extends OtpPurpose = OtpPurpose> {
  /** Demo code, only from the local SMS provider without a real gateway. */
  devCode?: string;
  /** Checks the code and returns the API's /auth/otp-verify response body. */
  verify(code: string): Promise<VerifyResultFor<P>>;
}

let configPromise: Promise<PhoneVerificationConfig> | null = null;

function loadConfig(): Promise<PhoneVerificationConfig> {
  if (!configPromise) {
    configPromise = api.get('/pg/config')
      .then((response) => (response.data?.phoneVerification as PhoneVerificationConfig) || { provider: 'sms' })
      .catch((error) => {
        configPromise = null;
        throw error;
      });
  }
  return configPromise;
}

/** "98765 43210" or "919876543210" -> "+919876543210" (India by default). */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

const FIREBASE_MESSAGES: Record<string, string> = {
  'auth/invalid-phone-number': 'Enter a valid phone number',
  'auth/missing-phone-number': 'Enter your phone number',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/quota-exceeded': 'Verification is busy right now. Try again shortly.',
  'auth/invalid-verification-code': 'Invalid verification code',
  'auth/code-expired': 'Code expired. Request a new one.',
  'auth/captcha-check-failed': 'Verification check failed. Request a new code.',
  'auth/network-request-failed': 'Network error. Check your connection and retry.'
};

/** User-facing message for an OTP failure from either Firebase or the API. */
export function phoneOtpErrorMessage(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  return FIREBASE_MESSAGES[code] || apiErrorMessage(error, fallback);
}

let recaptcha: { clear(): void } | null = null;

async function startFirebase<P extends OtpPurpose>(config: FirebaseWebConfig, phone: string, purpose: P): Promise<PhoneChallenge<P>> {
  const [{ getApps, initializeApp }, { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth')
  ]);
  const app = getApps().find((candidate) => candidate.name === 'livingplus') ?? initializeApp(config, 'livingplus');
  const auth = getAuth(app);

  // Invisible reCAPTCHA: Firebase's abuse check before it sends an SMS.
  let container = document.getElementById('lp-recaptcha');
  if (!container) {
    container = document.createElement('div');
    container.id = 'lp-recaptcha';
    document.body.appendChild(container);
  }
  recaptcha?.clear();
  const verifier = new RecaptchaVerifier(auth, container, { size: 'invisible' });
  recaptcha = verifier;

  let confirmation;
  try {
    confirmation = await signInWithPhoneNumber(auth, toE164(phone), verifier);
  } catch (error) {
    verifier.clear();
    recaptcha = null;
    throw error;
  }

  return {
    async verify(code: string) {
      const credential = await confirmation.confirm(code.trim());
      const firebaseIdToken = await credential.user.getIdToken();
      // The app keeps its own session; the Firebase session was only the proof.
      await signOut(auth).catch(() => undefined);
      const response = await api.post('/auth/otp-verify', { phone, purpose, firebaseIdToken });
      return response.data as VerifyResultFor<P>;
    }
  };
}

/** Sends a verification code to `phone` with the configured provider. */
export async function startPhoneVerification<P extends OtpPurpose>(phone: string, purpose: P): Promise<PhoneChallenge<P>> {
  const config = await loadConfig();
  if (config.provider === 'firebase') {
    if (!config.firebase) throw new Error('Phone verification is not configured yet');
    return startFirebase(config.firebase, phone, purpose);
  }
  const response = await api.post('/auth/otp-request', { phone, purpose });
  return {
    ...(response.data?.devCode ? { devCode: String(response.data.devCode) } : {}),
    async verify(code: string) {
      const verified = await api.post('/auth/otp-verify', { phone, code, purpose });
      return verified.data as VerifyResultFor<P>;
    }
  };
}
