export declare const MEAL_SLOTS: readonly ["BREAKFAST", "LUNCH", "DINNER"];
export declare const CLEANING_SLOTS: readonly ["MORNING", "AFTERNOON", "EVENING"];
export declare const SERVICE_ORDER_TYPES: readonly ["MEAL", "HOUSEKEEPING"];
export type MealSlot = string;
export type CleaningSlot = string;
export type ServiceOrderType = (typeof SERVICE_ORDER_TYPES)[number];
export declare const SLOT_LABELS: Record<string, string>;
export interface ServiceSettings {
    mealOrders: {
        enabled: boolean;
        prices: Record<string, number>;
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
/** Fills defaults and preserves dynamic meal slot prices. */
export declare function cleanServiceSettings(input: unknown, mealSlots?: readonly string[]): ServiceSettings;
export declare const isSlotFor: (type: string, slot: string, mealSlots?: readonly string[], cleaningSlots?: readonly string[]) => boolean;
