import { z } from 'zod';
export declare const MAX_KYC_BYTES: number;
declare const extraction: z.ZodObject<{
    documentType: z.ZodEnum<{
        AADHAAR: "AADHAAR";
        PAN: "PAN";
        PASSPORT: "PASSPORT";
        DRIVING_LICENSE: "DRIVING_LICENSE";
        STUDENT_ID: "STUDENT_ID";
        WORK_ID: "WORK_ID";
        OTHER_ID: "OTHER_ID";
        NOT_AN_ID: "NOT_AN_ID";
    }>;
    nameOnDocument: z.ZodString;
    idNumberLast4: z.ZodString;
    legible: z.ZodBoolean;
    notes: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type KycExtraction = z.infer<typeof extraction>;
export interface KycCheck {
    checkedAt: string;
    documentType: string;
    /** "match" | "partial" | "mismatch" | "unknown" */
    nameMatch: 'match' | 'partial' | 'mismatch' | 'unknown';
    typeMatch: boolean | null;
    idNumberLast4: string;
    legible: boolean;
    flags: string[];
}
declare let override: ((data: Buffer, contentType: string) => Promise<KycExtraction>) | null;
/** Test hook: replace the model call (null restores). */
export declare function setKycReaderForTests(reader: typeof override): void;
/** How well the printed name matches the name the resident gave. */
export declare function compareNames(declared: string, printed: string): KycCheck['nameMatch'];
export declare function checkKycDocument(input: {
    fileKey: string;
    declaredType: string | null;
    residentName: string;
}): Promise<KycCheck>;
export {};
//# sourceMappingURL=kyc-check.d.ts.map