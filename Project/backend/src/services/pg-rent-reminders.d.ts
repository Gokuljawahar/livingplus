import { notifyWhatsAppTemplate } from './pg-notifications.js';
export declare const REMINDER_THROTTLE_MS: number;
export interface RentReminderInput {
    propertyIds?: string[] | undefined;
    period?: string | undefined;
    force?: boolean | undefined;
    actorId?: string | null | undefined;
}
export interface RentReminderOutcome {
    entryId: string;
    tenant: string;
    period: string;
    amount: number;
    outcome: 'sent' | 'throttled' | 'no-phone' | 'settled' | 'failed' | 'skipped';
    detail?: string;
}
export interface RentReminderSummary {
    total: number;
    sent: number;
    skipped: number;
    results: RentReminderOutcome[];
}
type Sender = typeof notifyWhatsAppTemplate;
export declare function sendDueRentReminders(db: any, input?: RentReminderInput, sender?: Sender): Promise<RentReminderSummary>;
export declare function startRentReminderScheduler(db: any): void;
export {};
//# sourceMappingURL=pg-rent-reminders.d.ts.map