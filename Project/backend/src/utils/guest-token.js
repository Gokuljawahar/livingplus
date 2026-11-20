// Guest sessions: proof that a visitor verified a phone number with a code.
// "My requests" and cancelling a request take the phone number from this
// signed token, never from the request, so nobody can read or cancel another
// person's booking requests by typing their number.
import jwt from 'jsonwebtoken';
import { getJwtSecret } from './auth-config.js';
const AUDIENCE = 'livingplus-guest';
export const GUEST_TOKEN_HEADER = 'x-guest-token';
/** Last 10 digits: stored phones mix 9876543210 and 919876543210. */
function phoneKey(phone) {
    return String(phone || '').replace(/\D/g, '').slice(-10);
}
export function issueGuestToken(verifiedPhone) {
    return jwt.sign({ typ: 'guest', phone: phoneKey(verifiedPhone) }, getJwtSecret(), { audience: AUDIENCE, expiresIn: '30d' });
}
/** The verified phone (last 10 digits) from the request's guest token, or null. */
export function guestPhoneFrom(req) {
    const token = String(req.get(GUEST_TOKEN_HEADER) || '').trim();
    if (!token)
        return null;
    try {
        // The audience keeps staff and resident tokens from being accepted here.
        const decoded = jwt.verify(token, getJwtSecret(), { audience: AUDIENCE });
        return decoded.typ === 'guest' && /^\d{10}$/.test(String(decoded.phone)) ? String(decoded.phone) : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=guest-token.js.map