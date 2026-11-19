export type OtpProvider = 'firebase' | 'sms';
export declare const otpProvider: () => OtpProvider;
/** Public Firebase web config for the browser SDK (these values are not secrets). */
export declare function firebaseWebConfig(): {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
} | null;
export interface VerifiedPhone {
    /** Digits only, e.g. "919876543210". */
    phone: string;
    /** Seconds since epoch when the user completed the SMS challenge. */
    authTime: number;
    uid: string;
}
type Verifier = (idToken: string) => Promise<{
    phone_number?: string;
    auth_time: number;
    uid: string;
    firebase?: {
        sign_in_provider?: string;
    };
}>;
/** Test hook: replace Firebase token verification (null restores). */
export declare function setFirebaseVerifierForTests(verifier: Verifier | null): void;
/**
 * Verifies a Firebase ID token from a phone sign-in and returns the phone
 * number it proves. Throws PHONE_TOKEN_INVALID for anything else.
 */
export declare function verifyFirebasePhoneToken(idToken: string, now?: number): Promise<VerifiedPhone>;
export {};
//# sourceMappingURL=phone-verification.d.ts.map