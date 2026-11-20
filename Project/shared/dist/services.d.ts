export declare const MEAL_SLOTS: readonly ["BREAKFAST", "LUNCH", "DINNER"];
export declare const CLEANING_SLOTS: readonly ["MORNING", "AFTERNOON", "EVENING"];
export declare const SERVICE_ORDER_TYPES: readonly ["MEAL", "HOUSEKEEPING"];
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type CleaningSlot = (typeof CLEANING_SLOTS)[number];
export type ServiceOrderType = (typeof SERVICE_ORDER_TYPES)[number];
export declare const SLOT_LABELS: Record<MealSlot | CleaningSlot, string>;
export interface ServiceSettings {
    mealOrders: {
        enabled: boolean;
        prices: Record<MealSlot, number>;
    };
    housekeeping: {
        enabled: boolean;
        price: number;
    };
    /** Guests can compare habits with residents before requesting a bed. */
    vibeCheck: boolean;
    /** Uploaded IDs are read by AI to help the owner verify them. */
    kycAi: boolean;
}
export declare const DEFAULT_SERVICE_SETTINGS: ServiceSettings;
/** Days ahead a resident may order for (today counts as day 0). */
export declare const ORDER_DAYS_AHEAD = 14;
/** Fills defaults and drops anything unknown or invalid. */
export declare function cleanServiceSettings(input: unknown): ServiceSettings;
export declare const isSlotFor: (type: string, slot: string) => boolean;
