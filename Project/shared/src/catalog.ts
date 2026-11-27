// Dynamic platform catalog contracts shared across PostgreSQL `PlatformCatalog`,
// backend services, public `/api/pg/catalog`, admin `/api/admin/catalog`, and React UI.
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

export const PLATFORM_CATALOG_KEYS: readonly PlatformCatalogKey[] = [
  'defaultCity',
  'amenityCategories',
  'roomAmenityOptions',
  'landmarks',
  'propertyTypes',
  'roomTypes',
  'genderPolicies',
  'priceBands',
  'sortOptions',
  'vibeQuestions',
  'bloodGroups',
  'kycTypes',
  'paymentMethods',
  'expenseCategories',
  'maintenanceCategories',
  'ticketPriorities',
  'mealSlots',
  'cleaningSlots',
  'leadStatuses',
  'defaultHouseRules',
  'assistantPersonas'
] as const;

export const PLATFORM_CATALOG_DESCRIPTIONS: Record<PlatformCatalogKey, string> = {
  defaultCity: 'Default marketplace city used for new listings and discovery headings',
  amenityCategories: 'Categorized property-level facilities shown in filters, onboarding, and detail pages',
  roomAmenityOptions: 'Room-level amenity tags selectable during room setup',
  landmarks: 'Campuses and tech parks with coordinates used for distance filtering and AI search',
  propertyTypes: 'Accommodation categories (PG, Hostel, Co-Living, Apartment, etc.)',
  roomTypes: 'Room sharing formats and display labels',
  genderPolicies: 'Resident gender policies and display labels',
  priceBands: 'Rent budget filter brackets in marketplace discovery',
  sortOptions: 'Marketplace sort dropdown options',
  vibeQuestions: 'Lifestyle roommate compatibility questions, weights, options, and match phrases',
  bloodGroups: 'Selectable blood groups on resident profiles',
  kycTypes: 'Identity document types accepted for resident KYC',
  paymentMethods: 'Accepted payment methods for rent ledger entries',
  expenseCategories: 'Property operating expense categories',
  maintenanceCategories: 'Facility maintenance issue categories for residents and staff',
  ticketPriorities: 'Maintenance ticket urgency levels',
  mealSlots: 'Configurable daily meal ordering slots',
  cleaningSlots: 'Configurable housekeeping time slots',
  leadStatuses: 'Owner onboarding inquiry pipeline stages',
  defaultHouseRules: 'Starter house rules prefilled during concierge PG onboarding',
  assistantPersonas: 'Welcome messages, input placeholders, and prompt chips per assistant persona'
};

export const INITIAL_PLATFORM_CATALOG_SEEDS: PlatformCatalogData = {
  defaultCity: 'Chennai',
  amenityCategories: [
    {
      category: 'Essentials',
      options: ['Wi-Fi', 'High-speed Wi-Fi', 'Power backup', 'Housekeeping', 'Laundry', 'Washing machine', 'RO drinking water', 'Lift']
    },
    {
      category: 'Food & Kitchen',
      options: ['Meals', '3 meals daily', 'Breakfast & dinner', 'Shared kitchen', 'Kitchen', 'Refrigerator', 'Microwave', 'Tea & coffee station']
    },
    {
      category: 'Safety & Access',
      options: ['CCTV surveillance', 'Biometric access', '24/7 security guard', '24/7 entry', 'Warden on site', 'Two-wheeler parking', 'Parking']
    },
    {
      category: 'Comfort & Extras',
      options: ['Study area', 'Coworking lounge', 'Gym / Fitness', 'TV lounge', 'Terrace sit-out', 'Attached bathroom', 'Geyser', 'AC common lounge']
    }
  ],
  roomAmenityOptions: ['Attached Bath', 'Balcony', 'Wardrobe', 'Study Desk', 'Geyser', 'Window View', 'Individual Locker', 'Reading Lamp'],
  landmarks: [
    { id: 'iit-madras', name: 'IIT Madras', kind: 'campus', latitude: 12.9916, longitude: 80.2336 },
    { id: 'anna-university', name: 'Anna University, Guindy', kind: 'campus', latitude: 13.0108, longitude: 80.2354 },
    { id: 'tidel-park', name: 'Tidel Park, Taramani', kind: 'office', latitude: 12.9894, longitude: 80.2483 },
    { id: 'olympia-tech-park', name: 'Olympia Tech Park, Guindy', kind: 'office', latitude: 13.0094, longitude: 80.2120 },
    { id: 'elcot-sholinganallur', name: 'ELCOT IT Park, Sholinganallur', kind: 'office', latitude: 12.8996, longitude: 80.2270 },
    { id: 'sipcot-siruseri', name: 'SIPCOT IT Park, Siruseri', kind: 'office', latitude: 12.8262, longitude: 80.2185 }
  ],
  propertyTypes: [
    { value: 'PG', label: 'Paying Guest (PG)', shortLabel: 'PG' },
    { value: 'HOSTEL', label: 'Hostel', shortLabel: 'Hostel' },
    { value: 'COLIVING', label: 'Co-Living', shortLabel: 'Co-Living' },
    { value: 'APARTMENT', label: 'Serviced Apartment', shortLabel: 'Apartment' }
  ],
  roomTypes: [
    { value: 'PRIVATE', label: 'Private room' },
    { value: 'DOUBLE', label: '2 sharing' },
    { value: 'TRIPLE', label: '3 sharing' },
    { value: 'SHARED', label: 'Shared dorm' }
  ],
  genderPolicies: [
    { value: 'ANY', label: 'Co-living' },
    { value: 'WOMEN', label: 'Women' },
    { value: 'MEN', label: 'Men' }
  ],
  priceBands: [
    { label: 'Under ₹5,000', min: '', max: '5000' },
    { label: '₹5,000 – ₹8,000', min: '5000', max: '8000' },
    { label: '₹8,000 – ₹12,000', min: '8000', max: '12000' },
    { label: 'Above ₹12,000', min: '12000', max: '' }
  ],
  sortOptions: [
    { value: 'featured', label: 'Best match' },
    { value: 'price-asc', label: 'Lowest rent' },
    { value: 'price-desc', label: 'Highest rent' },
    { value: 'beds-desc', label: 'Most beds free' }
  ],
  vibeQuestions: [
    {
      id: 'sleep', weight: 2, question: 'When do you usually go to sleep?',
      options: [{ value: 0, label: 'Before 11 pm' }, { value: 1, label: '11 pm to 1 am' }, { value: 2, label: 'After 1 am' }],
      phrase: ['sleep before 11 pm', 'sleep around midnight', 'stay up after 1 am']
    },
    {
      id: 'wake', weight: 1, question: 'When do you usually wake up?',
      options: [{ value: 0, label: 'Before 7 am' }, { value: 1, label: '7 to 9 am' }, { value: 2, label: 'After 9 am' }],
      phrase: ['wake up before 7 am', 'wake up between 7 and 9 am', 'wake up after 9 am']
    },
    {
      id: 'tidiness', weight: 2, question: 'How tidy do you keep your space?',
      options: [{ value: 0, label: 'Spotless, every day' }, { value: 1, label: 'Tidy most days' }, { value: 2, label: 'Relaxed about it' }],
      phrase: ['keep things spotless', 'keep things tidy most days', 'keep a relaxed approach to tidiness']
    },
    {
      id: 'noise', weight: 2, question: 'How much noise is normal for you in the room?',
      options: [{ value: 0, label: 'Quiet, headphones on' }, { value: 1, label: 'Some calls or music' }, { value: 2, label: 'Lively: calls, music, chats' }],
      phrase: ['like a quiet room', 'like some calls or music', 'like a lively room']
    },
    {
      id: 'guests', weight: 1, question: 'How often do friends visit you?',
      options: [{ value: 0, label: 'Rarely' }, { value: 1, label: 'Sometimes' }, { value: 2, label: 'Often' }],
      phrase: ['rarely have visitors', 'sometimes have visitors', 'often have visitors']
    },
    {
      id: 'kitchen', weight: 1, question: 'How often do you use the shared kitchen?',
      options: [{ value: 0, label: 'Rarely' }, { value: 1, label: 'A few times a week' }, { value: 2, label: 'Every day' }],
      phrase: ['rarely use the kitchen', 'use the kitchen a few times a week', 'use the kitchen every day']
    },
    {
      id: 'schedule', weight: 1, question: 'When are you usually busy with study or work?',
      options: [{ value: 0, label: 'Daytime' }, { value: 1, label: 'Mixed or flexible' }, { value: 2, label: 'Evenings or nights' }],
      phrase: ['study or work in the daytime', 'have a flexible schedule', 'study or work evenings or nights']
    },
    {
      id: 'cooling', weight: 1, question: 'What room temperature do you like?',
      options: [{ value: 0, label: 'Cool, AC on' }, { value: 1, label: 'In between' }, { value: 2, label: 'Warm, fan only' }],
      phrase: ['like the room cool', 'like a moderate temperature', 'prefer a fan to AC']
    }
  ],
  bloodGroups: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  kycTypes: [
    { value: 'AADHAAR', label: 'Aadhaar Card' },
    { value: 'PAN', label: 'PAN Card' },
    { value: 'PASSPORT', label: 'Passport' },
    { value: 'DRIVING_LICENSE', label: 'Driving License' },
    { value: 'STUDENT_ID', label: 'Student College ID' },
    { value: 'WORK_ID', label: 'Work Employee ID' }
  ],
  paymentMethods: [
    { value: 'CASH', label: 'Cash' },
    { value: 'NEFT', label: 'NEFT / Bank Transfer' },
    { value: 'UPI', label: 'UPI' },
    { value: 'OTHER', label: 'Other' }
  ],
  expenseCategories: [
    { value: 'FOOD', label: 'Food & Groceries' },
    { value: 'STAFF', label: 'Staff Salaries' },
    { value: 'MAINTENANCE', label: 'Repairs & Maintenance' },
    { value: 'UTILITIES', label: 'Utilities & Bills' },
    { value: 'OTHER', label: 'Other' }
  ],
  maintenanceCategories: [
    { value: 'PLUMBING', label: 'Plumbing (Tap, Pipe, Flush, Leakage)', shortLabel: 'Plumbing' },
    { value: 'ELECTRICAL', label: 'Electrical (Fan, Light, Switch, Geyser)', shortLabel: 'Electrical' },
    { value: 'APPLIANCE', label: 'Appliance (AC, Washing Machine, Fridge)', shortLabel: 'Appliance' },
    { value: 'CLEANING', label: 'Cleaning & Housekeeping', shortLabel: 'Cleaning' },
    { value: 'SAFETY', label: 'Safety & Locks', shortLabel: 'Safety' },
    { value: 'PEST', label: 'Pest Control', shortLabel: 'Pest Control' },
    { value: 'OTHER', label: 'Other Query', shortLabel: 'Other' }
  ],
  ticketPriorities: [
    { value: 'LOW', label: 'Low' },
    { value: 'NORMAL', label: 'Normal' },
    { value: 'HIGH', label: 'High' },
    { value: 'URGENT', label: 'Urgent' }
  ],
  mealSlots: [
    { value: 'BREAKFAST', label: 'Breakfast' },
    { value: 'LUNCH', label: 'Lunch' },
    { value: 'DINNER', label: 'Dinner' }
  ],
  cleaningSlots: [
    { value: 'MORNING', label: 'Morning (8–12)' },
    { value: 'AFTERNOON', label: 'Afternoon (12–4)' },
    { value: 'EVENING', label: 'Evening (4–8)' }
  ],
  leadStatuses: [
    { value: 'NEW', label: 'New inquiry' },
    { value: 'CONTACTED', label: 'Contacted' },
    { value: 'IN_PROGRESS', label: 'Onboarding' },
    { value: 'PUBLISHED', label: 'Published' },
    { value: 'ARCHIVED', label: 'Archived' }
  ],
  defaultHouseRules: [
    '24/7 CCTV in common areas',
    'Visitors permitted in reception lounge until 8:00 pm',
    '15 days prior notice before move-out'
  ],
  assistantPersonas: {
    guest: {
      welcome: 'Looking for a PG? Ask me to search by area, budget, or room type, compare stays, or start a booking request. Already applied? Track it under My requests.',
      placeholder: 'Search PGs by area, budget, or room type…',
      suggestedPrompts: ['Single rooms under ₹8,000', 'PGs with food included', 'How does deposit refund work?']
    },
    resident: {
      welcome: 'Ask about your own stay, rent balance or maintenance requests on your PG. You can also report an issue or change your meal preference. I can only ever see your stay — never other residents or owner finances.',
      placeholder: 'Ask about your stay, rent, or maintenance…',
      suggestedPrompts: ['When is my rent due?', 'How to request room swap?', 'Report WiFi / maintenance']
    },
    warden: {
      welcome: 'Ask about occupancy, bookings, maintenance or expenses on your assigned properties. The assistant will ask before any action. Dues detail lives in the owner rent ledger, which I cannot see.',
      placeholder: 'Ask about occupancy, bookings, or maintenance…',
      suggestedPrompts: ['Pending booking requests', 'Open maintenance tickets']
    },
    owner: {
      welcome: 'Ask about occupancy, outstanding rent, expenses or operations across your properties. The assistant will ask before any action.',
      placeholder: 'Ask about occupancy, rent, or expenses…',
      suggestedPrompts: ['Occupancy summary', 'Rent collection status', 'Draft vacancy update']
    }
  }
};
