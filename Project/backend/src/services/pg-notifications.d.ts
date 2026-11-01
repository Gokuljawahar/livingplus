export declare const featureFlags: {
    whatsappCloudApi: boolean;
    upiPayment: boolean;
};
export type WhatsAppEvent = 'BOOKING_RECEIVED' | 'BOOKING_APPROVED' | 'BOOKING_REJECTED' | 'CHECK_IN_REMINDER' | 'RENT_DUE';
export type WhatsAppResult = {
    sent: true;
} | {
    sent: false;
    skipped: 'disabled' | 'not-configured' | 'no-recipient';
};
export declare function notifyWhatsAppTemplate(event: WhatsAppEvent, toPhone: string | null | undefined, parameters?: string[]): Promise<WhatsAppResult>;
export declare function notifyWhatsAppSafely(event: WhatsAppEvent, toPhone: string | null | undefined, parameters?: string[]): void;
//# sourceMappingURL=pg-notifications.d.ts.map