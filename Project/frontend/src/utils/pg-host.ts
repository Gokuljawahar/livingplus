export type AppHostContext =
  | { kind: 'public' }
  | { kind: 'platform-admin' }
  | { kind: 'property'; slug: string }
  | { kind: 'unknown' };

const reservedSlugs = new Set([
  'admin', 'api', 'assets', 'auth', 'billing', 'cdn', 'dashboard', 'help', 'login',
  'owner', 'pg', 'register', 'resident', 'static', 'support', 'tenant', 'www'
]);

const rootDomain = (import.meta.env.VITE_ROOT_DOMAIN || 'livingplus.com').toLowerCase();

/**
 * One-domain deployments (for example a Cloud Run URL) have no per-PG
 * subdomains: every host is the main site and portals use paths
 * (/pg/manage, /pg/resident), exactly like local development.
 */
export const singleHostMode = import.meta.env.VITE_SINGLE_HOST_MODE === 'true';

/** Hosts where owner/resident portals are reached by path instead of PG subdomain. */
export function isPathModeHost(hostname = window.location.hostname): boolean {
  return singleHostMode || ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function parsePropertySlug(hostname: string, suffix: string): string | null {
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug) || reservedSlugs.has(slug)) return null;
  return slug;
}

export function resolveAppHost(hostname = window.location.hostname): AppHostContext {
  if (singleHostMode) return { kind: 'public' };
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === rootDomain || host === `www.${rootDomain}`) {
    return { kind: 'public' };
  }
  if (host === `admin.${rootDomain}`) return { kind: 'platform-admin' };
  const productionSlug = parsePropertySlug(host, `.${rootDomain}`);
  if (productionSlug) return { kind: 'property', slug: productionSlug };

  if (import.meta.env.DEV) {
    const localSlug = parsePropertySlug(host, '.localhost');
    if (localSlug) return { kind: 'property', slug: localSlug };
  }
  return { kind: 'unknown' };
}

export function pgHostUrl(slug: string): string {
  if (singleHostMode) return window.location.origin;
  const hostname = window.location.hostname;
  if (import.meta.env.DEV && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost'))) {
    return `${window.location.protocol}//${slug}.localhost${window.location.port ? `:${window.location.port}` : ''}`;
  }
  return `${window.location.protocol}//${slug}.${rootDomain}`;
}