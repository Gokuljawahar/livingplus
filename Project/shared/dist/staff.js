// Staff roles on a PG and what each may use (buildathon answers Q3: wardens,
// cooks, housekeeping staff and accountants with role-based access).
// The API enforces these; the web app uses them to show only the right views.
export const STAFF_ROLES = ['WARDEN', 'COOK', 'HOUSEKEEPING', 'ACCOUNTANT'];
export const STAFF_ROLE_LABELS = {
    OWNER: 'Owner', WARDEN: 'Warden', COOK: 'Cook', HOUSEKEEPING: 'Housekeeping', ACCOUNTANT: 'Accountant'
};
export const STAFF_ROLE_HINTS = {
    WARDEN: 'Day-to-day operations: bookings, residents, maintenance. No money or staff.',
    COOK: 'Meal orders and the kitchen head-count only.',
    HOUSEKEEPING: 'Cleaning bookings only.',
    ACCOUNTANT: 'Rent, payments, expenses, utilities and reports. No bookings or residents.'
};
/** Owner workspace views each role sees; the first one is where they land. */
export const VIEWS_BY_ROLE = {
    OWNER: ['overview', 'properties', 'bookings', 'roomchanges', 'tenants', 'activity', 'maintenance', 'services', 'rent', 'payments', 'expenses', 'utilities', 'reports', 'staff'],
    WARDEN: ['overview', 'properties', 'bookings', 'roomchanges', 'tenants', 'activity', 'maintenance', 'services'],
    ACCOUNTANT: ['rent', 'payments', 'expenses', 'utilities', 'reports'],
    COOK: ['services'],
    HOUSEKEEPING: ['services']
};
export const isStaffRole = (value) => STAFF_ROLES.includes(value);
/** Views for someone holding several roles (e.g. warden of one PG, accountant of another). */
export function viewsForRoles(roles) {
    const order = VIEWS_BY_ROLE.OWNER;
    const allowed = new Set(roles.flatMap((role) => VIEWS_BY_ROLE[role] ?? []));
    return order.filter((view) => allowed.has(view));
}
