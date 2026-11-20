import { describe, expect, it } from 'vitest';
import { cleanAddress, extractAddressComponents } from './address';

describe('address helpers', () => {
  it('strips leading Plus Codes', () => {
    expect(cleanAddress('PP58+6VH, Sholinganallur, Chennai')).toBe('Sholinganallur, Chennai');
    expect(cleanAddress('12 OMR Road, Chennai')).toBe('12 OMR Road, Chennai');
  });

  it('reads Geocoder and Places (New) component shapes', () => {
    const geocoder = [
      { types: ['postal_code'], long_name: '600119' },
      { types: ['locality'], long_name: 'Chennai' },
      { types: ['administrative_area_level_1'], long_name: 'Tamil Nadu' },
      { types: ['country'], long_name: 'India' }
    ];
    const places = geocoder.map(({ types, long_name }) => ({ types, longText: long_name }));
    const expected = { pincode: '600119', city: 'Chennai', state: 'Tamil Nadu', country: 'India' };
    expect(extractAddressComponents(geocoder)).toEqual(expected);
    expect(extractAddressComponents(places)).toEqual(expected);
    expect(extractAddressComponents(null)).toEqual({ pincode: '', city: '', state: '', country: '' });
  });

  it('falls back to the district when there is no locality', () => {
    expect(extractAddressComponents([{ types: ['administrative_area_level_2'], long_name: 'Chengalpattu' }]).city).toBe('Chengalpattu');
  });
});
