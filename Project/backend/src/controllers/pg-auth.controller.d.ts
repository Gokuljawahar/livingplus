import type { Request, Response } from 'express';
export declare const login: (req: Request, res: Response) => Promise<any>;
export declare const register: (req: Request, res: Response) => Promise<any>;
/**
 * "Sign in with Google": the browser signs in with Firebase (Google provider)
 * and sends the Firebase ID token. Staff accounts sign in only with a Google
 * account they linked themselves after a password sign-in (matched by the
 * Google uid, never by the unverified email typed at registration), plus the
 * platform admins in ADMIN_GOOGLE_EMAILS. Residents keep using phone OTP.
 */
export declare const googleLogin: (req: Request, res: Response) => Promise<any>;
/**
 * Links the Google account in the Firebase ID token to the signed-in staff
 * account. Doing this while signed in with the password proves the person
 * controls both, so later Google sign-ins can trust the link.
 */
export declare const linkGoogle: (req: Request, res: Response) => Promise<any>;
/** Removes the Google link; the account signs in with its password again. */
export declare const unlinkGoogle: (req: Request, res: Response) => Promise<any>;
export declare const requestOtp: (req: Request, res: Response) => Promise<any>;
export declare const verifyOtp: (req: Request, res: Response) => Promise<any>;
export declare function consumePhoneToken(phone: string, token: string | undefined, purpose?: string, propertyId?: string): Promise<boolean>;
export declare const forgotPassword: (_req: Request, res: Response) => Promise<any>;
export declare const changePassword: (req: Request, res: Response) => Promise<any>;
export declare const adminResetPassword: (req: Request, res: Response) => Promise<any>;
export declare const updateProfile: (req: Request, res: Response) => Promise<any>;
//# sourceMappingURL=pg-auth.controller.d.ts.map