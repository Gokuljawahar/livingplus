import type { Request } from 'express';
export declare const GUEST_TOKEN_HEADER = "x-guest-token";
export declare function issueGuestToken(verifiedPhone: string): string;
/** The verified phone (last 10 digits) from the request's guest token, or null. */
export declare function guestPhoneFrom(req: Request): string | null;
//# sourceMappingURL=guest-token.d.ts.map