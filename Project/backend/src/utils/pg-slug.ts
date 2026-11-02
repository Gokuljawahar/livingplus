const RESERVED_PG_SLUGS = new Set([
  'admin', 'api', 'assets', 'auth', 'billing', 'cdn', 'dashboard', 'help', 'login',
  'owner', 'pg', 'register', 'resident', 'static', 'support', 'tenant', 'www'
]);

export function slugifyPgName(name: string): string {
  const slug = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  const candidate = slug || 'pg';
  return RESERVED_PG_SLUGS.has(candidate) ? `pg-${candidate}` : candidate;
}

export async function createUniquePgSlug(db: any, name: string): Promise<string> {
  const base = slugifyPgName(name);
  let candidate = base;
  let suffix = 2;
  while (await db.pGProperty.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function assignMissingPgSlugs(db: any): Promise<number> {
  const properties = await db.pGProperty.findMany({
    where: { slug: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' }
  });
  let assigned = 0;
  for (const property of properties) {
    const slug = await createUniquePgSlug(db, property.name);
    const result = await db.pGProperty.updateMany({ where: { id: property.id, slug: null }, data: { slug } });
    assigned += result.count;
  }
  return assigned;
}

export type HostContext =
  | { kind: 'public' }
  | { kind: 'platform-admin' }
  | { kind: 'api' }
  | { kind: 'property'; slug: string }
  | { kind: 'unknown' };

export function resolveHostContext(hostname: string, rootDomain = process.env.LIVINGPLUS_ROOT_DOMAIN || 'livingplus.com'): HostContext {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  const root = rootDomain.toLowerCase().replace(/^\.+|\.+$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === root || host === `www.${root}`) {
    return { kind: 'public' };
  }
  if (process.env.NODE_ENV !== 'production') {
    const localSlug = parseLocalhostSlug(host);
    if (localSlug) return { kind: 'property', slug: localSlug };
  }
  if (host === `admin.${root}`) return { kind: 'platform-admin' };
  if (host === `api.${root}`) return { kind: 'api' };
  if (!host.endsWith(`.${root}`)) return { kind: 'unknown' };

  const slug = host.slice(0, -(root.length + 1));
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug) || slug.includes('.')) return { kind: 'unknown' };
  if (RESERVED_PG_SLUGS.has(slug)) return { kind: 'unknown' };
  return { kind: 'property', slug };
}

function parseLocalhostSlug(host: string): string | null {
  const suffix = '.localhost';
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug) && !RESERVED_PG_SLUGS.has(slug) ? slug : null;
}