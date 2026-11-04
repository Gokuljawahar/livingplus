/**
 * Helpers that keep a resident's own PG out of the public "search other PGs"
 * flow. A resident who wants a different room uses the in-portal room change
 * (see the room-change controller) instead of booking a new bed in the same
 * property. Kept free of framework imports so the logic stays unit-testable.
 */
/** Tenant statuses that mean the resident currently lives in the PG. */
export const ACTIVE_RESIDENT_STATUSES = ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'];
/** Rejection message for booking attempts inside the resident's own PG. */
export const OWN_PROPERTY_BOOKING_MESSAGE = 'You already stay at this PG — request a room change from your resident portal instead of a new booking.';
export function isActiveResidentStatus(status) {
    return (typeof status === 'string' &&
        ACTIVE_RESIDENT_STATUSES.includes(status));
}
/** Unique property ids of the stays the resident currently lives in. */
export function ownPropertyIdsFromStays(stays) {
    const ids = new Set();
    for (const stay of stays || []) {
        if (!stay || !isActiveResidentStatus(stay.status))
            continue;
        const direct = typeof stay.propertyId === 'string' ? stay.propertyId : '';
        const nested = typeof stay.property?.id === 'string' ? stay.property.id : '';
        const id = direct || nested;
        if (id)
            ids.add(id);
    }
    return [...ids];
}
/** Removes the resident's own PGs from a public search result list. */
export function excludeOwnProperties(properties, ownPropertyIds) {
    if (!ownPropertyIds || ownPropertyIds.length === 0)
        return properties;
    const hidden = new Set(ownPropertyIds);
    return properties.filter((property) => !hidden.has(property.id));
}
/** Prisma `where` fragment that hides the resident's own PGs, if any. */
export function ownPropertyExclusionWhere(ownPropertyIds) {
    if (!ownPropertyIds || ownPropertyIds.length === 0)
        return {};
    return { id: { notIn: [...ownPropertyIds] } };
}
//# sourceMappingURL=resident-search.js.map