export declare const PROPERTY_TYPES: readonly ["PG", "HOSTEL", "COLIVING", "APARTMENT"];
export type PropertyType = string;
export declare const PROPERTY_TYPE_LABELS: Record<string, string>;
export declare const PROPERTY_TYPE_SHORT_LABELS: Record<string, string>;
export declare const isPropertyType: (value: string, allowed?: readonly string[]) => value is PropertyType;
export declare const LEAD_STATUSES: readonly ["NEW", "CONTACTED", "IN_PROGRESS", "PUBLISHED", "ARCHIVED"];
export type LeadStatus = string;
export declare const LEAD_STATUS_LABELS: Record<string, string>;
export declare const isLeadStatus: (value: string, allowed?: readonly string[]) => value is LeadStatus;
export interface AmenityCategory {
    category: string;
    options: readonly string[];
}
export declare const AMENITY_CATEGORIES: readonly AmenityCategory[];
export declare const ROOM_AMENITY_OPTIONS: readonly ["Attached Bath", "Balcony", "Wardrobe", "Study Desk", "Geyser", "Window View", "Individual Locker", "Reading Lamp"];
export interface CategorizedAmenities {
    category: string;
    items: string[];
}
/**
 * Groups an arbitrary list of facility labels into display categories using
 * the active dynamic `categories` catalog from PostgreSQL without dropping custom entries.
 */
export declare function categorizeAmenities(amenities: readonly string[], categories?: readonly AmenityCategory[]): CategorizedAmenities[];
