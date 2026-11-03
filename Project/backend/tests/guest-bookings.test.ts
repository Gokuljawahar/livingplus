import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGuestBookingWhere,
  guestBookingPhoneKey,
  normalizeGuestPhone
} from '../src/utils/guest-bookings.js';

describe('guest booking phone matching', () => {
  it('normalizes phones to digits only', () => {
    assert.equal(normalizeGuestPhone('+91 98765 43210'), '919876543210');
    assert.equal(normalizeGuestPhone('98765-43210'), '9876543210');
    assert.equal(normalizeGuestPhone(undefined), '');
  });

  it('matches 10-digit and 91-prefixed forms to the same key', () => {
    assert.equal(guestBookingPhoneKey('9876543210'), '9876543210');
    assert.equal(guestBookingPhoneKey('919876543210'), '9876543210');
    assert.equal(guestBookingPhoneKey('+91-98765-43210'), '9876543210');
  });

  it('rejects short or missing numbers', () => {
    assert.equal(guestBookingPhoneKey('12345'), null);
    assert.equal(guestBookingPhoneKey(''), null);
    assert.equal(guestBookingPhoneKey(undefined), null);
  });

  it('builds an endsWith where clause with optional property scope', () => {
    assert.deepEqual(buildGuestBookingWhere('919876543210'), { phone: { endsWith: '9876543210' } });
    assert.deepEqual(buildGuestBookingWhere('9876543210', 'property-1'), {
      phone: { endsWith: '9876543210' },
      propertyId: 'property-1'
    });
    assert.equal(buildGuestBookingWhere('123'), null);
  });
});
