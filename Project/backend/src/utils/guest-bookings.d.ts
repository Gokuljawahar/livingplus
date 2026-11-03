/**
 * Helpers for the guest "My requests" booking lookup.
 * Guests verify their phone with an OTP at login, then list every booking
 * request placed with that number via GET /pg/bookings/mine?phone=...
 * Kept free of framework imports so the logic stays unit-testable.
 */
export declare function normalizeGuestPhone(phone: unknown): string;
/**
 * Last-10-digits match key for a phone number.
 * Stored booking phones and login phones mix `9876543210` and `919876543210`
 * forms, so both reduce to the same key. Returns null when unusable.
 */
export declare function guestBookingPhoneKey(phone: unknown): string | null;
/**
 * Rejects placeholder text typed into the resident-name field so junk like
 * "sample name" can never become a tenant record. Real single-word names
 * pass; the check needs at least two letters and no placeholder token.
 */
export declare function isPlaceholderResidentName(name: unknown): boolean;
/** Prisma `where` clause for the guest booking lookup, or null when invalid. */
export declare function buildGuestBookingWhere(phone: unknown, propertyId?: string): {
    phone: {
        endsWith: string;
    };
    propertyId?: string;
} | null;
//# sourceMappingURL=guest-bookings.d.ts.map