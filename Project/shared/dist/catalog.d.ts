import type { AmenityCategory } from './marketplace.js';
import type { Landmark } from './places.js';
import type { VibeQuestion } from './vibecheck.js';
export interface CatalogOptionItem {
    value: string;
    label: string;
    shortLabel?: string | undefined;
    hint?: string | undefined;
}
export interface PriceBandItem {
    label: string;
    min: string;
    max: string;
}
export interface AssistantPersonaCopy {
    welcome: string;
    placeholder: string;
    suggestedPrompts: string[];
}
export type AssistantPersonaKey = 'guest' | 'resident' | 'warden' | 'owner';
export interface PlatformCatalogData {
    defaultCity: string;
    amenityCategories: AmenityCategory[];
    roomAmenityOptions: string[];
    landmarks: Landmark[];
    propertyTypes: CatalogOptionItem[];
    roomTypes: CatalogOptionItem[];
    genderPolicies: CatalogOptionItem[];
    priceBands: PriceBandItem[];
    sortOptions: CatalogOptionItem[];
    vibeQuestions: VibeQuestion[];
    bloodGroups: string[];
    kycTypes: CatalogOptionItem[];
    paymentMethods: CatalogOptionItem[];
    expenseCategories: CatalogOptionItem[];
    maintenanceCategories: CatalogOptionItem[];
    ticketPriorities: CatalogOptionItem[];
    mealSlots: CatalogOptionItem[];
    cleaningSlots: CatalogOptionItem[];
    leadStatuses: CatalogOptionItem[];
    defaultHouseRules: string[];
    assistantPersonas: Record<AssistantPersonaKey, AssistantPersonaCopy>;
}
export type PlatformCatalogKey = keyof PlatformCatalogData;
export declare const PLATFORM_CATALOG_KEYS: readonly PlatformCatalogKey[];
export declare const PLATFORM_CATALOG_DESCRIPTIONS: Record<PlatformCatalogKey, string>;
export declare const INITIAL_PLATFORM_CATALOG_SEEDS: PlatformCatalogData;
