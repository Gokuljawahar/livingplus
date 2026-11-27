// Optional services a PG can switch on (the "modular owner console"), shared by
// the API (validation) and the web app (forms). Slot catalogs are provisioned
// dynamically in PostgreSQL (`PlatformCatalog.mealSlots` & `cleaningSlots`).

export const MEAL_SLOTS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
export const CLEANING_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
export const SERVICE_ORDER_TYPES = ['MEAL', 'HOUSEKEEPING'] as const;
export type MealSlot = string;
export type CleaningSlot = string;
export type ServiceOrderType = (typeof SERVICE_ORDER_TYPES)[number];

export const SLOT_LABELS: Record<string, string> = {
  BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner',
  MORNING: 'Morning (8–12)', AFTERNOON: 'Afternoon (12–4)', EVENING: 'Evening (4–8)'
};

export interface ServiceSettings {
  mealOrders: { enabled: boolean; prices: Record<string, number> };
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

/** Fills defaults and preserves dynamic meal slot prices. */
export function cleanServiceSettings(input: unknown, mealSlots: readonly string[] = MEAL_SLOTS): ServiceSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const defaults = DEFAULT_SERVICE_SETTINGS;
  const prices: Record<string, number> = {};
  for (const slot of mealSlots) {
    prices[slot] = price(raw.mealOrders?.prices?.[slot], defaults.mealOrders.prices[slot] ?? 0);
  }
  if (raw.mealOrders?.prices && typeof raw.mealOrders.prices === 'object') {
    for (const [slotKey, val] of Object.entries(raw.mealOrders.prices)) {
      if (!(slotKey in prices)) prices[slotKey] = price(val, 0);
    }
  }
  return {
    mealOrders: {
      enabled: raw.mealOrders?.enabled === true,
      prices
    },
    housekeeping: { enabled: raw.housekeeping?.enabled === true, price: price(raw.housekeeping?.price, defaults.housekeeping.price) },
    vibeCheck: raw.vibeCheck !== false,
    kycAi: raw.kycAi !== false
  };
}

export const isSlotFor = (
  type: string,
  slot: string,
  mealSlots: readonly string[] = MEAL_SLOTS,
  cleaningSlots: readonly string[] = CLEANING_SLOTS
): boolean =>
  type === 'MEAL' ? mealSlots.includes(slot) : type === 'HOUSEKEEPING' ? cleaningSlots.includes(slot) : false;
