export declare const ROOM_CHANGE_TYPES: readonly ["SWAP", "MOVE"];
export type RoomChangeType = (typeof ROOM_CHANGE_TYPES)[number];
export declare const ROOM_CHANGE_STATUSES: readonly ["PENDING_MATCH", "PROPOSED", "ACCEPTED", "DECLINED", "WITHDRAWN", "COMPLETED"];
export type RoomChangeStatus = (typeof ROOM_CHANGE_STATUSES)[number];
export declare const ACTIVE_ROOM_CHANGE_STATUSES: RoomChangeStatus[];
export type HandshakeParty = 'REQUESTER' | 'PARTNER' | 'STAFF';
export declare function isActiveRoomChangeStatus(status: unknown): boolean;
export declare function canTransitionRoomChange(from: unknown, to: unknown, by: HandshakeParty, requestType?: unknown): boolean;
export type RoomPreferences = Record<string, string>;
/** Accept a preferences object or JSON string; keep a small map of short strings. */
export declare function parseRoomPreferences(raw: unknown): RoomPreferences;
/**
 * Two swap requests are compatible when every preference they both state
 * matches. Anything left unstated is treated as flexible, so sparse
 * profiles still match instead of deadlocking the handshake.
 */
export declare function roomPreferencesCompatible(a: RoomPreferences, b: RoomPreferences): boolean;
export interface SwapPartnerView {
    display_name: string;
    current_room: string | null;
    floor: number | null;
    room_type: string | null;
}
/**
 * Counterparty identity stays masked: first name plus the bed on offer.
 * Phone numbers and surnames never leave the server on swap listings.
 */
export declare function maskSwapPartner(input: {
    name: unknown;
    roomNumber?: unknown;
    floor?: unknown;
    roomType?: unknown;
}): SwapPartnerView;
//# sourceMappingURL=room-change.d.ts.map