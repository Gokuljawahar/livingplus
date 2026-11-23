import { rupees } from '../../utils/money';

export interface PGProperty {
  id: string;
  name: string;
  description?: string | null;
  address: string;
  locality: string;
  city: string;
  genderPolicy: string;
  managerPhone?: string | null;
  amenities: string[];
  houseRules: string[];
  photoUrls: string[];
  availableBeds: number;
  serviceSettings?: { vibeCheck?: boolean } | null;
  /** An owner proved their phone with a code. */
  ownerVerified?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  rooms: {
    id: string;
    roomNumber: string;
    roomType?: string;
    hasAc?: boolean;
    foodIncluded?: boolean;
    foodCharge?: number | null;
    depositAmount?: number | null;
    monthlyRent: number;
    availableBeds: number;
    beds: { id: string; label: string }[];
  }[];
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
  return `${property.name} ${property.locality} ${property.city} ${property.address}`.toLowerCase().includes(text);
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
