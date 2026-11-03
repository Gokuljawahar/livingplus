/**
 * Helpers for the guest "My requests" booking lookup.
 * Guests verify their phone with an OTP at login, then list every booking
 * request placed with that number via GET /pg/bookings/mine?phone=...
 * Kept free of framework imports so the logic stays unit-testable.
 */
export function normalizeGuestPhone(phone) {
    return String(phone ?? '').replace(/\D/g, '');
}
/**
 * Last-10-digits match key for a phone number.
 * Stored booking phones and login phones mix `9876543210` and `919876543210`
 * forms, so both reduce to the same key. Returns null when unusable.
 */
export function guestBookingPhoneKey(phone) {
    const digits = normalizeGuestPhone(phone);
    if (digits.length < 10)
        return null;
    return digits.slice(-10);
}
const BANNED_NAME_SUBSTRINGS = ['sample', 'dummy', 'lorem', 'asdf', 'qwerty'];
const BANNED_NAME_EXACT = new Set(['test', 'demo', 'abc', 'xyz', 'guest', 'user', 'name', 'temp', 'na', 'n/a', 'none']);
/**
 * Rejects placeholder text typed into the resident-name field so junk like
 * "sample name" can never become a tenant record. Real single-word names
 * pass; the check needs at least two letters and no placeholder token.
 */
export function isPlaceholderResidentName(name) {
    const text = String(name ?? '').trim();
    if (text.length < 2)
        return true;
    const letters = text.match(/[A-Za-z]/g) || [];
    if (letters.length < 2)
        return true;
    const lowered = text.toLowerCase();
    if (BANNED_NAME_EXACT.has(lowered))
        return true;
    return BANNED_NAME_SUBSTRINGS.some((token) => lowered.includes(token));
}
/** Prisma `where` clause for the guest booking lookup, or null when invalid. */
export function buildGuestBookingWhere(phone, propertyId) {
    const key = guestBookingPhoneKey(phone);
    if (!key)
        return null;
    return {
        phone: { endsWith: key },
        ...(propertyId ? { propertyId } : {})
    };
}
//# sourceMappingURL=guest-bookings.js.map