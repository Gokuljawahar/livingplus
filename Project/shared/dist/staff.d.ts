export declare const STAFF_ROLES: readonly ["WARDEN", "COOK", "HOUSEKEEPING", "ACCOUNTANT"];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type AccessRole = 'OWNER' | StaffRole;
export declare const STAFF_ROLE_LABELS: Record<AccessRole, string>;
export declare const STAFF_ROLE_HINTS: Record<StaffRole, string>;
/** Owner workspace views each role sees; the first one is where they land. */
export declare const VIEWS_BY_ROLE: Record<AccessRole, readonly string[]>;
export declare const isStaffRole: (value: string) => value is StaffRole;
/** Views for someone holding several roles (e.g. warden of one PG, accountant of another). */
export declare function viewsForRoles(roles: readonly string[]): string[];
