// Validation rules shared by the LivingPlus API and frontend: one source for
// patterns, limits, allowed values and the messages users see. Each app wraps
// these in its own Zod schemas; this package has no dependencies.

export const PATTERNS = {
  /** UPI virtual payment address, e.g. "sunrisepg@okicici". */
  upiId: /^[a-zA-Z0-9._-]{2,100}@[a-zA-Z0-9.-]{2,60}$/,
  /** UPI transaction reference / UTR entered by residents. */
  paymentReference: /^[a-zA-Z0-9._/-]{6,80}$/,
  /** 8+ chars with lower, upper, digit and one of @$!%*?& (owner accounts). */
  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  /** Billing period, e.g. "2026-12". */
  yearMonth: /^\d{4}-\d{2}$/
} as const;

export const LIMITS = {
  ticketTitle: 120,
  ticketDetails: 2000,
  profileText: 200,
  emergencyPhone: 20,
  phoneDigitsMin: 10
} as const;

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const KYC_TYPES = ['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'STUDENT_ID', 'WORK_ID'] as const;
export const PAYMENT_METHODS = ['CASH', 'NEFT', 'UPI', 'OTHER'] as const;
export const EXPENSE_CATEGORIES = ['FOOD', 'STAFF', 'MAINTENANCE', 'UTILITIES', 'OTHER'] as const;
export const GENDER_POLICIES = ['ANY', 'MEN', 'WOMEN'] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];
export type KycType = (typeof KYC_TYPES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type GenderPolicy = (typeof GENDER_POLICIES)[number];

export const MESSAGES = {
  upiId: 'Enter a valid UPI ID',
  paymentReference: 'Enter the UPI reference / UTR (6-80 letters or numbers)',
  strongPassword: 'Must contain 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char',
  phone: 'Enter a valid 10-digit number',
  yearMonth: 'Choose the billing month',
  bloodGroup: 'Invalid blood group',
  kycType: 'Invalid KYC document type',
  ticketTitle: `Keep the title under ${LIMITS.ticketTitle} characters`,
  ticketDetails: `Keep the details under ${LIMITS.ticketDetails} characters`
} as const;

export const phoneDigits = (value: string): string => value.replace(/\D/g, '');
export const isValidPhone = (value: string): boolean => phoneDigits(value).length >= LIMITS.phoneDigitsMin;
export const isValidUpiId = (value: string): boolean => PATTERNS.upiId.test(value.trim());
export const isStrongPassword = (value: string): boolean => PATTERNS.strongPassword.test(value);
export const isYearMonth = (value: string): boolean => PATTERNS.yearMonth.test(value);

const includes = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);
export const isBloodGroup = (value: string): value is BloodGroup => includes(BLOOD_GROUPS, value);
export const isKycType = (value: string): value is KycType => includes(KYC_TYPES, value);
export const isGenderPolicy = (value: string): value is GenderPolicy => includes(GENDER_POLICIES, value);

export * from './vibecheck.js';
export * from './services.js';
export * from './staff.js';
export * from './places.js';
