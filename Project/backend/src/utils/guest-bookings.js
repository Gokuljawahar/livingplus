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