/** Indian rupee formatting used everywhere: ₹8,200 and ₹1,25,000 (DESIGN.md §7). */
export declare function rupees(amount: number | null | undefined): string;
/** "5 Dec" within the current year, "5 Dec 2027" otherwise. */
export declare function shortDate(value: string | Date, timeZone?: string): string;
/** "2026-10" + "RENT" -> "October 2026 rent". */
export declare function billName(period: string, entryType: string): string;
/** Digits only, prefixing 91 for standard 10-digit Indian numbers. */
export declare function normalizeIndianPhone(phone: string): string;
/** Deduplicated variants of a phone number (raw digits, 91-prefixed, last 10 digits) for lookups. */
export declare function phoneVariants(phone: string): string[];
