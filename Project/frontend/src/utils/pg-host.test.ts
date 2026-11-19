import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('./pg-host');
}

afterEach(() => vi.unstubAllEnvs());

describe('resolveAppHost', () => {
  it('maps the root domain, admin host and PG subdomains', async () => {
    const { resolveAppHost } = await load({ VITE_ROOT_DOMAIN: 'livingplus.com' });
    expect(resolveAppHost('livingplus.com')).toEqual({ kind: 'public' });
    expect(resolveAppHost('www.livingplus.com')).toEqual({ kind: 'public' });
    expect(resolveAppHost('admin.livingplus.com')).toEqual({ kind: 'platform-admin' });
    expect(resolveAppHost('sunrise-pg.livingplus.com')).toEqual({ kind: 'property', slug: 'sunrise-pg' });
  });

  it('refuses reserved slugs, malformed hosts and other domains', async () => {
    const { resolveAppHost } = await load({ VITE_ROOT_DOMAIN: 'livingplus.com' });
    expect(resolveAppHost('api.livingplus.com')).toEqual({ kind: 'unknown' });
    expect(resolveAppHost('-bad-.livingplus.com')).toEqual({ kind: 'unknown' });
    expect(resolveAppHost('livingplus.com.evil.example')).toEqual({ kind: 'unknown' });
  });

  it('treats every host as the main site in single-host mode', async () => {
    const { resolveAppHost, isPathModeHost, pgHostUrl } = await load({ VITE_SINGLE_HOST_MODE: 'true' });
    expect(resolveAppHost('livingplus-abc.a.run.app')).toEqual({ kind: 'public' });
    expect(isPathModeHost('livingplus-abc.a.run.app')).toBe(true);
    expect(pgHostUrl('sunrise')).toBe(window.location.origin);
  });

  it('uses path mode only on localhost otherwise', async () => {
    const { isPathModeHost } = await load();
    expect(isPathModeHost('localhost')).toBe(true);
    expect(isPathModeHost('livingplus.com')).toBe(false);
  });
});
