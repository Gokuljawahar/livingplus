export declare const PATTERNS: {
    /** UPI virtual payment address, e.g. "sunrisepg@okicici". */
    readonly upiId: RegExp;
    /** UPI transaction reference / UTR entered by residents. */
    readonly paymentReference: RegExp;
    /** 8+ chars with lower, upper, digit and one of @$!%*?& (owner accounts). */
    readonly strongPassword: RegExp;
    /** Billing period, e.g. "2026-12". */
    readonly yearMonth: RegExp;
};
export declare const LIMITS: {
    readonly ticketTitle: 120;
    readonly ticketDetails: 2000;
    readonly profileText: 200;
    readonly emergencyPhone: 20;
    readonly phoneDigitsMin: 10;
};
export declare const BLOOD_GROUPS: readonly ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export declare const KYC_TYPES: readonly ["AADHAAR", "PAN", "PASSPORT", "DRIVING_LICENSE", "STUDENT_ID", "WORK_ID"];
export declare const PAYMENT_METHODS: readonly ["CASH", "NEFT", "UPI", "OTHER"];
export declare const EXPENSE_CATEGORIES: readonly ["FOOD", "STAFF", "MAINTENANCE", "UTILITIES", "OTHER"];
export declare const GENDER_POLICIES: readonly ["ANY", "MEN", "WOMEN"];
export type BloodGroup = (typeof BLOOD_GROUPS)[number];
export type KycType = (typeof KYC_TYPES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type GenderPolicy = (typeof GENDER_POLICIES)[number];
export declare const MESSAGES: {
    readonly upiId: "Enter a valid UPI ID";
    readonly paymentReference: "Enter the UPI reference / UTR (6-80 letters or numbers)";
    readonly strongPassword: "Must contain 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char";
    readonly phone: "Enter a valid 10-digit number";
    readonly yearMonth: "Choose the billing month";
    readonly bloodGroup: "Invalid blood group";
    readonly kycType: "Invalid KYC document type";
    readonly ticketTitle: "Keep the title under 120 characters";
    readonly ticketDetails: "Keep the details under 2000 characters";
};
export declare const phoneDigits: (value: string) => string;
export declare const isValidPhone: (value: string) => boolean;
export declare const isValidUpiId: (value: string) => boolean;
export declare const isStrongPassword: (value: string) => boolean;
export declare const isYearMonth: (value: string) => boolean;
export declare const isBloodGroup: (value: string) => value is BloodGroup;
export declare const isKycType: (value: string) => value is KycType;
export declare const isGenderPolicy: (value: string) => value is GenderPolicy;
export * from './vibecheck.js';
export * from './services.js';
export * from './staff.js';
export * from './places.js';
export * from './format.js';
