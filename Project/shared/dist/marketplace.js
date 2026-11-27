// Marketplace property types, owner lead pipeline statuses, and categorized
// facility definitions shared across the public site, owner workspace, and
// internal concierge onboarding console.
export const PROPERTY_TYPES = ['PG', 'HOSTEL', 'COLIVING', 'APARTMENT'];
export const PROPERTY_TYPE_LABELS = {
    PG: 'Paying Guest (PG)',
    HOSTEL: 'Hostel',
    COLIVING: 'Co-Living',
    APARTMENT: 'Serviced Apartment'
};
export const PROPERTY_TYPE_SHORT_LABELS = {
    PG: 'PG',
    HOSTEL: 'Hostel',
    COLIVING: 'Co-Living',
    APARTMENT: 'Apartment'
};
export const isPropertyType = (value) => PROPERTY_TYPES.includes(value);
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'IN_PROGRESS', 'PUBLISHED', 'ARCHIVED'];
export const LEAD_STATUS_LABELS = {
    NEW: 'New inquiry',
    CONTACTED: 'Contacted',
    IN_PROGRESS: 'Onboarding',
    PUBLISHED: 'Published',
    ARCHIVED: 'Archived'
};
export const isLeadStatus = (value) => LEAD_STATUSES.includes(value);
export const AMENITY_CATEGORIES = [
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
];
const LEGACY_MATCHES = [
    [/wi-?fi|internet|broadband/i, 'Essentials'],
    [/power|backup|housekeeping|clean|laundry|wash|water|lift|elevator/i, 'Essentials'],
    [/meal|food|kitchen|fridge|refrigerator|microwave|dining|tea|coffee/i, 'Food & Kitchen'],
    [/cctv|biometric|security|warden|guard|parking|entry|lock|safe/i, 'Safety & Access'],
    [/study|cowork|gym|fitness|tv|terrace|balcony|geyser|ac|lounge|bath/i, 'Comfort & Extras']
];
/**
 * Groups an arbitrary list of facility labels (including legacy short tags)
 * into clean display categories without dropping custom entries.
 */
export function categorizeAmenities(amenities) {
    const seen = new Set();
    const buckets = new Map();
    for (const group of AMENITY_CATEGORIES)
        buckets.set(group.category, []);
    const extras = [];
    for (const raw of amenities) {
        const label = String(raw || '').trim();
        if (!label)
            continue;
        const key = label.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        let matchedCategory = null;
        for (const group of AMENITY_CATEGORIES) {
            if (group.options.some((option) => option.toLowerCase() === key)) {
                matchedCategory = group.category;
                break;
            }
        }
        if (!matchedCategory) {
            for (const [pattern, category] of LEGACY_MATCHES) {
                if (pattern.test(label)) {
                    matchedCategory = category;
                    break;
                }
            }
        }
        if (matchedCategory) {
            buckets.get(matchedCategory).push(label);
        }
        else {
            extras.push(label);
        }
    }
    const result = [];
    for (const group of AMENITY_CATEGORIES) {
        const items = buckets.get(group.category);
        if (items.length > 0)
            result.push({ category: group.category, items });
    }
    if (extras.length > 0)
        result.push({ category: 'More Facilities', items: extras });
    return result;
}
