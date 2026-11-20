import type { Request, Response } from 'express';
import { z } from 'zod';
declare const reviewSchema: z.ZodObject<{
    changes: z.ZodArray<z.ZodObject<{
        item: z.ZodString;
        change: z.ZodString;
        kind: z.ZodEnum<{
            CLEANING: "CLEANING";
            DAMAGE: "DAMAGE";
            MISSING: "MISSING";
            WEAR: "WEAR";
        }>;
        suggested: z.ZodNumber;
    }, z.core.$strip>>;
    summary: z.ZodString;
}, z.core.$strip>;
export type DepositReview = {
    changes: z.infer<typeof reviewSchema>['changes'];
    summary: string;
    suggestedTotal: number;
    photos: {
        moveIn: number;
        moveOut: number;
    };
};
declare let reviewOverride: ((input: {
    moveInNotes: string;
    moveOutNotes: string;
    photos: number;
}) => Promise<unknown>) | null;
/** Test hook: replace the Gemini call (null restores). */
export declare function setDepositReviewerForTests(run: typeof reviewOverride): void;
/** Cleans the model's list: wear is never charged, charges are whole rupees within the deposit. */
export declare function settleReview(raw: z.infer<typeof reviewSchema>, deposit: number): Omit<DepositReview, 'photos'>;
/** Owner: compare the latest move-in and move-out records for one resident. */
export declare const reviewDeposit: (req: Request, res: Response) => Promise<any>;
export {};
//# sourceMappingURL=deposit-shield.controller.d.ts.map