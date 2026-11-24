// Centralized TanStack Query keys so cache reads and invalidations stay in sync
// across owner, resident, guest discovery, and admin onboarding features.
export const queryKeys = {
  properties: () => ['properties'] as const,
  propertyDetail: (slug: string) => ['property', slug] as const,
  search: (q: string) => ['search', q] as const,
  pgSites: (term: string) => ['pg-sites', term] as const,
  pgSite: (slug: string) => ['pg-site', slug] as const,
  googleSignInConfig: () => ['google-sign-in-config'] as const,
  guestBookings: (guestToken: string | null, refreshKey?: number) =>
    refreshKey === undefined ? (['bookings', 'mine', guestToken] as const) : (['bookings', 'mine', guestToken, refreshKey] as const),

  owner: {
    all: () => ['owner'] as const,
    workspace: () => ['owner', 'workspace'] as const,
    pulse: () => ['owner', 'pulse'] as const,
    pulseBrief: () => ['owner', 'pulse', 'brief'] as const,
    kitchen: (propertyId: string, date: string) => ['owner', 'kitchen', propertyId, date] as const,
    serviceOrders: (date?: string) => (date === undefined ? (['owner', 'service-orders'] as const) : (['owner', 'service-orders', date] as const))
  },

  resident: {
    all: () => ['resident'] as const,
    portal: () => ['resident', 'portal'] as const,
    stays: (userId: string | null) => ['tenant', 'stays', userId] as const,
    roomChanges: () => ['room-changes'] as const,
    vacantBeds: () => ['room-changes', 'vacant-beds'] as const,
    serviceOrders: (tenantId: string) => ['resident', 'service-orders', tenantId] as const,
    vibeMatch: (tenantId: string) => ['resident', 'vibe-match', tenantId] as const,
    conditionReports: (tenantId: string) => ['condition-reports', tenantId] as const
  },

  admin: {
    all: () => ['admin'] as const,
    overview: () => ['admin', 'overview'] as const,
    leads: (status = '', search = '') => ['admin', 'leads', status, search] as const,
    properties: (status = '', search = '') => ['admin', 'properties', status, search] as const,
    owners: () => ['admin', 'owners'] as const
  }
};
