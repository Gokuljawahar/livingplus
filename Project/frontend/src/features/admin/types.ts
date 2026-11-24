export interface OwnerLead {
  id: string;
  ownerName: string;
  phone: string;
  email?: string | null;
  propertyName: string;
  city: string;
  locality: string;
  address?: string | null;
  propertyType: string;
  genderPolicy: string;
  propertyCount: number;
  totalRooms?: number | null;
  totalBeds?: number | null;
  startingRent?: number | null;
  amenities: string[];
  notes?: string | null;
  status: string;
  internalNotes?: string | null;
  onboardedPropertyId?: string | null;
  onboardedOwnerId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverview {
  leadCounts: Record<string, number>;
  totalLeads: number;
  activeProperties: number;
  draftProperties: number;
  totalProperties: number;
  ownersCount: number;
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  recentLeads: OwnerLead[];
}

export interface AdminOwner {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  phoneVerified: boolean;
  propertyCount: number;
  createdAt: string;
}

export interface AdminProperty {
  id: string;
  slug?: string | null;
  name: string;
  propertyType: string;
  tagline?: string | null;
  description?: string | null;
  address: string;
  locality: string;
  city: string;
  landmark?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contactPhone?: string | null;
  upiId?: string | null;
  genderPolicy: string;
  amenities: string[];
  highlights: string[];
  foodDetails?: string | null;
  nearbyPlaces: string[];
  houseRules: string[];
  photoUrls: string[];
  status: string;
  featured: boolean;
  onboardedByAdmin: boolean;
  owner?: { id: string; name: string; phone?: string | null; email?: string | null; phoneVerified: boolean } | null;
  totalBeds: number;
  availableBeds: number;
  occupiedBeds: number;
  activeTenantsCount: number;
  pendingBookingsCount: number;
  rooms: {
    id: string;
    roomNumber: string;
    block?: string | null;
    floor?: number | null;
    roomType: string;
    monthlyRent: number;
    depositAmount: number;
    maintenanceFee: number;
    utilitiesSurcharge: number;
    hasAc: boolean;
    foodIncluded: boolean;
    foodCharge: number;
    description?: string | null;
    amenities: string[];
    photoUrls: string[];
    beds: { id: string; label: string; status: string }[];
  }[];
  createdAt: string;
}

export interface OnboardRoomDraft {
  roomNumber: string;
  block: string;
  floor: string;
  roomType: 'PRIVATE' | 'DOUBLE' | 'TRIPLE' | 'SHARED';
  monthlyRent: string;
  depositAmount: string;
  maintenanceFee: string;
  utilitiesSurcharge: string;
  hasAc: boolean;
  foodIncluded: boolean;
  foodCharge: string;
  numberOfBeds: string;
  description: string;
  amenities: string[];
  photoUrls: string[];
}
