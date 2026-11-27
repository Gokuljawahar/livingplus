// Optional services a PG can switch on (the "modular owner console"), shared by
// the API (validation) and the web app (forms). Slot catalogs are provisioned
// dynamically in PostgreSQL (`PlatformCatalog.mealSlots` & `cleaningSlots`).
export const MEAL_SLOTS = ['BREAKFAST', 'LUNCH', 'DINNER'];
export const CLEANING_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'];
export const SERVICE_ORDER_TYPES = ['MEAL', 'HOUSEKEEPING'];
export const SLOT_LABELS = {
    BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner',
    MORNING: 'Morning (8–12)', AFTERNOON: 'Afternoon (12–4)', EVENING: 'Evening (4–8)'
};
export const DEFAULT_SERVICE_SETTINGS = {
    mealOrders: { enabled: false, prices: { BREAKFAST: 0, LUNCH: 0, DINNER: 0 } },
    housekeeping: { enabled: false, price: 0 },
    vibeCheck: true,
    kycAi: true
};
/** Days ahead a resident may order for (today counts as day 0). */
export const ORDER_DAYS_AHEAD = 14;
const price = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.round(n) : fallback;
};
/** Fills defaults and preserves dynamic meal slot prices. */
export function cleanServiceSettings(input, mealSlots = MEAL_SLOTS) {
    const raw = (input && typeof input === 'object' ? input : {});
    const defaults = DEFAULT_SERVICE_SETTINGS;
    const prices = {};
    for (const slot of mealSlots) {
        prices[slot] = price(raw.mealOrders?.prices?.[slot], defaults.mealOrders.prices[slot] ?? 0);
    }
    if (raw.mealOrders?.prices && typeof raw.mealOrders.prices === 'object') {
        for (const [slotKey, val] of Object.entries(raw.mealOrders.prices)) {
            if (!(slotKey in prices))
                prices[slotKey] = price(val, 0);
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
export const isSlotFor = (type, slot, mealSlots = MEAL_SLOTS, cleaningSlots = CLEANING_SLOTS) => type === 'MEAL' ? mealSlots.includes(slot) : type === 'HOUSEKEEPING' ? cleaningSlots.includes(slot) : false;
