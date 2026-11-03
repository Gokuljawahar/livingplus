// Pure helpers for the roommate swap / room-move handshake (PG OS agent
// tools). No database access here: executors in ai-tools.ts own persistence
// and re-validate roles + scope server-side. Unit-tested in
// tests/room-change.test.ts, mirroring the guest-bookings utils pattern.
export const ROOM_CHANGE_TYPES = ['SWAP', 'MOVE'];
export const ROOM_CHANGE_STATUSES = [
    'PENDING_MATCH',
    'PROPOSED',
    'ACCEPTED',
    'DECLINED',
    'WITHDRAWN',
    'COMPLETED'
];
export const ACTIVE_ROOM_CHANGE_STATUSES = [
    'PENDING_MATCH',
    'PROPOSED',
    'ACCEPTED'
];
// Who may move the handshake forward. The executor additionally checks the
// request type: SWAP rows must pass through ACCEPTED, MOVE rows complete
// straight from PENDING_MATCH once staff pick the vacant bed.
const TRANSITIONS = {
    PENDING_MATCH: [
        { to: 'PROPOSED', by: ['REQUESTER'] },
        { to: 'COMPLETED', by: ['STAFF'] },
        { to: 'DECLINED', by: ['STAFF'] },
        { to: 'WITHDRAWN', by: ['REQUESTER'] }
    ],
    PROPOSED: [
        { to: 'ACCEPTED', by: ['PARTNER'] },
        { to: 'DECLINED', by: ['PARTNER', 'STAFF'] },
        { to: 'WITHDRAWN', by: ['REQUESTER'] }
    ],
    ACCEPTED: [
        { to: 'COMPLETED', by: ['STAFF'] },
        { to: 'DECLINED', by: ['STAFF'] }
    ]
};
export function isActiveRoomChangeStatus(status) {
    return typeof status === 'string' && ACTIVE_ROOM_CHANGE_STATUSES.includes(status);
}
export function canTransitionRoomChange(from, to, by, requestType) {
    if (typeof from !== 'string' || typeof to !== 'string')
        return false;
    const allowed = (TRANSITIONS[from] || []).some((t) => t.to === to && t.by.includes(by));
    if (!allowed)
        return false;
    // SWAP rows need both residents to accept before staff may move anyone;
    // MOVE rows complete from PENDING_MATCH once staff confirm the vacant bed.
    if (to === 'COMPLETED' && by === 'STAFF' && requestType === 'SWAP' && from !== 'ACCEPTED')
        return false;
    if (to === 'COMPLETED' && by === 'STAFF' && requestType === 'MOVE' && from !== 'PENDING_MATCH')
        return false;
    if ((to === 'PROPOSED' || to === 'ACCEPTED') && requestType === 'MOVE')
        return false;
    return true;
}
const MAX_PREFERENCE_KEYS = 8;
function cleanValue(value) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
        return null;
    const text = String(value).trim().slice(0, 60);
    return text ? text : null;
}
/** Accept a preferences object or JSON string; keep a small map of short strings. */
export function parseRoomPreferences(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            return {};
        }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return {};
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (Object.keys(out).length >= MAX_PREFERENCE_KEYS)
            break;
        const name = String(key).trim().toLowerCase().slice(0, 32);
        const cleaned = cleanValue(value);
        if (name && cleaned)
            out[name] = cleaned;
    }
    return out;
}
/**
 * Two swap requests are compatible when every preference they both state
 * matches. Anything left unstated is treated as flexible, so sparse
 * profiles still match instead of deadlocking the handshake.
 */
export function roomPreferencesCompatible(a, b) {
    for (const key of Object.keys(a)) {
        const other = Object.prototype.hasOwnProperty.call(b, key) ? b[key] : undefined;
        if (other !== undefined && a[key]?.toLowerCase() !== other.toLowerCase())
            return false;
    }
    return true;
}
/**
 * Counterparty identity stays masked: first name plus the bed on offer.
 * Phone numbers and surnames never leave the server on swap listings.
 */
export function maskSwapPartner(input) {
    const first = String(input.name || '').trim().split(/\s+/)[0] || 'Resident';
    const roomNumber = typeof input.roomNumber === 'string' && input.roomNumber ? input.roomNumber : null;
    const floor = typeof input.floor === 'number' ? input.floor : null;
    const roomType = typeof input.roomType === 'string' && input.roomType ? input.roomType : null;
    return { display_name: first, current_room: roomNumber, floor, room_type: roomType };
}
//# sourceMappingURL=room-change.js.map