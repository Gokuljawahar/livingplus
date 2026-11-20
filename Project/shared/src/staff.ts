// Staff roles on a PG and what each may use (buildathon answers Q3: wardens,
// cooks, housekeeping staff and accountants with role-based access).
// The API enforces these; the web app uses them to show only the right views.

export const STAFF_ROLES = ['WARDEN', 'COOK', 'HOUSEKEEPING', 'ACCOUNTANT'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type AccessRole = 'OWNER' | StaffRole;

export const STAFF_ROLE_LABELS: Record<AccessRole, string> = {
  OWNER: 'Owner', WARDEN: 'Warden', COOK: 'Cook', HOUSEKEEPING: 'Housekeeping', ACCOUNTANT: 'Accountant'
};

export const STAFF_ROLE_HINTS: Record<StaffRole, string> = {
  WARDEN: 'Day-to-day operations: bookings, residents, maintenance. No money or staff.',
  COOK: 'Meal orders and the kitchen head-count only.',
  HOUSEKEEPING: 'Cleaning bookings only.',
  ACCOUNTANT: 'Rent, payments, expenses, utilities and reports. No bookings or residents.'
};

/** Owner workspace views each role sees; the first one is where they land. */
export const VIEWS_BY_ROLE: Record<AccessRole, readonly string[]> = {
  OWNER: ['overview', 'properties', 'bookings', 'roomchanges', 'tenants', 'activity', 'maintenance', 'services', 'rent', 'payments', 'expenses', 'utilities', 'reports', 'staff'],
  WARDEN: ['overview', 'properties', 'bookings', 'roomchanges', 'tenants', 'activity', 'maintenance', 'services'],
  ACCOUNTANT: ['rent', 'payments', 'expenses', 'utilities', 'reports'],
  COOK: ['services'],
  HOUSEKEEPING: ['services']
};

export const isStaffRole = (value: string): value is StaffRole => (STAFF_ROLES as readonly string[]).includes(value);

/** Views for someone holding several roles (e.g. warden of one PG, accountant of another). */
export function viewsForRoles(roles: readonly string[]): string[] {
  const order = VIEWS_BY_ROLE.OWNER;
  const allowed = new Set(roles.flatMap((role) => VIEWS_BY_ROLE[role as AccessRole] ?? []));
  return order.filter((view) => allowed.has(view));
}
