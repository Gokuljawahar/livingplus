// Optional services a PG can switch on (the "modular owner console"), shared by
// the API (validation) and the web app (forms). Prices are per order in rupees.

export const MEAL_SLOTS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
export const CLEANING_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
export const SERVICE_ORDER_TYPES = ['MEAL', 'HOUSEKEEPING'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];
export type CleaningSlot = (typeof CLEANING_SLOTS)[number];
export type ServiceOrderType = (typeof SERVICE_ORDER_TYPES)[number];

export const SLOT_LABELS: Record<MealSlot | CleaningSlot, string> = {
  BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner',
  MORNING: 'Morning (8–12)', AFTERNOON: 'Afternoon (12–4)', EVENING: 'Evening (4–8)'
};

export interface ServiceSettings {
  mealOrders: { enabled: boolean; prices: Record<MealSlot, number> };
  housekeeping: { enabled: boolean; price: number };
  /** Guests can compare habits with residents before requesting a bed. */
  vibeCheck: boolean;
  /** Uploaded IDs are read by AI to help the owner verify them. */
  kycAi: boolean;
}

export const DEFAULT_SERVICE_SETTINGS: ServiceSettings = {
  mealOrders: { enabled: false, prices: { BREAKFAST: 0, LUNCH: 0, DINNER: 0 } },
  housekeeping: { enabled: false, price: 0 },
  vibeCheck: true,
  kycAi: true
};

/** Days ahead a resident may order for (today counts as day 0). */
export const ORDER_DAYS_AHEAD = 14;

const price = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.round(n) : fallback;
};

/** Fills defaults and drops anything unknown or invalid. */
export function cleanServiceSettings(input: unknown): ServiceSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const defaults = DEFAULT_SERVICE_SETTINGS;
  return {
    mealOrders: {
      enabled: raw.mealOrders?.enabled === true,
      prices: {
        BREAKFAST: price(raw.mealOrders?.prices?.BREAKFAST, defaults.mealOrders.prices.BREAKFAST),
        LUNCH: price(raw.mealOrders?.prices?.LUNCH, defaults.mealOrders.prices.LUNCH),
        DINNER: price(raw.mealOrders?.prices?.DINNER, defaults.mealOrders.prices.DINNER)
      }
    },
    housekeeping: { enabled: raw.housekeeping?.enabled === true, price: price(raw.housekeeping?.price, defaults.housekeeping.price) },
    vibeCheck: raw.vibeCheck !== false,
    kycAi: raw.kycAi !== false
  };
}

export const isSlotFor = (type: string, slot: string): boolean =>
  type === 'MEAL' ? (MEAL_SLOTS as readonly string[]).includes(slot) : type === 'HOUSEKEEPING' ? (CLEANING_SLOTS as readonly string[]).includes(slot) : false;
