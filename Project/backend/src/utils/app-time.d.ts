import { TZDate } from '@date-fns/tz';
export declare const appTimeZone: () => string;
/** The instant `at`, with calendar getters (getMonth, getDate...) in the app timezone. */
export declare function inAppZone(at?: Date): TZDate;
/** The instant of a wall-clock time in the app timezone (monthIndex is 0-based). */
export declare function zonedDate(year: number, monthIndex: number, day?: number, hours?: number, minutes?: number): Date;
/** "YYYY-MM" billing period containing `at` in the app timezone. */
export declare function periodOf(at?: Date): string;
/** [start, end) instants of a "YYYY-MM" period in the app timezone. */
export declare function periodRange(period: string): {
    gte: Date;
    lt: Date;
};
/** Due date (local midnight) for day `day` of the period containing `at`. */
export declare function dueDateIn(at: Date, day: number): Date;
/** First day of the month after `at`, at hours:minutes local time. */
export declare function nextMonthStart(at: Date, hours?: number, minutes?: number): Date;
//# sourceMappingURL=app-time.d.ts.map