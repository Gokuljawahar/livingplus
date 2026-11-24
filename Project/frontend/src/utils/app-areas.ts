// The four areas of LivingPlus, each with its own URLs, layout and sign-in.
// Every routing decision (which login, which home, which token, which PG)
// comes from here, so a URL always means the same thing.
//
//   Guest site     /                browse PGs freely; phone code for saved PGs, owner contact & bed requests
//                  /pg/:slug        full PG overview & room booking
//                  /list-your-pg    owner onboarding inquiry page
//                  /requests        a guest's booking requests
//   Resident site  /stay            find your PG's resident site
//                  /stay/<pg-slug>  that PG's residents: phone-code sign-in, stay, money...
//   Owner site     /owner           workspace for owners and wardens
//                  /owner/login · /owner/register · /owner/account · /owner/forgot-password
//   Admin site     /admin           Living Plus internal concierge onboarding console
//                  /admin/login · /admin/leads · /admin/onboard · /admin/properties

export type AppArea = 'guest' | 'resident' | 'owner' | 'admin';

export const ROUTES = {
  guestHome: '/',
  guestRequests: '/requests',
  propertyDetail: (slug: string) => `/pg/${slug}`,
  listYourPg: '/list-your-pg',
  residentFinder: '/stay',
  residentSite: (slug: string) => `/stay/${slug}`,
  ownerHome: '/owner',
  ownerLogin: '/owner/login',
  ownerRegister: '/owner/register',
  ownerAccount: '/owner/account',
  ownerForgotPassword: '/owner/forgot-password',
  adminHome: '/admin',
  adminLogin: '/admin/login',
  adminLeads: '/admin/leads',
  adminOnboard: '/admin/onboard',
  adminProperties: '/admin/properties'
} as const;

const RESIDENT_SITE = /^\/stay\/([a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)(?:\/|$)/;

/** Which area a path belongs to. */
export function areaOf(pathname: string): AppArea {
  if (pathname === '/stay' || pathname.startsWith('/stay/')) return 'resident';
  if (pathname === '/owner' || pathname.startsWith('/owner/')) return 'owner';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  return 'guest';
}

/** The PG slug of a resident-site path (/stay/<slug>), else null. */
export function residentSlugFromPath(pathname: string): string | null {
  return RESIDENT_SITE.exec(pathname)?.[1] ?? null;
}

/** The sign-in page for an area (guests and residents sign in inside their pages). */
export function loginFor(area: AppArea, pathname = '/'): string {
  if (area === 'admin') return ROUTES.adminLogin;
  if (area === 'owner') return ROUTES.ownerLogin;
  if (area === 'resident') {
    const slug = residentSlugFromPath(pathname);
    return slug ? ROUTES.residentSite(slug) : ROUTES.residentFinder;
  }
  return ROUTES.guestHome;
}
