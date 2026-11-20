import type { FieldErrors, FieldValues } from 'react-hook-form';
import toast from 'react-hot-toast';
import type { KycAiCheck } from '../../components/KycAiSummary';

export type Activity = {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  detail?: string | null;
  actorName?: string | null;
  createdAt: string;
  propertyId: string;
};

export type Property = {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  address: string;
  locality: string;
  contactPhone?: string | null;
  upiId?: string | null;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  genderPolicy: string;
  status?: string;
  bookingLockMinutes?: number;
  rentDay?: number;
  rentDueDay?: number;
  amenities: string[];
  houseRules: string[];
  photoUrls: string[];
  rooms: {
    id: string;
    roomNumber: string;
    monthlyRent: number;
    depositAmount: number;
    maintenanceFee: number;
    utilitiesSurcharge: number;
    foodCharge: number;
    foodIncluded?: boolean;
    roomType: string;
    beds: { id: string; label: string; status: string; maintenanceNote?: string | null }[];
  }[];
};

export type Booking = {
  id: string;
  bookingRef: string;
  residentName: string;
  phone: string;
  moveInDate: string;
  status: string;
  rejectionReason?: string | null;
  property: { name: string; locality: string };
  bed: { label: string; room: { roomNumber: string } } | null;
  bedId: string | null;
  tenant?: { id: string; status: string } | null;
  vibe?: { score: number | null; compared: number; reasons: string[]; differences: string[] } | null;
};

export type Ticket = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  imageUrl?: string | null;
  assignedName?: string | null;
  property: { name: string };
  tenant?: { name: string } | null;
};

export type Tenant = {
  kycAiCheck?: KycAiCheck | null;
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: string;
  monthlyRent: number;
  depositAmount: number;
  depositReceived: number;
  kycVerified?: boolean;
  foodOptOut?: boolean;
  noticeDate?: string | null;
  depositDeductions?: number;
  depositRefundAmount?: number | null;
  depositRefundStatus?: string;
  depositRefundReference?: string | null;
  checkoutNote?: string | null;
  permanentAddress?: string | null;
  bloodGroup?: string | null;
  institutionOrEmployer?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  kycType?: string | null;
  kycDocumentUrl?: string | null;
  checkedInAt?: string | null;
  property: { id: string; name: string; locality: string };
  bed?: { label: string; room: { roomNumber: string } } | null;
};

export type RentEntry = {
  id: string;
  entryType: string;
  period: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
  method?: string | null;
  reference?: string | null;
  tenant: {
    id: string;
    name: string;
    phone: string;
    property: { id: string; name: string };
    bed?: { label: string; room: { roomNumber: string } } | null;
  };
};

export type PaymentClaim = {
  id: string;
  amount: number;
  reference: string;
  status: string;
  responseNote?: string | null;
  createdAt: string;
  tenant: { name: string; phone: string };
  rentEntry: { entryType: string; period: string; amount: number; paidAmount: number };
  property: { name: string };
};

export type Expense = {
  id: string;
  category: string;
  amount: number;
  spentOn: string;
  note?: string | null;
  property: { name: string };
};

export type ElecBill = {
  id: string;
  period: string;
  totalAmount: number;
  status: string;
  splitJson: string;
  property: { name: string };
};

export type Staff = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: string;
  property: { id: string; name: string };
};

export type WorkspaceView =
  | 'overview'
  | 'properties'
  | 'bookings'
  | 'roomchanges'
  | 'tenants'
  | 'activity'
  | 'rent'
  | 'payments'
  | 'expenses'
  | 'utilities'
  | 'maintenance'
  | 'reports'
  | 'staff'
  | 'services';

export const OWNER_ROUTE_SLUGS: Record<WorkspaceView, string> = {
  overview: '',
  properties: 'properties',
  bookings: 'bookings',
  roomchanges: 'room-changes',
  tenants: 'tenants',
  activity: 'pulse',
  rent: 'rent',
  payments: 'payments',
  expenses: 'expenses',
  utilities: 'utilities',
  maintenance: 'maintenance',
  reports: 'reports',
  staff: 'staff',
  services: 'services'
};

export const OWNER_VIEW_BY_SLUG: Record<string, WorkspaceView> = Object.fromEntries(
  Object.entries(OWNER_ROUTE_SLUGS)
    .filter(([, slug]) => slug)
    .map(([view, slug]) => [slug, view as WorkspaceView])
);

export type Summary = {
  properties: number;
  totalBeds: number;
  occupiedBeds: number;
  occupancyRate: number;
  pendingBookings: number;
  openTickets: number;
  rentOutstanding: number;
  canManageStaff: boolean;
  staffRoles?: string[];
};

export type RoomChangeBed = {
  bed_id: string;
  label: string;
  room_number: string | null;
  floor: number | null;
  room_type: string | null;
} | null;

export type RoomChangeRow = {
  request_id: string;
  request_type: string;
  status: string;
  property: string | null;
  requester: string | null;
  partner: string | null;
  from_bed: RoomChangeBed;
  to_bed: RoomChangeBed;
  reason: string | null;
  created_at: string;
};

export type OwnerReport = {
  period: string;
  properties: number;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
  activeTenants: number;
  newBookings: number;
  rentCharged: number;
  rentCollected: number;
  outstanding: number;
  entries: RentEntry[];
};

export interface Workspace {
  properties: Property[];
  bookings: Booking[];
  tickets: Ticket[];
  summary: Summary;
  tenants: Tenant[];
  activity: Activity[];
  roomChanges: RoomChangeRow[];
  rentEntries: RentEntry[];
  expenses: Expense[];
  expenseTotal: number;
  bills: ElecBill[];
  report: OwnerReport | null;
  staff: Staff[];
  paymentClaims: PaymentClaim[];
}

export const emptySummary: Summary = {
  properties: 0,
  totalBeds: 0,
  occupiedBeds: 0,
  occupancyRate: 0,
  pendingBookings: 0,
  openTickets: 0,
  rentOutstanding: 0,
  canManageStaff: false
};

export const EMPTY_WORKSPACE: Workspace = {
  properties: [],
  bookings: [],
  tickets: [],
  summary: emptySummary,
  tenants: [],
  activity: [],
  roomChanges: [],
  rentEntries: [],
  expenses: [],
  expenseTotal: 0,
  bills: [],
  report: null,
  staff: [],
  paymentClaims: []
};

/** Today / this month in the browser's timezone (toISOString() is UTC). */
export const localDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
export const localMonth = () => localDate().slice(0, 7);

/** Shows the first validation problem of a form that failed to submit. */
export const showFirstError = (errors: FieldErrors<FieldValues>) => {
  const first = Object.values(errors)[0];
  toast.error(typeof first?.message === 'string' ? first.message : 'Check the highlighted form');
};

export const ownerInputClass =
  'w-full rounded-[var(--radius-field)] border border-hairline bg-surface/60 px-3 py-2 text-xs text-ink outline-none focus:border-navy-900 focus:bg-canvas';
export const ownerLabelClass = 'mb-1 block text-xs font-semibold text-muted';
