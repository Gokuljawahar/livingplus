import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  INITIAL_PLATFORM_CATALOG_SEEDS,
  PLATFORM_CATALOG_DESCRIPTIONS,
  PLATFORM_CATALOG_KEYS
} from '@livingplus/shared';

const prisma = new PrismaClient() as any;

interface DemoRoomSpec {
  number: string;
  block?: string;
  floor?: number;
  roomType: 'PRIVATE' | 'DOUBLE' | 'TRIPLE' | 'SHARED';
  rent: number;
  deposit?: number;
  maintenanceFee?: number;
  utilitiesSurcharge?: number;
  hasAc: boolean;
  foodIncluded: boolean;
  foodCharge: number;
  beds: string[];
  description: string;
  amenities: string[];
  photoUrls: string[];
}

interface DemoPropertySpec {
  id: string;
  slug: string;
  name: string;
  propertyType: 'PG' | 'HOSTEL' | 'COLIVING' | 'APARTMENT';
  tagline: string;
  description: string;
  locality: string;
  landmark: string;
  pincode: string;
  latitude: number;
  longitude: number;
  address: string;
  contactPhone: string;
  genderPolicy: 'WOMEN' | 'MEN' | 'ANY';
  featured: boolean;
  amenities: string[];
  highlights: string[];
  foodDetails: string;
  nearbyPlaces: string[];
  houseRules: string[];
  photoUrls: string[];
  rooms: DemoRoomSpec[];
}

// Keep Palm Grove (pg-demo-perungudi-women) rooms with hasAc: false so the VibeCheck E2E test skips room temperature.
const demoProperties: DemoPropertySpec[] = [
  {
    id: 'pg-demo-perungudi-women',
    slug: 'palm-grove-womens-residence',
    name: "Palm Grove Women's Residence",
    propertyType: 'PG',
    tagline: 'Calm lake-view residence for women students & IT professionals near Tidel Park',
    description: 'Bright, airy residence on Lake View Road with 24/7 warden support, biometric entry, and quiet study floors designed for focus and comfort.',
    locality: 'Perungudi',
    landmark: 'Near Perungudi MRTS & Lake View Road',
    pincode: '600096',
    latitude: 12.9653,
    longitude: 80.2461,
    address: '14, Lake View Road, Perungudi',
    contactPhone: '9840011001',
    genderPolicy: 'WOMEN',
    featured: true,
    amenities: ['Wi-Fi', 'High-speed Wi-Fi', 'Meals', 'Laundry', 'CCTV surveillance', 'Biometric access', 'Warden on site', 'RO drinking water', 'Power backup', 'Study area'],
    highlights: ['Biometric gate & 24/7 female warden on site', '5 mins walk to Perungudi MRTS & OMR bus stop', 'Zero brokerage — direct verified owner listing'],
    foodDetails: 'Optional home-style South & North Indian kitchen plans, plus 24/7 RO water and tea/coffee counter.',
    nearbyPlaces: ['Perungudi MRTS Station · 600 m', 'Tidel Park, Taramani · 2.8 km', 'RMZ Millennia Business Park · 2.4 km'],
    houseRules: ['Entry gate closes at 10:30 pm (prior intimation for late work shifts)', 'Visitors allowed in ground-floor reception lounge until 7:00 pm', 'No smoking or alcohol inside premises'],
    photoUrls: ['/demo-pgs/exterior-modern.svg', '/demo-pgs/room-twin.svg', '/demo-pgs/lounge-dining.svg'],
    rooms: [
      {
        number: '101',
        block: 'A Block',
        floor: 1,
        roomType: 'DOUBLE',
        rent: 9800,
        hasAc: false,
        foodIncluded: false,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: 'Spacious twin-sharing non-AC room facing the garden courtyard with individual lockable wardrobes and study desks.',
        amenities: ['Attached Bath', 'Wardrobe', 'Study Desk', 'Window View'],
        photoUrls: ['/demo-pgs/room-twin.svg']
      },
      {
        number: '102',
        block: 'A Block',
        floor: 1,
        roomType: 'TRIPLE',
        rent: 8500,
        hasAc: false,
        foodIncluded: false,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: 'Value 3-sharing corner room with cross-ventilation, ceiling fans, and ample storage.',
        amenities: ['Attached Bath', 'Wardrobe', 'Individual Locker'],
        photoUrls: ['/demo-pgs/room-triple.svg']
      }
    ]
  },
  {
    id: 'pg-demo-thoraipakkam-men',
    slug: 'harbour-point-mens-pg',
    name: "Harbour Point Men's PG",
    propertyType: 'PG',
    tagline: 'Homely food, AC rooms & instant walk to ELCOT IT Park, Sholinganallur',
    description: 'Built for OMR techies and trainees. Includes daily housekeeping, home-cooked 3-meal dining plan, high-speed fiber Wi-Fi on every floor, and covered two-wheeler parking.',
    locality: 'Sholinganallur',
    landmark: 'Opposite ELCOT IT Park Gate 2',
    pincode: '600119',
    latitude: 12.901,
    longitude: 80.2279,
    address: '22, Rajiv Gandhi Salai, Sholinganallur',
    contactPhone: '9840011002',
    genderPolicy: 'MEN',
    featured: true,
    amenities: ['Wi-Fi', 'High-speed Wi-Fi', '3 meals daily', 'Housekeeping', 'Parking', 'Two-wheeler parking', 'Power backup', 'CCTV surveillance', 'Washing machine', 'RO drinking water'],
    highlights: ['3 fresh home-style meals served hot daily', '300 Mbps dual-band fiber Wi-Fi with backup', 'Walking distance to HCL, Infosys & Wipro campuses'],
    foodDetails: 'Breakfast, packed lunch box, and hot dinner included in food-plan rooms (opt-out available anytime from the Resident Portal).',
    nearbyPlaces: ['ELCOT IT Park · 400 m', 'Accenture Sholinganallur · 700 m', 'Sholinganallur Junction · 900 m'],
    houseRules: ['24/7 biometric access for residents', 'Two-wheeler parking in basement bay with sticker', 'Quiet hours after 11:00 pm in shared rooms'],
    photoUrls: ['/demo-pgs/exterior-modern.svg', '/demo-pgs/room-twin.svg', '/demo-pgs/room-triple.svg', '/demo-pgs/lounge-dining.svg'],
    rooms: [
      {
        number: '201',
        block: 'Main',
        floor: 2,
        roomType: 'DOUBLE',
        rent: 8800,
        hasAc: true,
        foodIncluded: true,
        foodCharge: 1500,
        beds: ['Bed 1', 'Bed 2'],
        description: 'AC 2-sharing executive room with attached bath, geyser, and orthopedic mattresses.',
        amenities: ['Attached Bath', 'Wardrobe', 'Geyser', 'Study Desk'],
        photoUrls: ['/demo-pgs/room-twin.svg']
      },
      {
        number: '202',
        block: 'Main',
        floor: 2,
        roomType: 'TRIPLE',
        rent: 7600,
        hasAc: false,
        foodIncluded: true,
        foodCharge: 1500,
        beds: ['Bed 1', 'Bed 2'],
        description: 'Ventilated 3-sharing room with daily cleaning and hot meals option.',
        amenities: ['Attached Bath', 'Wardrobe', 'Individual Locker'],
        photoUrls: ['/demo-pgs/room-triple.svg']
      }
    ]
  },
  {
    id: 'pg-demo-guindy-coliving',
    slug: 'cedar-house-coliving',
    name: 'Cedar House Co-Living',
    propertyType: 'COLIVING',
    tagline: 'Design-forward studio & twin suites with coworking lounge on OMR',
    description: 'Modern co-living community in Thoraipakkam offering private and twin rooms, ergonomic WFH desks, community kitchen, rooftop terrace sit-out, and weekly resident mixers.',
    locality: 'Thoraipakkam',
    landmark: 'Near Thoraipakkam Toll & Jain College',
    pincode: '600097',
    latitude: 12.9416,
    longitude: 80.2362,
    address: '8, Rajiv Gandhi Salai, Thoraipakkam',
    contactPhone: '9840011003',
    genderPolicy: 'ANY',
    featured: true,
    amenities: ['Wi-Fi', 'High-speed Wi-Fi', 'Kitchen', 'Shared kitchen', 'Coworking lounge', 'Study area', 'Gym / Fitness', 'Terrace sit-out', 'Biometric access', 'CCTV surveillance', 'Laundry', 'Lift'],
    highlights: ['Dedicated 24-seat WFH coworking floor with 500 Mbps internet', 'Zero curfew with app/biometric access', 'Private & twin AC rooms with attached balconies'],
    foodDetails: 'Self-cook community kitchen equipped with induction stoves, microwave, fridge, and optional tiffin tie-up.',
    nearbyPlaces: ['Thoraipakkam Bus Stop · 250 m', 'SP Infocity · 3.1 km', 'Tidel Park · 5.2 km'],
    houseRules: ['No curfew — biometric access 24/7', 'Day guests welcome in lounge until 10:00 pm', 'Keep shared kitchen clean after cooking'],
    photoUrls: ['/demo-pgs/exterior-coliving.svg', '/demo-pgs/room-private.svg', '/demo-pgs/lounge-dining.svg'],
    rooms: [
      {
        number: '301',
        block: 'Studio Wing',
        floor: 3,
        roomType: 'PRIVATE',
        rent: 13500,
        hasAc: true,
        foodIncluded: false,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: 'Private AC suite with queen-ready bed, work desk, smart wardrobe, and private balcony.',
        amenities: ['Attached Bath', 'Balcony', 'Study Desk', 'Wardrobe', 'Geyser'],
        photoUrls: ['/demo-pgs/room-private.svg']
      },
      {
        number: '302',
        block: 'Co-Living Wing',
        floor: 3,
        roomType: 'DOUBLE',
        rent: 10400,
        hasAc: true,
        foodIncluded: false,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: 'Modern twin AC sharing room with individual reading lamps and desk spaces.',
        amenities: ['Attached Bath', 'Study Desk', 'Reading Lamp', 'Wardrobe'],
        photoUrls: ['/demo-pgs/room-twin.svg']
      }
    ]
  },
  {
    id: 'pg-demo-anna-nagar',
    slug: 'northstar-student-living',
    name: 'Northstar Student Living',
    propertyType: 'HOSTEL',
    tagline: 'Quiet, budget-friendly student hostel near Velachery MRTS & IIT Madras',
    description: 'Clean, quiet hostel built for students preparing for exams or studying at IIT Madras and Anna University. Features library-quiet study rooms, shared pantry, and transparent billing.',
    locality: 'Velachery',
    landmark: 'Opposite Velachery 100 Feet Road Flyover',
    pincode: '600042',
    latitude: 12.9815,
    longitude: 80.218,
    address: '31, 100 Feet Road, Velachery',
    contactPhone: '9840011004',
    genderPolicy: 'ANY',
    featured: false,
    amenities: ['Wi-Fi', 'Shared kitchen', 'Study area', 'RO drinking water', 'Washing machine', 'CCTV surveillance', 'Power backup', 'Two-wheeler parking'],
    highlights: ['Quiet study floor strictly maintained 24/7', '10 mins commute to IIT Madras & Anna University', 'Affordable 1-month refundable deposit'],
    foodDetails: 'Shared kitchenette with refrigerator, microwave, and kettle; affordable meal partner nearby.',
    nearbyPlaces: ['Velachery MRTS Station · 900 m', 'IIT Madras Velachery Gate · 2.3 km', 'Phoenix Marketcity · 1.1 km'],
    houseRules: ['Maintain library silence in study zone', 'No loud music after 10:00 pm', '15 days prior notice before move-out'],
    photoUrls: ['/demo-pgs/exterior-modern.svg', '/demo-pgs/room-triple.svg', '/demo-pgs/lounge-dining.svg'],
    rooms: [
      {
        number: '401',
        block: 'North',
        floor: 4,
        roomType: 'DOUBLE',
        rent: 9200,
        hasAc: true,
        foodIncluded: false,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: 'AC 2-sharing student room with study tables, bookshelves, and bright daylight.',
        amenities: ['Attached Bath', 'Study Desk', 'Wardrobe', 'Reading Lamp'],
        photoUrls: ['/demo-pgs/room-twin.svg']
      },
      {
        number: '402',
        block: 'North',
        floor: 4,
        roomType: 'SHARED',
        rent: 8200,
        hasAc: false,
        foodIncluded: false,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: 'Budget-friendly ventilated room with dedicated lockers and study lamps.',
        amenities: ['Study Desk', 'Individual Locker', 'Window View'],
        photoUrls: ['/demo-pgs/room-triple.svg']
      }
    ]
  },
  {
    id: 'pg-demo-guindy-olympia',
    slug: 'veranda-suites-guindy',
    name: 'Veranda Suites, Guindy',
    propertyType: 'APARTMENT',
    tagline: 'Fully serviced AC private & twin studios 500 m from Olympia Tech Park',
    description: 'Executive serviced residences crafted for consultants, founders, and working professionals around Guindy Industrial Estate & Anna University.',
    locality: 'Guindy',
    landmark: 'Near Guindy Metro & Olympia Tech Park',
    pincode: '600032',
    latitude: 13.0085,
    longitude: 80.2136,
    address: '19, Sardar Patel Road, Guindy',
    contactPhone: '9840011005',
    genderPolicy: 'ANY',
    featured: true,
    amenities: ['High-speed Wi-Fi', 'Housekeeping', 'Lift', 'Power backup', 'CCTV surveillance', 'Biometric access', 'Refrigerator', 'Microwave', 'Coworking lounge', 'Parking'],
    highlights: ['4 mins walk to Guindy Metro & Olympia Tech Park', 'Hotel-grade linen & thrice-weekly deep cleaning', 'Private studio apartments & executive twin sharing'],
    foodDetails: 'In-room kitchenette with fridge & microwave; optional curated breakfast & dinner tiffin service.',
    nearbyPlaces: ['Olympia Tech Park · 500 m', 'Guindy Metro Station · 650 m', 'Anna University · 2.4 km'],
    houseRules: ['No curfew — digital smart-lock entry', 'Visitors permitted between 8 am and 9 pm', 'No smoking indoors'],
    photoUrls: ['/demo-pgs/exterior-coliving.svg', '/demo-pgs/room-private.svg', '/demo-pgs/lounge-dining.svg'],
    rooms: [
      {
        number: '501',
        block: 'Executive',
        floor: 5,
        roomType: 'PRIVATE',
        rent: 16500,
        deposit: 20000,
        hasAc: true,
        foodIncluded: false,
        foodCharge: 1800,
        beds: ['Bed 1'],
        description: 'Single-occupancy executive AC studio with balcony, smart wardrobe, work desk, and mini fridge.',
        amenities: ['Attached Bath', 'Balcony', 'Study Desk', 'Wardrobe', 'Geyser'],
        photoUrls: ['/demo-pgs/room-private.svg']
      },
      {
        number: '502',
        block: 'Executive',
        floor: 5,
        roomType: 'DOUBLE',
        rent: 11500,
        deposit: 15000,
        hasAc: true,
        foodIncluded: false,
        foodCharge: 1800,
        beds: ['Bed 1', 'Bed 2'],
        description: 'Spacious twin AC room with dual study tables and attached geyser bath.',
        amenities: ['Attached Bath', 'Study Desk', 'Wardrobe', 'Geyser'],
        photoUrls: ['/demo-pgs/room-twin.svg']
      }
    ]
  },
  {
    id: 'pg-demo-adyar-women',
    slug: 'banyan-court-womens-hostel',
    name: "Banyan Court Women's Hostel",
    propertyType: 'HOSTEL',
    tagline: 'Tree-lined residential street in Adyar with home-cooked South Indian meals',
    description: 'Trusted women’s hostel in Gandhi Nagar, Adyar, loved by IIT Madras researchers and working women for fresh home-cooked meals and peaceful surroundings.',
    locality: 'Adyar',
    landmark: 'Near Gandhi Nagar Bus Terminus & IIT Madras Gate',
    pincode: '600020',
    latitude: 13.0067,
    longitude: 80.2565,
    address: '42, 2nd Main Road, Gandhi Nagar, Adyar',
    contactPhone: '9840011006',
    genderPolicy: 'WOMEN',
    featured: false,
    amenities: ['Wi-Fi', 'Breakfast & dinner', '3 meals daily', 'Warden on site', 'CCTV surveillance', 'Laundry', 'RO drinking water', 'Power backup', 'Study area'],
    highlights: ['Wholesome home-cooked South Indian & North Indian meals included', 'Quiet residential lane 10 mins from IIT Madras', '24/7 resident warden and CCTV coverage'],
    foodDetails: '3 home-cooked vegetarian/non-veg meals included in rent; packed lunch available for early commuters.',
    nearbyPlaces: ['IIT Madras Adyar Gate · 1.5 km', 'Adyar Depot · 700 m', 'Thiruvanmiyur Beach · 2.6 km'],
    houseRules: ['Curfew at 10:00 pm (flexible for lab/work shift approval)', 'Parents & female visitors allowed in lounge', 'Veg & non-veg served in separate dining counters'],
    photoUrls: ['/demo-pgs/exterior-modern.svg', '/demo-pgs/room-twin.svg', '/demo-pgs/room-triple.svg'],
    rooms: [
      {
        number: '601',
        block: 'Garden',
        floor: 1,
        roomType: 'DOUBLE',
        rent: 10500,
        hasAc: true,
        foodIncluded: true,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: 'AC twin room overlooking the neem courtyard with meals included.',
        amenities: ['Attached Bath', 'Wardrobe', 'Study Desk', 'Window View'],
        photoUrls: ['/demo-pgs/room-twin.svg']
      },
      {
        number: '602',
        block: 'Garden',
        floor: 2,
        roomType: 'TRIPLE',
        rent: 7900,
        hasAc: false,
        foodIncluded: true,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2', 'Bed 3'],
        description: 'Bright 3-sharing non-AC room with individual wardrobes and study desks; all meals included.',
        amenities: ['Attached Bath', 'Wardrobe', 'Individual Locker'],
        photoUrls: ['/demo-pgs/room-triple.svg']
      }
    ]
  },
  {
    id: 'pg-demo-siruseri-coliving',
    slug: 'marina-breeze-omr-coliving',
    name: 'Marina Breeze OMR Co-Living',
    propertyType: 'COLIVING',
    tagline: 'High-value AC & Non-AC rooms 5 mins from SIPCOT IT Park, Siruseri',
    description: 'Purpose-built co-living and PG complex in Navalur/Siruseri with gym, TV lounge, high-speed Wi-Fi, and quick shuttle access to SIPCOT IT Park.',
    locality: 'Siruseri',
    landmark: 'Near Navalur Toll & SIPCOT Main Gate',
    pincode: '603103',
    latitude: 12.8382,
    longitude: 80.2239,
    address: '108, OMR Main Road, Navalur - Siruseri',
    contactPhone: '9840011007',
    genderPolicy: 'ANY',
    featured: false,
    amenities: ['High-speed Wi-Fi', 'Gym / Fitness', 'TV lounge', '3 meals daily', 'Washing machine', 'Parking', 'CCTV surveillance', 'Biometric access', 'Power backup'],
    highlights: ['On-site gym, table tennis & weekend movie lounge', '5 mins to TCS, Cognizant & Hexaware inside SIPCOT', 'Private, 2-sharing, and 3-sharing options under one roof'],
    foodDetails: 'Unlimited buffet breakfast & dinner plus weekend special lunch.',
    nearbyPlaces: ['SIPCOT IT Park Main Gate · 1.2 km', 'Marina Mall OMR · 1.8 km', 'Navalur Junction · 1.5 km'],
    houseRules: ['24/7 biometric access', 'Gym open 5:30 am – 10:30 pm', 'Covered two-wheeler & car parking'],
    photoUrls: ['/demo-pgs/exterior-coliving.svg', '/demo-pgs/room-private.svg', '/demo-pgs/room-twin.svg', '/demo-pgs/lounge-dining.svg'],
    rooms: [
      {
        number: '701',
        block: 'B Wing',
        floor: 2,
        roomType: 'PRIVATE',
        rent: 11800,
        hasAc: true,
        foodIncluded: true,
        foodCharge: 0,
        beds: ['Bed 1'],
        description: 'Compact private AC room with work table and meals included.',
        amenities: ['Attached Bath', 'Study Desk', 'Wardrobe', 'Geyser'],
        photoUrls: ['/demo-pgs/room-private.svg']
      },
      {
        number: '702',
        block: 'B Wing',
        floor: 2,
        roomType: 'DOUBLE',
        rent: 7800,
        hasAc: true,
        foodIncluded: true,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: '2-sharing AC room with buffet food and gym access included.',
        amenities: ['Attached Bath', 'Wardrobe', 'Individual Locker'],
        photoUrls: ['/demo-pgs/room-twin.svg']
      },
      {
        number: '703',
        block: 'B Wing',
        floor: 1,
        roomType: 'TRIPLE',
        rent: 6400,
        hasAc: false,
        foodIncluded: true,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2', 'Bed 3'],
        description: 'Economical 3-sharing non-AC room with full meals and Wi-Fi.',
        amenities: ['Attached Bath', 'Wardrobe', 'Individual Locker'],
        photoUrls: ['/demo-pgs/room-triple.svg']
      }
    ]
  },
  {
    id: 'pg-demo-tnagar-men',
    slug: 'horizon-mens-pg-t-nagar',
    name: "Horizon Men's PG, T. Nagar",
    propertyType: 'PG',
    tagline: 'Central Chennai PG steps away from Teynampet Metro & Pondy Bazaar',
    description: 'Centrally located men’s PG in T. Nagar ideal for CA aspirants, hospital interns, and city-center professionals looking for clean rooms and reliable food.',
    locality: 'T. Nagar',
    landmark: 'Off North Usman Road, near Teynampet Metro',
    pincode: '600017',
    latitude: 13.0442,
    longitude: 80.2337,
    address: '17, Habibullah Road, T. Nagar',
    contactPhone: '9840011008',
    genderPolicy: 'MEN',
    featured: false,
    amenities: ['Wi-Fi', 'Breakfast & dinner', 'Housekeeping', 'RO drinking water', 'CCTV surveillance', 'Power backup', 'Two-wheeler parking'],
    highlights: ['Central city access — 8 mins walk to Teynampet Metro', 'Daily room housekeeping & clean common dining hall', 'Quiet study desks for CA / UPSC aspirants'],
    foodDetails: 'Fresh South Indian breakfast and dinner included every day.',
    nearbyPlaces: ['Teynampet Metro · 750 m', 'Pondy Bazaar · 500 m', 'Loyola College · 2.1 km'],
    houseRules: ['Gate access until 11:30 pm', 'No smoking inside rooms', '1 month refundable security deposit'],
    photoUrls: ['/demo-pgs/exterior-modern.svg', '/demo-pgs/room-twin.svg'],
    rooms: [
      {
        number: '801',
        block: 'Main',
        floor: 1,
        roomType: 'DOUBLE',
        rent: 9500,
        hasAc: true,
        foodIncluded: true,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2'],
        description: 'AC 2-sharing room on Habibullah Road with breakfast & dinner included.',
        amenities: ['Attached Bath', 'Wardrobe', 'Study Desk'],
        photoUrls: ['/demo-pgs/room-twin.svg']
      },
      {
        number: '802',
        block: 'Main',
        floor: 2,
        roomType: 'TRIPLE',
        rent: 7200,
        hasAc: false,
        foodIncluded: true,
        foodCharge: 0,
        beds: ['Bed 1', 'Bed 2', 'Bed 3'],
        description: 'Clean 3-sharing non-AC room with lockers and daily housekeeping.',
        amenities: ['Attached Bath', 'Individual Locker'],
        photoUrls: ['/demo-pgs/room-triple.svg']
      }
    ]
  }
];

// Ananya's VibeCheck: early sleeper, tidy, quiet (so guests see real match reasons).
const DEMO_VIBE = { sleep: 0, wake: 0, tidiness: 0, noise: 0, guests: 0, kitchen: 1, schedule: 0, cooling: 1 };

const HARBOUR_PG_ID = 'pg-demo-thoraipakkam-men';
const NORTHSTAR_PG_ID = 'pg-demo-anna-nagar';

// Habits: sleep, wake, tidiness, noise, guests, kitchen, schedule, cooling (0-2 each).
const LIVELY_RESIDENTS = [
  { id: 'pg-demo-hp-arjun', name: 'Arjun Kumar', phone: '9000000101', pg: HARBOUR_PG_ID, room: '203', bed: 'Bed 1', rent: 8000, optOut: false, vibe: { sleep: 0, wake: 0, tidiness: 1, noise: 0, guests: 0, kitchen: 0, schedule: 0, cooling: 1 } },
  { id: 'pg-demo-hp-karthik', name: 'Karthik S', phone: '9000000102', pg: HARBOUR_PG_ID, room: '203', bed: 'Bed 2', rent: 8000, optOut: false, vibe: { sleep: 2, wake: 2, tidiness: 1, noise: 1, guests: 0, kitchen: 0, schedule: 2, cooling: 1 } },
  { id: 'pg-demo-hp-rahul', name: 'Rahul Menon', phone: '9000000103', pg: HARBOUR_PG_ID, room: '203', bed: 'Bed 3', rent: 8000, optOut: false, vibe: { sleep: 2, wake: 2, tidiness: 2, noise: 2, guests: 1, kitchen: 1, schedule: 1, cooling: 0 } },
  { id: 'pg-demo-hp-vikram', name: 'Vikram Rao', phone: '9000000104', pg: HARBOUR_PG_ID, room: '203', bed: 'Bed 4', rent: 8000, optOut: false, vibe: { sleep: 0, wake: 0, tidiness: 0, noise: 0, guests: 0, kitchen: 0, schedule: 0, cooling: 1 } },
  { id: 'pg-demo-hp-sanjay', name: 'Sanjay P', phone: '9000000105', pg: HARBOUR_PG_ID, room: '201', bed: 'Bed 1', rent: 8800, optOut: false, vibe: { sleep: 1, wake: 1, tidiness: 1, noise: 1, guests: 1, kitchen: 0, schedule: 0, cooling: 1 } },
  { id: 'pg-demo-hp-imran', name: 'Imran Ali', phone: '9000000106', pg: HARBOUR_PG_ID, room: '202', bed: 'Bed 1', rent: 7600, optOut: true, vibe: { sleep: 1, wake: 1, tidiness: 1, noise: 0, guests: 0, kitchen: 0, schedule: 1, cooling: 1 } },
  { id: 'pg-demo-ns-priya', name: 'Priya Nair', phone: '9000000107', pg: NORTHSTAR_PG_ID, room: '402', bed: 'Bed 1', rent: 8200, optOut: false, vibe: { sleep: 0, wake: 0, tidiness: 0, noise: 0, guests: 0, kitchen: 2, schedule: 0, cooling: 1 } },
  { id: 'pg-demo-ns-dev', name: 'Dev Shah', phone: '9000000108', pg: NORTHSTAR_PG_ID, room: '401', bed: 'Bed 2', rent: 9200, optOut: false, vibe: { sleep: 2, wake: 2, tidiness: 2, noise: 2, guests: 2, kitchen: 1, schedule: 2, cooling: 0 } }
] as const;

const bedKey = (propertyId: string, roomNumber: string, label: string) => `${propertyId}:${roomNumber}:${label}`;
const OCCUPIED_DEMO_BEDS = new Set<string>([
  bedKey(demoProperties[0]!.id, '101', 'Bed 1'),
  ...LIVELY_RESIDENTS.map((person) => bedKey(person.pg, person.room, person.bed))
]);
const demoBedStatus = (propertyId: string, roomNumber: string, label: string) =>
  OCCUPIED_DEMO_BEDS.has(bedKey(propertyId, roomNumber, label)) ? 'OCCUPIED' : 'AVAILABLE';

const SAMPLE_LEADS = [
  {
    id: 'pg-demo-lead-velachery',
    ownerName: 'Suresh Krishnan',
    phone: '919840123401',
    email: 'suresh.k@example.com',
    propertyName: 'GreenLeaf Men & Co-Living PG',
    city: 'Chennai',
    locality: 'Velachery',
    address: '45, Bypass Road, Near Vijayanagar Bus Stand',
    propertyType: 'PG',
    genderPolicy: 'MEN',
    propertyCount: 2,
    totalRooms: 18,
    totalBeds: 42,
    startingRent: 7500,
    amenities: ['High-speed Wi-Fi', '3 meals daily', 'CCTV surveillance', 'Laundry', 'Two-wheeler parking'],
    notes: 'I have two buildings in Velachery and want your team to take photos and list both with zero setup hassle.',
    status: 'NEW',
    internalNotes: null
  },
  {
    id: 'pg-demo-lead-porur',
    ownerName: 'Lakshmi Narayanan',
    phone: '919840123402',
    email: 'lakshmi.stay@example.com',
    propertyName: 'Sri Sai Executive Women Stay',
    city: 'Chennai',
    locality: 'Porur',
    address: '12, Mount Poonamallee High Road, near DLF IT Park',
    propertyType: 'HOSTEL',
    genderPolicy: 'WOMEN',
    propertyCount: 1,
    totalRooms: 14,
    totalBeds: 34,
    startingRent: 8200,
    amenities: ['Wi-Fi', 'Breakfast & dinner', 'Biometric access', 'Warden on site', 'RO drinking water'],
    notes: '12 beds currently empty near DLF Porur — looking for verified working women tenants.',
    status: 'CONTACTED',
    internalNotes: 'Spoke on phone; photo shoot scheduled for Thursday morning.'
  },
  {
    id: 'pg-demo-lead-tambaram',
    ownerName: 'Karthikeyan R',
    phone: '919840123403',
    email: null,
    propertyName: 'NestHub Tambaram Co-Living',
    city: 'Chennai',
    locality: 'Tambaram',
    address: '7, GST Road, Opposite MEPZ',
    propertyType: 'COLIVING',
    genderPolicy: 'ANY',
    propertyCount: 3,
    totalRooms: 26,
    totalBeds: 64,
    startingRent: 7000,
    amenities: ['High-speed Wi-Fi', 'Shared kitchen', 'Coworking lounge', 'Power backup', 'CCTV surveillance'],
    notes: 'Need help setting up room tariffs for Private, Twin, and 3-Sharing rooms.',
    status: 'IN_PROGRESS',
    internalNotes: 'Received Google Drive photo pack; ready to enter rooms & publish.'
  }
];

async function main() {
  // Optional demo owner for the demo PGs (DEMO_OWNER_PHONE + DEMO_OWNER_PASSWORD).
  // In local development, also seed a default demo owner & onboarding ops admin if unset.
  const ownerPhone = String(process.env.DEMO_OWNER_PHONE || (process.env.NODE_ENV !== 'production' ? '9800000001' : '')).replace(/\D/g, '');
  const ownerPass = process.env.DEMO_OWNER_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'Owner@1234' : '');
  const owner = ownerPhone && ownerPass
    ? await prisma.user.upsert({
      where: { phone: ownerPhone },
      update: { phoneVerifiedAt: new Date() },
      create: { phone: ownerPhone, name: 'Demo Owner', role: 'PG_OWNER', phoneVerifiedAt: new Date(), password: await bcrypt.hash(ownerPass, 10) },
      select: { id: true }
    })
    : null;

  const adminPhone = String(process.env.DEMO_ADMIN_PHONE || (process.env.NODE_ENV !== 'production' ? '9800000000' : '')).replace(/\D/g, '');
  const adminPass = process.env.DEMO_ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'Admin@1234' : '');
  const admin = adminPhone && adminPass
    ? await prisma.user.upsert({
      where: { phone: adminPhone },
      update: { role: 'PLATFORM_ADMIN' },
      create: {
        phone: adminPhone,
        email: 'ops@livingplus.in',
        name: 'Living Plus Ops',
        role: 'PLATFORM_ADMIN',
        phoneVerifiedAt: new Date(),
        password: await bcrypt.hash(adminPass, 10)
      },
      select: { id: true, phone: true }
    })
    : null;

  for (const item of demoProperties) {
    await prisma.pGProperty.upsert({
      where: { id: item.id },
      update: {
        slug: item.slug,
        name: item.name,
        propertyType: item.propertyType,
        tagline: item.tagline,
        description: item.description,
        address: item.address,
        locality: item.locality,
        landmark: item.landmark,
        pincode: item.pincode,
        latitude: item.latitude,
        longitude: item.longitude,
        contactPhone: item.contactPhone,
        genderPolicy: item.genderPolicy,
        featured: item.featured,
        onboardedByAdmin: true,
        amenities: item.amenities,
        highlights: item.highlights,
        foodDetails: item.foodDetails,
        nearbyPlaces: item.nearbyPlaces,
        houseRules: item.houseRules,
        photoUrls: item.photoUrls,
        status: 'ACTIVE'
      },
      create: {
        id: item.id,
        slug: item.slug,
        name: item.name,
        propertyType: item.propertyType,
        tagline: item.tagline,
        description: item.description,
        address: item.address,
        locality: item.locality,
        landmark: item.landmark,
        pincode: item.pincode,
        latitude: item.latitude,
        longitude: item.longitude,
        contactPhone: item.contactPhone,
        city: 'Chennai',
        genderPolicy: item.genderPolicy,
        featured: item.featured,
        onboardedByAdmin: true,
        amenities: item.amenities,
        highlights: item.highlights,
        foodDetails: item.foodDetails,
        nearbyPlaces: item.nearbyPlaces,
        houseRules: item.houseRules,
        photoUrls: item.photoUrls,
        status: 'ACTIVE'
      }
    });

    if (owner) {
      await prisma.pGPropertyAccess.upsert({
        where: { propertyId_userId: { propertyId: item.id, userId: owner.id } },
        update: { role: 'OWNER' },
        create: { propertyId: item.id, userId: owner.id, role: 'OWNER' }
      });
    }

    for (const roomData of item.rooms) {
      const deposit = roomData.deposit ?? roomData.rent;
      const room = await prisma.pGRoom.upsert({
        where: { propertyId_roomNumber: { propertyId: item.id, roomNumber: roomData.number } },
        update: {
          block: roomData.block ?? null,
          floor: roomData.floor ?? Number(roomData.number[0]) ?? 1,
          roomType: roomData.roomType,
          monthlyRent: roomData.rent,
          depositAmount: deposit,
          maintenanceFee: roomData.maintenanceFee ?? 0,
          utilitiesSurcharge: roomData.utilitiesSurcharge ?? 0,
          hasAc: roomData.hasAc,
          foodIncluded: roomData.foodIncluded,
          foodCharge: roomData.foodCharge,
          description: roomData.description,
          amenities: roomData.amenities,
          photoUrls: roomData.photoUrls,
          status: 'ACTIVE'
        },
        create: {
          propertyId: item.id,
          roomNumber: roomData.number,
          block: roomData.block ?? null,
          floor: roomData.floor ?? Number(roomData.number[0]) ?? 1,
          roomType: roomData.roomType,
          monthlyRent: roomData.rent,
          depositAmount: deposit,
          maintenanceFee: roomData.maintenanceFee ?? 0,
          utilitiesSurcharge: roomData.utilitiesSurcharge ?? 0,
          hasAc: roomData.hasAc,
          foodIncluded: roomData.foodIncluded,
          foodCharge: roomData.foodCharge,
          description: roomData.description,
          amenities: roomData.amenities,
          photoUrls: roomData.photoUrls
        }
      });

      for (const label of roomData.beds) {
        const status = demoBedStatus(item.id, roomData.number, label);
        await prisma.pGBed.upsert({
          where: { roomId_label: { roomId: room.id, label } },
          update: { status },
          create: { roomId: room.id, label, status }
        });
      }
    }
  }

  for (const lead of SAMPLE_LEADS) {
    await prisma.ownerLead.upsert({
      where: { id: lead.id },
      update: {},
      create: lead
    });
  }

  const occupiedRoom = await prisma.pGRoom.findUnique({
    where: { propertyId_roomNumber: { propertyId: demoProperties[0]!.id, roomNumber: '101' } }
  });
  const requestRoom = await prisma.pGRoom.findUnique({
    where: { propertyId_roomNumber: { propertyId: demoProperties[0]!.id, roomNumber: '102' } }
  });
  if (!occupiedRoom || !requestRoom) throw new Error('PG demo rooms were not created');

  const occupiedBed = await prisma.pGBed.findUnique({
    where: { roomId_label: { roomId: occupiedRoom.id, label: 'Bed 1' } }
  });
  const requestBed = await prisma.pGBed.findUnique({
    where: { roomId_label: { roomId: requestRoom.id, label: 'Bed 1' } }
  });
  if (!occupiedBed || !requestBed) throw new Error('PG demo beds were not created');

  const booking = await prisma.pGBooking.upsert({
    where: { id: 'pg-demo-booking-approved' },
    update: { bookingRef: 'PG-DEMO-APPROVED', status: 'APPROVED' },
    create: {
      id: 'pg-demo-booking-approved',
      bookingRef: 'PG-DEMO-APPROVED',
      propertyId: demoProperties[0]!.id,
      bedId: occupiedBed.id,
      residentName: 'Ananya Rao',
      phone: '9000000001',
      moveInDate: new Date('2026-10-01T00:00:00.000Z'),
      status: 'APPROVED'
    }
  });
  const tenant = await prisma.pGTenant.upsert({
    where: { id: 'pg-demo-tenant-ananya' },
    update: { bookingId: booking.id, status: 'ACTIVE', vibeAnswers: DEMO_VIBE, depositAmount: 9800, depositReceived: 9800 },
    create: {
      id: 'pg-demo-tenant-ananya',
      propertyId: demoProperties[0]!.id,
      bedId: occupiedBed.id,
      bookingId: booking.id,
      vibeAnswers: DEMO_VIBE,
      name: 'Ananya Rao',
      phone: '9000000001',
      moveInDate: new Date('2026-10-01T00:00:00.000Z'),
      monthlyRent: 9800,
      depositAmount: 9800,
      depositReceived: 9800,
      status: 'ACTIVE'
    }
  });

  await prisma.pGRentEntry.upsert({
    where: { tenantId_period_entryType: { tenantId: tenant.id, period: '2026-10', entryType: 'RENT' } },
    update: { amount: 9800, status: 'DUE' },
    create: {
      tenantId: tenant.id,
      period: '2026-10',
      entryType: 'RENT',
      amount: 9800,
      dueDate: new Date('2026-10-05T00:00:00.000Z'),
      status: 'DUE'
    }
  });

  await prisma.pGBooking.upsert({
    where: { id: 'pg-demo-booking-pending' },
    update: { bookingRef: 'PG-DEMO-PENDING', status: 'PENDING' },
    create: {
      id: 'pg-demo-booking-pending',
      bookingRef: 'PG-DEMO-PENDING',
      propertyId: demoProperties[0]!.id,
      bedId: requestBed.id,
      residentName: 'Meera Iyer',
      phone: '9000000002',
      moveInDate: new Date('2026-11-15T00:00:00.000Z'),
      status: 'PENDING'
    }
  });
  await prisma.pGBed.update({ where: { id: requestBed.id }, data: { status: 'RESERVED' } });

  await prisma.pGMaintenanceTicket.upsert({
    where: { id: 'pg-demo-ticket-leak' },
    update: { status: 'OPEN' },
    create: {
      id: 'pg-demo-ticket-leak',
      propertyId: demoProperties[0]!.id,
      bedId: occupiedBed.id,
      tenantId: tenant.id,
      title: 'Bathroom sink leak',
      description: 'Water is dripping beneath the sink; please inspect the pipe joint.',
      category: 'PLUMBING',
      priority: 'NORMAL',
      status: 'OPEN'
    }
  });

  await seedLivelyDemo(owner?.id ?? null);

  console.log(`Seeded ${demoProperties.length} PG demo properties and ${SAMPLE_LEADS.length} sample owner leads${owner ? ` (demo owner: ${ownerPhone})` : ''}${admin ? ` (ops admin: ${admin.phone})` : ''}.`);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

async function seedLivelyDemo(ownerId: string | null) {
  const harbour = HARBOUR_PG_ID;
  const northstar = NORTHSTAR_PG_ID;
  await prisma.pGProperty.update({
    where: { id: harbour },
    data: { serviceSettings: { mealOrders: { enabled: true, prices: { BREAKFAST: 50, LUNCH: 90, DINNER: 80 } }, housekeeping: { enabled: true, price: 150 }, vibeCheck: true, kycAi: true } }
  });
  const room203 = await prisma.pGRoom.upsert({
    where: { propertyId_roomNumber: { propertyId: harbour, roomNumber: '203' } },
    update: { monthlyRent: 8000, depositAmount: 8000, foodIncluded: true, foodCharge: 1500, status: 'ACTIVE' },
    create: {
      propertyId: harbour,
      roomNumber: '203',
      block: 'Main',
      floor: 2,
      roomType: 'SHARED',
      monthlyRent: 8000,
      depositAmount: 8000,
      foodIncluded: true,
      foodCharge: 1500,
      description: '4-sharing tech dorm with individual lockers and high-speed Wi-Fi.',
      amenities: ['Attached Bath', 'Individual Locker', 'Study Desk'],
      photoUrls: ['/demo-pgs/room-triple.svg']
    }
  });
  for (const label of ['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4']) {
    const status = demoBedStatus(harbour, '203', label);
    await prisma.pGBed.upsert({ where: { roomId_label: { roomId: room203.id, label } }, update: { status }, create: { roomId: room203.id, label, status } });
  }
  const bedIn = async (propertyId: string, roomNumber: string, label: string) => {
    const room = await prisma.pGRoom.findUnique({ where: { propertyId_roomNumber: { propertyId, roomNumber } } });
    return room ? prisma.pGBed.findUnique({ where: { roomId_label: { roomId: room.id, label } } }) : null;
  };
  for (const person of LIVELY_RESIDENTS) {
    const bed = await bedIn(person.pg, person.room, person.bed);
    if (!bed) continue;
    const tenant = await prisma.pGTenant.upsert({
      where: { id: person.id },
      update: { bedId: bed.id, status: 'ACTIVE', vibeAnswers: person.vibe, foodOptOut: person.optOut, depositAmount: person.rent, depositReceived: person.rent },
      create: { id: person.id, propertyId: person.pg, bedId: bed.id, name: person.name, phone: person.phone, moveInDate: new Date(Date.now() - 40 * DAY_MS), monthlyRent: person.rent, status: 'ACTIVE', vibeAnswers: person.vibe, foodOptOut: person.optOut, depositAmount: person.rent, depositReceived: person.rent }
    });
    await prisma.pGRentEntry.upsert({
      where: { tenantId_period_entryType: { tenantId: tenant.id, period: '2026-11', entryType: 'RENT' } },
      update: {},
      create: { tenantId: tenant.id, period: '2026-11', entryType: 'RENT', amount: person.rent, paidAmount: person.rent, dueDate: new Date('2026-11-05T00:00:00.000Z'), status: 'PAID' }
    });
    if (person.pg === HARBOUR_PG_ID && !person.optOut) {
      await prisma.pGRentEntry.upsert({
        where: { tenantId_period_entryType: { tenantId: tenant.id, period: '2026-11', entryType: 'FOOD' } },
        update: { amount: 1500, paidAmount: 1500, status: 'PAID' },
        create: { tenantId: tenant.id, period: '2026-11', entryType: 'FOOD', amount: 1500, paidAmount: 1500, dueDate: new Date('2026-11-05T00:00:00.000Z'), status: 'PAID' }
      });
    }
  }

  const meals: { id: string; propertyId: string; tenantId: string; type: string; forDate: Date; slot: string; quantity: number; unitPrice: number; status: string }[] = [];
  for (let offset = -28; offset <= 7; offset += 1) {
    const day = isoDay(offset);
    const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
    if (offset % 3 === 0) meals.push({ id: `pg-demo-meal-${day}-dinner`, propertyId: harbour, tenantId: 'pg-demo-hp-rahul', type: 'MEAL', forDate: new Date(`${day}T00:00:00.000Z`), slot: 'DINNER', quantity: 1, unitPrice: 80, status: offset < 0 ? 'DONE' : 'REQUESTED' });
    if (weekday === 6) meals.push({ id: `pg-demo-meal-${day}-lunch`, propertyId: harbour, tenantId: 'pg-demo-hp-sanjay', type: 'MEAL', forDate: new Date(`${day}T00:00:00.000Z`), slot: 'LUNCH', quantity: 2, unitPrice: 90, status: offset < 0 ? 'DONE' : 'REQUESTED' });
  }
  meals.push({ id: `pg-demo-clean-${isoDay(1)}`, propertyId: harbour, tenantId: 'pg-demo-hp-vikram', type: 'HOUSEKEEPING', forDate: new Date(`${isoDay(1)}T00:00:00.000Z`), slot: 'MORNING', quantity: 1, unitPrice: 150, status: 'REQUESTED' });
  await prisma.pGServiceOrder.createMany({ data: meals, skipDuplicates: true });

  const reported = new Date(Date.now() - 6 * DAY_MS);
  await prisma.pGMaintenanceTicket.upsert({
    where: { id: 'pg-demo-ticket-fan' },
    update: {},
    create: { id: 'pg-demo-ticket-fan', propertyId: harbour, tenantId: 'pg-demo-hp-karthik', title: 'Ceiling fan not working', description: 'The fan in room 203 stopped spinning.', category: 'ELECTRICAL', priority: 'HIGH', status: 'RESOLVED', createdAt: reported, updatedAt: new Date(reported.getTime() + 5 * 60 * 60 * 1000) }
  });

  const at = (daysAgo: number, hour: number) => new Date(new Date(isoDay(-daysAgo) + 'T00:00:00.000Z').getTime() + (hour - 5.5) * 60 * 60 * 1000);
  const palm = 'pg-demo-perungudi-women';
  const activity = [
    { id: 'pg-demo-log-01', propertyId: harbour, actorId: ownerId, action: 'TENANT_CHECKED_IN', entityType: 'PGTenant', entityId: 'pg-demo-hp-arjun', detail: 'Arjun Kumar · Room 203, Bed 1', createdAt: at(10, 10) },
    { id: 'pg-demo-log-02', propertyId: harbour, actorId: ownerId, action: 'RENT_PAYMENT_RECORDED', entityType: 'PGRentEntry', entityId: null, detail: '₹8,800 · Sanjay P · UPI', createdAt: at(9, 18) },
    { id: 'pg-demo-log-03', propertyId: harbour, actorId: null, action: 'TICKET_CREATED_VIA_AI', entityType: 'PGMaintenanceTicket', entityId: 'pg-demo-ticket-fan', detail: 'Ceiling fan not working · Room 203 (reported with a photo)', createdAt: at(6, 9) },
    { id: 'pg-demo-log-04', propertyId: harbour, actorId: ownerId, action: 'TICKET_ASSIGNED_VIA_AI', entityType: 'PGMaintenanceTicket', entityId: 'pg-demo-ticket-fan', detail: 'Assigned to the warden · confirmed by the owner', createdAt: at(6, 9.5) },
    { id: 'pg-demo-log-05', propertyId: palm, actorId: ownerId, action: 'NOTICE_POSTED_VIA_AI', entityType: 'PGProperty', entityId: palm, detail: 'Water off Sunday 10 am to 1 pm for tank cleaning · confirmed by the owner', createdAt: at(5, 20) },
    { id: 'pg-demo-log-06', propertyId: palm, actorId: ownerId, action: 'RENT_REMINDER_SENT', entityType: 'PGRentEntry', entityId: null, detail: 'October rent · 1 resident', createdAt: at(4, 10) },
    { id: 'pg-demo-log-07', propertyId: harbour, actorId: ownerId, action: 'EXPENSE_CREATED', entityType: 'PGExpense', entityId: null, detail: 'Electrician · ₹600', createdAt: at(4, 16) },
    { id: 'pg-demo-log-08', propertyId: harbour, actorId: null, action: 'MEAL_PREFERENCE_SET', entityType: 'PGTenant', entityId: 'pg-demo-hp-imran', detail: 'Opted out of the meal plan', createdAt: at(3, 21) },
    { id: 'pg-demo-log-09', propertyId: palm, actorId: null, action: 'BOOKING_CREATED_VIA_AI', entityType: 'PGBooking', entityId: 'pg-demo-booking-pending', detail: 'Meera Iyer · Room 102, Bed 1 · after VibeCheck', createdAt: at(2, 19) },
    { id: 'pg-demo-log-10', propertyId: harbour, actorId: ownerId, action: 'RENT_PAYMENT_RECORDED', entityType: 'PGRentEntry', entityId: null, detail: '₹8,000 · Vikram Rao · UPI', createdAt: at(1, 11) },
    { id: 'pg-demo-log-11', propertyId: northstar, actorId: ownerId, action: 'TENANT_CHECKED_IN', entityType: 'PGTenant', entityId: 'pg-demo-ns-priya', detail: 'Priya Nair · Room 402, Bed 1', createdAt: at(1, 17) }
  ];
  await prisma.pHAuditLog.createMany({ data: activity, skipDuplicates: true });
  for (const key of PLATFORM_CATALOG_KEYS) {
    await prisma.platformCatalog.upsert({
      where: { key },
      update: {},
      create: {
        key,
        description: PLATFORM_CATALOG_DESCRIPTIONS[key],
        data: INITIAL_PLATFORM_CATALOG_SEEDS[key] as any
      }
    });
  }
}

main()
  .catch((error) => {
    console.error('PG demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
