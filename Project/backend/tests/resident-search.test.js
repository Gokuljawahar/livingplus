import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_RESIDENT_STATUSES, OWN_PROPERTY_BOOKING_MESSAGE, excludeOwnProperties, isActiveResidentStatus, ownPropertyExclusionWhere, ownPropertyIdsFromStays } from '../src/utils/resident-search.js';
describe('resident own-PG search exclusion', () => {
    it('treats active, notice-period and reserved stays as living in the PG', () => {
        assert.deepEqual([...ACTIVE_RESIDENT_STATUSES].sort(), ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED']);
        assert.equal(isActiveResidentStatus('ACTIVE'), true);
        assert.equal(isActiveResidentStatus('NOTICE_PERIOD'), true);
        assert.equal(isActiveResidentStatus('RESERVED'), true);
        assert.equal(isActiveResidentStatus('CHECKED_OUT'), false);
        assert.equal(isActiveResidentStatus('CANCELLED'), false);
        assert.equal(isActiveResidentStatus(''), false);
        assert.equal(isActiveResidentStatus(null), false);
    });
    it('collects unique property ids from active stays only', () => {
        assert.deepEqual(ownPropertyIdsFromStays([
            { status: 'ACTIVE', property: { id: 'pg-a' } },
            { status: 'NOTICE_PERIOD', propertyId: 'pg-b' },
            { status: 'ACTIVE', property: { id: 'pg-a' } },
            { status: 'CHECKED_OUT', property: { id: 'pg-old' } },
            { status: 'ACTIVE', property: { id: '' } },
            { status: null, propertyId: 'pg-none' }
        ]).sort(), ['pg-a', 'pg-b']);
    });
    it('filters the resident PG out of search results', () => {
        const listings = [{ id: 'pg-a' }, { id: 'pg-b' }, { id: 'pg-c' }];
        assert.deepEqual(excludeOwnProperties(listings, ['pg-a', 'pg-c']), [{ id: 'pg-b' }]);
        assert.deepEqual(excludeOwnProperties(listings, []), listings);
    });
    it('builds a Prisma exclusion clause only when there is something to hide', () => {
        assert.deepEqual(ownPropertyExclusionWhere([]), {});
        assert.deepEqual(ownPropertyExclusionWhere(['pg-a']), { id: { notIn: ['pg-a'] } });
    });
    it('tells blocked residents to use the in-portal room change', () => {
        assert.match(OWN_PROPERTY_BOOKING_MESSAGE.toLowerCase(), /room change/);
        assert.match(OWN_PROPERTY_BOOKING_MESSAGE.toLowerCase(), /resident portal|portal/);
    });
});
//# sourceMappingURL=resident-search.test.js.map