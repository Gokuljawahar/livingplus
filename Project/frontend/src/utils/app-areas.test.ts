import { describe, expect, it } from 'vitest';
import { areaOf, loginFor, residentSlugFromPath } from './app-areas';

describe('app areas', () => {
  it('maps every path to exactly one area', () => {
    expect(areaOf('/')).toBe('guest');
    expect(areaOf('/requests')).toBe('guest');
    expect(areaOf('/stay')).toBe('resident');
    expect(areaOf('/stay/palm-grove')).toBe('resident');
    expect(areaOf('/owner')).toBe('owner');
    expect(areaOf('/owner/login')).toBe('owner');
    expect(areaOf('/admin')).toBe('guest');
    expect(areaOf('/ownership')).toBe('guest');
    expect(areaOf('/staying')).toBe('guest');
  });

  it('reads the PG slug from a resident site path only', () => {
    expect(residentSlugFromPath('/stay/palm-grove')).toBe('palm-grove');
    expect(residentSlugFromPath('/stay/palm-grove/')).toBe('palm-grove');
    expect(residentSlugFromPath('/stay')).toBeNull();
    expect(residentSlugFromPath('/stay/Bad_Slug')).toBeNull();
    expect(residentSlugFromPath('/owner/palm-grove')).toBeNull();
  });

  it('sends each account and area to its own sign-in and home', () => {
    expect(loginFor('owner')).toBe('/owner/login');
    expect(loginFor('resident', '/stay/palm-grove')).toBe('/stay/palm-grove');
    expect(loginFor('resident', '/stay')).toBe('/stay');
    expect(loginFor('guest')).toBe('/');
  });
});
