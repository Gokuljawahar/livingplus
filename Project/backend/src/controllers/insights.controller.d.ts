import type { Request, Response } from 'express';
import { z } from 'zod';
export interface PulseStats {
    beds: number;
    occupied: number;
    newResidents: number;
    pendingRequests: number;
    overdueCount: number | null;
    overdueAmount: number | null;
    ticketsOpen: number;
    ticketsOpened: number;
    ticketsResolved: number;
    avgFixHours: number | null;
    mealOrders: number;
    aiActions: number;
}
export declare function pulseStats(scope: string[], seesMoney: boolean): Promise<PulseStats>;
/** Timeline, assistant actions and this week's numbers for the caller's PGs. */
export declare const getPulse: (req: Request, res: Response) => Promise<any>;
declare const briefSchema: z.ZodObject<{
    headline: z.ZodString;
    points: z.ZodArray<z.ZodString>;
    suggestion: z.ZodObject<{
        text: z.ZodString;
        action: z.ZodEnum<{
            SEND_RENT_REMINDERS: "SEND_RENT_REMINDERS";
            REVIEW_BED_REQUESTS: "REVIEW_BED_REQUESTS";
            OPEN_MAINTENANCE: "OPEN_MAINTENANCE";
            NONE: "NONE";
        }>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type WeeklyBrief = z.infer<typeof briefSchema> & {
    ai: boolean;
};
/** The same brief from plain numbers, when AI is off or fails. */
export declare function plainBrief(stats: PulseStats): WeeklyBrief;
declare let briefOverride: ((stats: PulseStats) => Promise<unknown>) | null;
/** Test hook: replace the Gemini call (null restores). */
export declare function setBriefWriterForTests(run: typeof briefOverride): void;
/** Gemini's weekly brief for the owner, from this week's numbers only. */
export declare const postWeeklyBrief: (req: Request, res: Response) => Promise<any>;
declare const MEALS: readonly ["BREAKFAST", "LUNCH", "DINNER"];
type Meal = (typeof MEALS)[number];
export interface KitchenSignals {
    date: string;
    weekday: string;
    planResidents: number;
    orders: Record<Meal, number>;
    lateRisers: number;
    dayWorkers: number;
    nightWorkers: number;
    sameWeekdayOrders: number[];
}
declare const forecastSchema: z.ZodObject<{
    BREAKFAST: z.ZodObject<{
        plates: z.ZodNumber;
        why: z.ZodString;
    }, z.core.$strip>;
    LUNCH: z.ZodObject<{
        plates: z.ZodNumber;
        why: z.ZodString;
    }, z.core.$strip>;
    DINNER: z.ZodObject<{
        plates: z.ZodNumber;
        why: z.ZodString;
    }, z.core.$strip>;
    tip: z.ZodString;
}, z.core.$strip>;
/** Rule-of-thumb forecast when AI is off. */
export declare function ruleForecast(signals: KitchenSignals): z.infer<typeof forecastSchema>;
declare let forecastOverride: ((signals: KitchenSignals) => Promise<unknown>) | null;
/** Test hook: replace the Gemini call (null restores). */
export declare function setKitchenForecasterForTests(run: typeof forecastOverride): void;
/** Plates per meal for one PG and day, with the reason and the food saved. */
export declare const getKitchenForecast: (req: Request, res: Response) => Promise<any>;
/** A one-minute pass for the owner's live voice briefing. */
export declare const postBriefingPass: (req: Request, res: Response) => Promise<any>;
export {};
//# sourceMappingURL=insights.controller.d.ts.map