// Marketplace property types, owner lead pipeline statuses, and categorized
// facility definitions. Runtime values are loaded dynamically from PostgreSQL
// (`PlatformCatalog`); functions accept dynamic catalog arrays with safe defaults.

export const PROPERTY_TYPES = ['PG', 'HOSTEL', 'COLIVING', 'APARTMENT'] as const;
export type PropertyType = string;

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  PG: 'Paying Guest (PG)',
  HOSTEL: 'Hostel',
  COLIVING: 'Co-Living',
  APARTMENT: 'Serviced Apartment'
};

export const PROPERTY_TYPE_SHORT_LABELS: Record<string, string> = {
  PG: 'PG',
  HOSTEL: 'Hostel',
  COLIVING: 'Co-Living',
  APARTMENT: 'Apartment'
};

export const isPropertyType = (value: string, allowed: readonly string[] = PROPERTY_TYPES): value is PropertyType =>
  allowed.includes(value);

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'IN_PROGRESS', 'PUBLISHED', 'ARCHIVED'] as const;
export type LeadStatus = string;

export const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'New inquiry',
  CONTACTED: 'Contacted',
  IN_PROGRESS: 'Onboarding',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived'
};

export const isLeadStatus = (value: string, allowed: readonly string[] = LEAD_STATUSES): value is LeadStatus =>
  allowed.includes(value);

export interface AmenityCategory {
  category: string;
  options: readonly string[];
}

export const AMENITY_CATEGORIES: readonly AmenityCategory[] = [
  {
    category: 'Essentials',
    options: [
      'Wi-Fi',
      'High-speed Wi-Fi',
      'Power backup',
      'Housekeeping',
      'Laundry',
      'Washing machine',
      'RO drinking water',
      'Lift'
    ]
  },
  {
    category: 'Food & Kitchen',
    options: [
      'Meals',
      '3 meals daily',
      'Breakfast & dinner',
      'Shared kitchen',
      'Kitchen',
      'Refrigerator',
      'Microwave',
      'Tea & coffee station'
    ]
  },
  {
    category: 'Safety & Access',
    options: [
      'CCTV surveillance',
      'Biometric access',
      '24/7 security guard',
      '24/7 entry',
      'Warden on site',
      'Two-wheeler parking',
      'Parking'
    ]
  },
  {
    category: 'Comfort & Extras',
    options: [
      'Study area',
      'Coworking lounge',
      'Gym / Fitness',
      'TV lounge',
      'Terrace sit-out',
      'Attached bathroom',
      'Geyser',
      'AC common lounge'
    ]
  }
];

export const ROOM_AMENITY_OPTIONS = [
  'Attached Bath',
  'Balcony',
  'Wardrobe',
  'Study Desk',
  'Geyser',
  'Window View',
  'Individual Locker',
  'Reading Lamp'
] as const;

const LEGACY_MATCHES: ReadonlyArray<[RegExp, string]> = [
  [/wi-?fi|internet|broadband/i, 'Essentials'],
  [/power|backup|housekeeping|clean|laundry|wash|water|lift|elevator/i, 'Essentials'],
  [/meal|food|kitchen|fridge|refrigerator|microwave|dining|tea|coffee/i, 'Food & Kitchen'],
  [/cctv|biometric|security|warden|guard|parking|entry|lock|safe/i, 'Safety & Access'],
  [/study|cowork|gym|fitness|tv|terrace|balcony|geyser|ac|lounge|bath/i, 'Comfort & Extras']
];

export interface CategorizedAmenities {
  category: string;
  items: string[];
}

/**
 * Groups an arbitrary list of facility labels into display categories using
 * the active dynamic `categories` catalog from PostgreSQL without dropping custom entries.
 */
export function categorizeAmenities(
  amenities: readonly string[],
  categories: readonly AmenityCategory[] = AMENITY_CATEGORIES
): CategorizedAmenities[] {
  const seen = new Set<string>();
  const buckets = new Map<string, string[]>();
  for (const group of categories) buckets.set(group.category, []);
  const extras: string[] = [];

  for (const raw of amenities) {
    const label = String(raw || '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let matchedCategory: string | null = null;
    for (const group of categories) {
      if (group.options.some((option) => option.toLowerCase() === key)) {
        matchedCategory = group.category;
        break;
      }
    }
    if (!matchedCategory) {
      for (const [pattern, category] of LEGACY_MATCHES) {
        if (buckets.has(category) && pattern.test(label)) {
          matchedCategory = category;
          break;
        }
      }
    }
    if (matchedCategory && buckets.has(matchedCategory)) {
      buckets.get(matchedCategory)!.push(label);
    } else {
      extras.push(label);
    }
  }

  const result: CategorizedAmenities[] = [];
  for (const group of categories) {
    const items = buckets.get(group.category)!;
    if (items.length > 0) result.push({ category: group.category, items });
  }
  if (extras.length > 0) result.push({ category: 'More Facilities', items: extras });
  return result;
}
