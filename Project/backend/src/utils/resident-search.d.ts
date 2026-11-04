/**
 * Helpers that keep a resident's own PG out of the public "search other PGs"
 * flow. A resident who wants a different room uses the in-portal room change
 * (see the room-change controller) instead of booking a new bed in the same
 * property. Kept free of framework imports so the logic stays unit-testable.
 */
/** Tenant statuses that mean the resident currently lives in the PG. */
export declare const ACTIVE_RESIDENT_STATUSES: readonly ["ACTIVE", "NOTICE_PERIOD", "RESERVED"];
/** Rejection message for booking attempts inside the resident's own PG. */
export declare const OWN_PROPERTY_BOOKING_MESSAGE = "You already stay at this PG \u2014 request a room change from your resident portal instead of a new booking.";
export declare function isActiveResidentStatus(status: unknown): boolean;
interface StayLike {
    status?: unknown;
    propertyId?: unknown;
    property?: {
        id?: unknown;
    } | null;
}
/** Unique property ids of the stays the resident currently lives in. */
export declare function ownPropertyIdsFromStays(stays: StayLike[] | null | undefined): string[];
/** Removes the resident's own PGs from a public search result list. */
export declare function excludeOwnProperties<T extends {
    id: string;
}>(properties: T[], ownPropertyIds: readonly string[] | null | undefined): T[];
/** Prisma `where` fragment that hides the resident's own PGs, if any. */
export declare function ownPropertyExclusionWhere(ownPropertyIds: readonly string[] | null | undefined): Record<string, unknown>;
export {};
//# sourceMappingURL=resident-search.d.ts.map