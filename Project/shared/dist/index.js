// Validation rules shared by the LivingPlus API and frontend: one source for
// patterns, limits, and dynamic catalog validation helpers.
export const PATTERNS = {
    /** UPI virtual payment address, e.g. "sunrisepg@okicici". */
    upiId: /^[a-zA-Z0-9._-]{2,100}@[a-zA-Z0-9.-]{2,60}$/,
    /** UPI transaction reference / UTR entered by residents. */
    paymentReference: /^[a-zA-Z0-9._/-]{6,80}$/,
    /** 8+ chars with lower, upper, digit and one of @$!%*?& (owner accounts). */
    strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    /** Billing period, e.g. "2026-12". */
    yearMonth: /^\d{4}-\d{2}$/
};
export const LIMITS = {
    ticketTitle: 120,
    ticketDetails: 2000,
    profileText: 200,
    emergencyPhone: 20,
    phoneDigitsMin: 10
};
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const KYC_TYPES = ['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'STUDENT_ID', 'WORK_ID'];
export const PAYMENT_METHODS = ['CASH', 'NEFT', 'UPI', 'OTHER'];
export const EXPENSE_CATEGORIES = ['FOOD', 'STAFF', 'MAINTENANCE', 'UTILITIES', 'OTHER'];
export const GENDER_POLICIES = ['ANY', 'MEN', 'WOMEN'];
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
};
export const phoneDigits = (value) => value.replace(/\D/g, '');
export const isValidPhone = (value) => phoneDigits(value).length >= LIMITS.phoneDigitsMin;
export const isValidUpiId = (value) => PATTERNS.upiId.test(value.trim());
export const isStrongPassword = (value) => PATTERNS.strongPassword.test(value);
export const isYearMonth = (value) => PATTERNS.yearMonth.test(value);
export const isBloodGroup = (value, allowed = BLOOD_GROUPS) => allowed.includes(value);
export const isKycType = (value, allowed = KYC_TYPES) => allowed.includes(value);
export const isGenderPolicy = (value, allowed = GENDER_POLICIES) => allowed.includes(value);
export * from './vibecheck.js';
export * from './services.js';
export * from './staff.js';
export * from './places.js';
export * from './format.js';
export * from './live-protocol.js';
export * from './marketplace.js';
export * from './catalog.js';
