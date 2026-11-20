// Calendar math in the business timezone, independent of the server's TZ.
// Cloud Run and most hosts run in UTC; rent periods, due dates and monthly
// jobs must follow the PG's local calendar (APP_TIMEZONE, default Asia/Kolkata).
import { TZDate } from '@date-fns/tz';

export const appTimeZone = (): string => process.env.APP_TIMEZONE || 'Asia/Kolkata';

/** The instant `at`, with calendar getters (getMonth, getDate...) in the app timezone. */
export function inAppZone(at: Date = new Date()): TZDate {
  return new TZDate(at.getTime(), appTimeZone());
}

/** The instant of a wall-clock time in the app timezone (monthIndex is 0-based). */
export function zonedDate(year: number, monthIndex: number, day = 1, hours = 0, minutes = 0): Date {
  return new Date(new TZDate(year, monthIndex, day, hours, minutes, 0, 0, appTimeZone()).getTime());
}

/** "YYYY-MM" billing period containing `at` in the app timezone. */
export function periodOf(at: Date = new Date()): string {
  const local = inAppZone(at);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}`;
}

/** [start, end) instants of a "YYYY-MM" period in the app timezone. */
export function periodRange(period: string): { gte: Date; lt: Date } {
  const [year = NaN, month = NaN] = period.split('-').map(Number);
  return { gte: zonedDate(year, month - 1, 1), lt: zonedDate(year, month, 1) };
}

/** Due date (local midnight) for day `day` of the period containing `at`. */
export function dueDateIn(at: Date, day: number): Date {
  const local = inAppZone(at);
  return zonedDate(local.getFullYear(), local.getMonth(), day);
}

/** First day of the month after `at`, at hours:minutes local time. */
export function nextMonthStart(at: Date, hours = 0, minutes = 0): Date {
  const local = inAppZone(at);
  return zonedDate(local.getFullYear(), local.getMonth() + 1, 1, hours, minutes);
}
