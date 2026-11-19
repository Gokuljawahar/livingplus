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
export const otpProvider = () => (process.env.OTP_PROVIDER === 'firebase' ? 'firebase' : 'sms');
/** Public Firebase web config for the browser SDK (these values are not secrets). */
export function firebaseWebConfig() {
    const projectId = process.env.FIREBASE_PROJECT_ID || '';
    const apiKey = process.env.FIREBASE_WEB_API_KEY || '';
    if (!projectId || !apiKey)
        return null;
    return {
        apiKey,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
        projectId,
        appId: process.env.FIREBASE_APP_ID || ''
    };
}
let verifierOverride = null;
/** Test hook: replace Firebase token verification (null restores). */
export function setFirebaseVerifierForTests(verifier) {
    verifierOverride = verifier;
}
function firebaseVerifier() {
    if (verifierOverride)
        return verifierOverride;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId)
        throw new Error('FIREBASE_NOT_CONFIGURED');
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
export async function verifyFirebasePhoneToken(idToken, now = Date.now()) {
    let decoded;
    try {
        decoded = await firebaseVerifier()(idToken);
    }
    catch (error) {
        if (error?.message === 'FIREBASE_NOT_CONFIGURED')
            throw error;
        throw new Error('PHONE_TOKEN_INVALID');
    }
    const phone = String(decoded.phone_number || '').replace(/\D/g, '');
    if (!phone || decoded.firebase?.sign_in_provider !== 'phone')
        throw new Error('PHONE_TOKEN_INVALID');
    if (!decoded.auth_time || now / 1000 - decoded.auth_time > MAX_TOKEN_AGE_SECONDS)
        throw new Error('PHONE_TOKEN_INVALID');
    return { phone, authTime: decoded.auth_time, uid: decoded.uid };
}
//# sourceMappingURL=phone-verification.js.map