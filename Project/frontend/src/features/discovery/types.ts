import { rupees } from '../../utils/money';

export interface PGPropertyRoom {
  id: string;
  roomNumber: string;
  block?: string | null;
  floor?: number | null;
  roomType?: string;
  hasAc?: boolean;
  foodIncluded?: boolean;
  foodCharge?: number | null;
  depositAmount?: number | null;
  maintenanceFee?: number | null;
  utilitiesSurcharge?: number | null;
  monthlyRent: number;
  description?: string | null;
  amenities?: string[];
  photoUrls?: string[];
  availableBeds: number;
  totalBeds?: number;
  occupiedBeds?: number;
  beds: { id: string; label: string }[];
}

export interface PGProperty {
  id: string;
  slug?: string | null;
  name: string;
  propertyType?: string;
  tagline?: string | null;
  description?: string | null;
  address: string;
  locality: string;
  landmark?: string | null;
  city: string;
  pincode?: string | null;
  genderPolicy: string;
  managerPhone?: string | null;
  hasContactPhone?: boolean;
  ownerName?: string | null;
  amenities: string[];
  highlights?: string[];
  foodDetails?: string | null;
  nearbyPlaces?: string[];
  houseRules: string[];
  photoUrls: string[];
  availableBeds: number;
  totalBeds?: number;
  featured?: boolean;
  onboardedByAdmin?: boolean;
  isOwnStay?: boolean;
  serviceSettings?: { vibeCheck?: boolean } | null;
  /** An owner proved their phone with a code. */
  ownerVerified?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  rooms: PGPropertyRoom[];
}

export interface ResidentStay {
  id: string;
  name: string;
  status: string;
  monthlyRent: number;
  property: { id: string; name: string; locality: string; city: string };
  bed?: { label: string; room: { roomNumber: string; roomType: string } } | null;
}

export const ROOM_TYPES = [
  { value: 'PRIVATE', label: 'Private room' },
  { value: 'DOUBLE', label: '2 sharing' },
  { value: 'TRIPLE', label: '3 sharing' },
  { value: 'SHARED', label: 'Shared dorm' }
];

export const ROOM_TYPE_LABELS: Record<string, string> = {
  PRIVATE: 'Private room',
  DOUBLE: '2 sharing',
  TRIPLE: '3 sharing',
  SHARED: 'Shared dorm'
};

export const PRICE_BANDS = [
  { label: 'Under ₹5,000', min: '', max: '5000' },
  { label: '₹5,000 – ₹8,000', min: '5000', max: '8000' },
  { label: '₹8,000 – ₹12,000', min: '8000', max: '12000' },
  { label: 'Above ₹12,000', min: '12000', max: '' }
];

export const SORTS = [
  { value: 'featured', label: 'Best match' },
  { value: 'price-asc', label: 'Lowest rent' },
  { value: 'price-desc', label: 'Highest rent' },
  { value: 'beds-desc', label: 'Most beds free' }
];

export const GENDER_LABELS: Record<string, string> = { MEN: 'Men', WOMEN: 'Women', ANY: 'Co-living' };

export function keywordMatch(property: PGProperty, text: string): boolean {
  const haystack = [
    property.name,
    property.tagline || '',
    property.locality,
    property.city,
    property.address,
    property.landmark || '',
    property.propertyType || '',
    ...(property.amenities || []),
    ...(property.highlights || [])
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(text);
}

export function availabilityText(beds: number): string {
  return beds <= 0 ? 'Fully occupied' : beds <= 3 ? `${beds} bed${beds === 1 ? '' : 's'} left` : `${beds} beds available`;
}

export function computePriceFacts(property: PGProperty, matchesRoom: (room: PGProperty['rooms'][number]) => boolean) {
  const open = property.rooms.filter(matchesRoom);
  const rooms = open.length ? open : property.rooms;
  const cheapest = rooms.reduce<PGProperty['rooms'][number] | null>(
    (low, room) => (!low || room.monthlyRent < low.monthlyRent ? room : low),
    null
  );
  const rents = rooms.map((room) => room.monthlyRent);
  return {
    from: cheapest?.monthlyRent ?? null,
    to: rents.length ? Math.max(...rents) : null,
    food: !cheapest
      ? null
      : (cheapest.foodCharge ?? 0) > 0
      ? `+ ${rupees(cheapest.foodCharge!)} food (optional)`
      : cheapest.foodIncluded
      ? 'Food included'
      : 'No food',
    deposit: cheapest && (cheapest.depositAmount ?? 0) > 0 ? `Deposit ${rupees(cheapest.depositAmount!)}` : 'Deposit not listed'
  };
}
