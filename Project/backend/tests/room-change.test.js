import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_ROOM_CHANGE_STATUSES, canTransitionRoomChange, isActiveRoomChangeStatus, maskSwapPartner, parseRoomPreferences, roomPreferencesCompatible } from '../src/utils/room-change.js';
describe('room change handshake transitions', () => {
    it('lets the requester propose and withdraw while pending', () => {
        assert.equal(canTransitionRoomChange('PENDING_MATCH', 'PROPOSED', 'REQUESTER', 'SWAP'), true);
        assert.equal(canTransitionRoomChange('PENDING_MATCH', 'WITHDRAWN', 'REQUESTER', 'SWAP'), true);
        assert.equal(canTransitionRoomChange('PENDING_MATCH', 'ACCEPTED', 'REQUESTER', 'SWAP'), false);
        assert.equal(canTransitionRoomChange('PENDING_MATCH', 'ACCEPTED', 'PARTNER', 'SWAP'), false);
    });
    it('lets only the partner accept or decline a proposal', () => {
        assert.equal(canTransitionRoomChange('PROPOSED', 'ACCEPTED', 'PARTNER', 'SWAP'), true);
        assert.equal(canTransitionRoomChange('PROPOSED', 'DECLINED', 'PARTNER', 'SWAP'), true);
        assert.equal(canTransitionRoomChange('PROPOSED', 'ACCEPTED', 'STAFF', 'SWAP'), false);
        assert.equal(canTransitionRoomChange('PROPOSED', 'ACCEPTED', 'REQUESTER', 'SWAP'), false);
    });
    it('forces swaps through acceptance but completes moves from pending', () => {
        assert.equal(canTransitionRoomChange('PENDING_MATCH', 'COMPLETED', 'STAFF', 'SWAP'), false);
        assert.equal(canTransitionRoomChange('ACCEPTED', 'COMPLETED', 'STAFF', 'SWAP'), true);
        assert.equal(canTransitionRoomChange('PENDING_MATCH', 'COMPLETED', 'STAFF', 'MOVE'), true);
        assert.equal(canTransitionRoomChange('PROPOSED', 'ACCEPTED', 'PARTNER', 'MOVE'), false);
    });
    it('treats terminal states as immovable', () => {
        for (const status of ['DECLINED', 'WITHDRAWN', 'COMPLETED']) {
            assert.equal(canTransitionRoomChange(status, 'PENDING_MATCH', 'STAFF', 'SWAP'), false);
            assert.equal(isActiveRoomChangeStatus(status), false);
        }
        for (const status of ACTIVE_ROOM_CHANGE_STATUSES) {
            assert.equal(isActiveRoomChangeStatus(status), true);
        }
    });
});
describe('room preference matching', () => {
    it('parses objects and JSON strings into a small string map', () => {
        assert.deepEqual(parseRoomPreferences({ floor: 'low', Quiet: ' yes ' }), { floor: 'low', quiet: 'yes' });
        assert.deepEqual(parseRoomPreferences('{"floor":"high"}'), { floor: 'high' });
        assert.deepEqual(parseRoomPreferences('not json'), {});
        assert.deepEqual(parseRoomPreferences(null), {});
    });
    it('treats unstated preferences as flexible', () => {
        assert.equal(roomPreferencesCompatible({ floor: 'low' }, {}), true);
        assert.equal(roomPreferencesCompatible({}, { quiet: 'yes' }), true);
        assert.equal(roomPreferencesCompatible({ floor: 'low' }, { floor: 'LOW' }), true);
        assert.equal(roomPreferencesCompatible({ floor: 'low' }, { floor: 'high' }), false);
    });
});
describe('swap partner masking', () => {
    it('exposes first name and offered bed only', () => {
        assert.deepEqual(maskSwapPartner({ name: 'Ananya Rao', roomNumber: '201', floor: 2, roomType: 'SHARED' }), { display_name: 'Ananya', current_room: '201', floor: 2, room_type: 'SHARED' });
        assert.deepEqual(maskSwapPartner({ name: '' }), {
            display_name: 'Resident',
            current_room: null,
            floor: null,
            room_type: null
        });
    });
});
//# sourceMappingURL=room-change.test.js.map