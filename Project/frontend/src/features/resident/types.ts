import type { KycAiCheck } from '../../components/KycAiSummary';

export type Stay = {
  id: string;
  name: string;
  status: string;
  monthlyRent: number;
  depositAmount: number;
  depositReceived: number;
  depositDeductions?: number;
  depositRefundAmount?: number | null;
  depositRefundStatus?: string;
  depositRefundReference?: string | null;
  noticeDate?: string | null;
  moveInDate: string;
  moveOutDate?: string | null;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  checkoutNote?: string | null;
  permanentAddress?: string | null;
  bloodGroup?: string | null;
  institutionOrEmployer?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  kycType?: string | null;
  kycDocumentUrl?: string | null;
  kycVerified?: boolean;
  foodOptOut?: boolean;
  kycAiCheck?: KycAiCheck | null;
  property: { id: string; name: string; address: string; locality: string; city: string; contactPhone?: string | null; upiId?: string | null };
  bed?: { label: string; room: { roomNumber: string; roomType: string; foodIncluded?: boolean; foodCharge?: number | null } } | null;
  rentEntries: { id: string; period: string; entryType: string; amount: number; paidAmount: number; status: string; method?: string | null; reference?: string | null; dueDate: string }[];
};

export type MaintenanceTicket = {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
};

export type ResidentNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type PaymentClaim = {
  id: string;
  tenantId: string;
  rentEntryId: string;
  amount: number;
  reference: string;
  status: string;
  responseNote?: string | null;
  createdAt: string;
  rentEntry: { id: string; entryType: string; period: string };
};

export type PgSite = {
  slug: string;
  name: string;
  locality: string | null;
  city: string | null;
};

export type ResidentTab = 'stays' | 'money' | 'food' | 'orders' | 'services' | 'maintenance' | 'roomchange' | 'notifications' | 'profile';

export const RESIDENT_TAB_SLUGS: Record<ResidentTab, string> = {
  stays: '',
  money: 'money',
  food: 'food',
  orders: 'orders',
  services: 'services',
  maintenance: 'maintenance',
  roomchange: 'room-change',
  notifications: 'notifications',
  profile: 'profile'
};

export const RESIDENT_TAB_BY_SLUG: Record<string, ResidentTab> = Object.fromEntries(
  Object.entries(RESIDENT_TAB_SLUGS)
    .filter(([, slug]) => slug)
    .map(([tab, slug]) => [slug, tab as ResidentTab])
);
