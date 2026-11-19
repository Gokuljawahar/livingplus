import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch, type FieldErrors, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  electricityBillSchema, expenseSchema, ownerPropertySchema, ownerRoomSchema, ownerTicketSchema, rentEntrySchema, staffSchema,
  type ElectricityBillForm, type ExpenseForm, type OwnerPropertyForm, type OwnerRoomForm, type OwnerTicketForm, type RentEntryForm, type StaffForm
} from '../validation/forms';
import { ArrowLeftRight, BedDouble, Building2, Check, ClipboardList, Clock, Download, FileText, IndianRupee, Loader2, Plus, Users, Wallet, Wrench, X, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import ResidentSiteLink from '../components/ResidentSiteLink';
import { rupees, shortDate } from '../utils/money';
import { SecureImage } from '../components/SecureImage';
import { MapPicker } from '../components/MapPicker';
import { downloadXlsx } from '../utils/xlsx';
import { useSidebar } from '../context/sidebar';
import { apiErrorMessage } from '../utils/api-error';

type Activity = { id: string; action: string; entityType?: string | null; entityId?: string | null; detail?: string | null; actorName?: string | null; createdAt: string; propertyId: string };
type Property = { id: string; slug?: string | null; name: string; description?: string | null; address: string; locality: string; contactPhone?: string | null; upiId?: string | null; city: string; latitude?: number | null; longitude?: number | null; genderPolicy: string; status?: string; bookingLockMinutes?: number; rentDay?: number; rentDueDay?: number; amenities: string[]; houseRules: string[]; photoUrls: string[]; rooms: { id: string; roomNumber: string; monthlyRent: number; depositAmount: number; maintenanceFee: number; utilitiesSurcharge: number; foodCharge: number; roomType: string; beds: { id: string; label: string; status: string; maintenanceNote?: string | null }[] }[] };
type Booking = { id: string; bookingRef: string; residentName: string; phone: string; moveInDate: string; status: string; rejectionReason?: string | null; property: { name: string; locality: string }; bed: { label: string; room: { roomNumber: string } } | null; bedId: string | null; tenant?: { id: string; status: string } | null };
type Ticket = { id: string; title: string; description: string; category: string; priority: string; status: string; imageUrl?: string | null; assignedName?: string | null; property: { name: string }; tenant?: { name: string } | null };
type Tenant = { id: string; name: string; phone: string; email?: string | null; status: string; monthlyRent: number; depositAmount: number; depositReceived: number; kycVerified?: boolean; foodOptOut?: boolean; noticeDate?: string | null; depositDeductions?: number; depositRefundAmount?: number | null; depositRefundStatus?: string; depositRefundReference?: string | null; checkoutNote?: string | null; permanentAddress?: string | null; bloodGroup?: string | null; institutionOrEmployer?: string | null; emergencyName?: string | null; emergencyPhone?: string | null; kycType?: string | null; kycDocumentUrl?: string | null; checkedInAt?: string | null; property: { id: string; name: string; locality: string }; bed?: { label: string; room: { roomNumber: string } } | null };
type RentEntry = { id: string; entryType: string; period: string; amount: number; paidAmount: number; dueDate: string; status: string; method?: string | null; reference?: string | null; tenant: { id: string; name: string; phone: string; property: { id: string; name: string }; bed?: { label: string; room: { roomNumber: string } } | null } };
type PaymentClaim = { id: string; amount: number; reference: string; status: string; responseNote?: string | null; createdAt: string; tenant: { name: string; phone: string }; rentEntry: { entryType: string; period: string; amount: number; paidAmount: number }; property: { name: string } };
type Expense = { id: string; category: string; amount: number; spentOn: string; note?: string | null; property: { name: string } };
type ElecBill = { id: string; period: string; totalAmount: number; status: string; splitJson: string; property: { name: string } };
type Staff = { id: string; name: string; phone: string; email?: string | null; role: string; property: { id: string; name: string } };
type WorkspaceView = 'overview' | 'properties' | 'bookings' | 'roomchanges' | 'tenants' | 'activity' | 'rent' | 'payments' | 'expenses' | 'utilities' | 'maintenance' | 'reports' | 'staff';
type Summary = { properties: number; totalBeds: number; occupiedBeds: number; occupancyRate: number; pendingBookings: number; openTickets: number; rentOutstanding: number; canManageStaff: boolean };
type RoomChangeBed = { bed_id: string; label: string; room_number: string | null; floor: number | null; room_type: string | null } | null;
type RoomChangeRow = { request_id: string; request_type: string; status: string; property: string | null; requester: string | null; partner: string | null; from_bed: RoomChangeBed; to_bed: RoomChangeBed; reason: string | null; created_at: string };
type OwnerReport = { period: string; properties: number; totalBeds: number; occupiedBeds: number; availableBeds: number; occupancyRate: number; activeTenants: number; newBookings: number; rentCharged: number; rentCollected: number; outstanding: number; entries: RentEntry[] };

const emptySummary: Summary = { properties: 0, totalBeds: 0, occupiedBeds: 0, occupancyRate: 0, pendingBookings: 0, openTickets: 0, rentOutstanding: 0, canManageStaff: false };

/** Today / this month in the browser's timezone (toISOString() is UTC). */
const localDate = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };
const localMonth = () => localDate().slice(0, 7);

const EMPTY_PROPERTY_FORM: OwnerPropertyForm = { name: '', description: '', address: '', locality: '', contactPhone: '', upiId: '', city: 'Chennai', latitude: '', longitude: '', genderPolicy: 'ANY', amenities: '', houseRules: '', status: 'ACTIVE', bookingLockMinutes: '120', rentDay: '1', rentDueDay: '5' };
const EMPTY_ROOM_FORM: OwnerRoomForm = { roomNumber: '', block: '', floor: '', roomType: 'SHARED', monthlyRent: '', depositAmount: '', maintenanceFee: '', utilitiesSurcharge: '', foodCharge: '', numberOfBeds: '1', hasAc: false, foodIncluded: false };
const EMPTY_STAFF_FORM: StaffForm = { name: '', phone: '', email: '', password: '', propertyId: '' };
const EMPTY_TICKET_FORM: OwnerTicketForm = { title: '', description: '', category: 'PLUMBING', priority: 'NORMAL', assignedTo: '' };
const emptyRentForm = (): RentEntryForm => ({ tenantId: '', period: localMonth(), amount: '', dueDate: '' });
const emptyExpenseForm = (): ExpenseForm => ({ category: 'FOOD', amount: '', spentOn: localDate(), note: '' });
const emptyBillForm = (): ElectricityBillForm => ({ period: localMonth(), totalAmount: '' });

/** Shows the first validation problem of a form that failed to submit. */
const showFirstError = (errors: FieldErrors<FieldValues>) => {
  const first = Object.values(errors)[0];
  toast.error(typeof first?.message === 'string' ? first.message : 'Check the highlighted form');
};

interface Workspace {
  properties: Property[]; bookings: Booking[]; tickets: Ticket[]; summary: Summary; tenants: Tenant[];
  activity: Activity[]; roomChanges: RoomChangeRow[]; rentEntries: RentEntry[]; expenses: Expense[];
  expenseTotal: number; bills: ElecBill[]; report: OwnerReport | null; staff: Staff[]; paymentClaims: PaymentClaim[];
}

const EMPTY_WORKSPACE: Workspace = {
  properties: [], bookings: [], tickets: [], summary: emptySummary, tenants: [], activity: [], roomChanges: [],
  rentEntries: [], expenses: [], expenseTotal: 0, bills: [], report: null, staff: [], paymentClaims: []
};

async function fetchWorkspace(): Promise<Workspace> {
  const [propertyResponse, bookingResponse, ticketResponse, summaryResponse, tenantResponse] = await Promise.all([
    api.get('/pg/owner/properties'),
    api.get('/pg/owner/bookings'),
    api.get('/pg/owner/maintenance'),
    api.get('/pg/owner/summary'),
    api.get('/pg/owner/tenants')
  ]);
  // Activity and room changes are optional extras: failures leave them empty.
  const activity = await api.get('/pg/owner/activity').then((r) => r.data as Activity[]).catch(() => []);
  const roomChanges = await api.get('/pg/owner/room-changes').then((r) => (r.data || []) as RoomChangeRow[]).catch(() => []);
  const base = {
    ...EMPTY_WORKSPACE,
    properties: propertyResponse.data, bookings: bookingResponse.data, tickets: ticketResponse.data,
    summary: summaryResponse.data, tenants: tenantResponse.data, activity, roomChanges
  };
  if (!summaryResponse.data.canManageStaff) return base;
  const [rentResponse, expenseResponse, billResponse, reportResponse, staffResponse, claimResponse] = await Promise.all([
    api.get('/pg/owner/rent'),
    api.get('/pg/owner/expenses'),
    api.get('/pg/owner/electricity/bills'),
    api.get('/pg/owner/reports'),
    api.get('/pg/owner/staff'),
    api.get('/pg/owner/payment-claims')
  ]);
  return {
    ...base,
    rentEntries: rentResponse.data, expenses: expenseResponse.data.entries || [], expenseTotal: expenseResponse.data.total || 0,
    bills: billResponse.data || [], report: reportResponse.data, staff: staffResponse.data, paymentClaims: claimResponse.data || []
  };
}

export default function PGManagement() {
  const [view, setView] = useState<WorkspaceView>('overview');
  const [rejectingClaimId, setRejectingClaimId] = useState('');
  const [claimRejectionReason, setClaimRejectionReason] = useState('');
  const [reminding, setReminding] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [savingTenant, setSaving] = useState(false);
  const [tenantFilter, setTenantFilter] = useState('');
  const [reassignBed, setReassignBed] = useState<Record<string, string>>({});
  const [propertyPhotoFiles, setPropertyPhotoFiles] = useState<File[]>([]);
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([]);
  const [rejectingBookingId, setRejectingBookingId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [decliningChangeId, setDecliningChangeId] = useState('');
  const [changeDecisionNote, setChangeDecisionNote] = useState('');
  const [checkoutTenantId, setCheckoutTenantId] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [ticketImage, setTicketImage] = useState<File | null>(null);

  const propertyFormApi = useForm<OwnerPropertyForm>({ resolver: zodResolver(ownerPropertySchema), defaultValues: EMPTY_PROPERTY_FORM });
  const roomFormApi = useForm<OwnerRoomForm>({ resolver: zodResolver(ownerRoomSchema), defaultValues: EMPTY_ROOM_FORM });
  const rentFormApi = useForm<RentEntryForm>({ resolver: zodResolver(rentEntrySchema), defaultValues: emptyRentForm() });
  const staffFormApi = useForm<StaffForm>({ resolver: zodResolver(staffSchema), defaultValues: EMPTY_STAFF_FORM });
  const expenseFormApi = useForm<ExpenseForm>({ resolver: zodResolver(expenseSchema), defaultValues: emptyExpenseForm() });
  const billFormApi = useForm<ElectricityBillForm>({ resolver: zodResolver(electricityBillSchema), defaultValues: emptyBillForm() });
  const ticketFormApi = useForm<OwnerTicketForm>({ resolver: zodResolver(ownerTicketSchema), defaultValues: EMPTY_TICKET_FORM });
  const saving = savingTenant || [propertyFormApi, roomFormApi, rentFormApi, staffFormApi, expenseFormApi, billFormApi, ticketFormApi]
    .some((form) => form.formState.isSubmitting);
  // The map picker shows (and fills) the address and coordinates.
  const [mapAddress, mapLatitude, mapLongitude] = useWatch({ control: propertyFormApi.control, name: ['address', 'latitude', 'longitude'] });

  // Workspace data: one query (same requests as before; owner-only data
  // only for owners). refresh() re-fetches it after any change.
  const queryClient = useQueryClient();
  const { data: workspace, isPending: loading } = useQuery({
    queryKey: ['owner', 'workspace'],
    queryFn: fetchWorkspace,
    meta: { errorMessage: 'Could not load PG operations' }
  });
  const {
    properties, bookings, tickets, summary, tenants, activity, roomChanges,
    rentEntries, expenses, expenseTotal, bills, report, staff, paymentClaims
  } = workspace ?? EMPTY_WORKSPACE;
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['owner', 'workspace'] }); };
  // Default the property pickers to the first property once it is known.
  if (!selectedPropertyId && properties[0]) setSelectedPropertyId(properties[0].id);

  const saveProperty = propertyFormApi.handleSubmit(async (propertyForm) => {
    const creatingProperty = !editingPropertyId;
    try {
      const newPhotoUrls = await Promise.all(propertyPhotoFiles.map(async (file) => {
        const upload = new FormData();
        upload.append('image', file);
        const result = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
        return result.data.fileKey as string;
      }));
      const payload = {
        ...propertyForm,
        amenities: propertyForm.amenities.split(',').map((item) => item.trim()).filter(Boolean),
        houseRules: propertyForm.houseRules.split('\n').map((item) => item.trim()).filter(Boolean),
        photoUrls: [...existingPhotoUrls, ...newPhotoUrls]
      };
      const response = editingPropertyId
        ? await api.patch(`/pg/owner/properties/${editingPropertyId}`, payload)
        : await api.post('/pg/owner/properties', payload);
      if (creatingProperty && !response.data.slug) throw new Error('The property was created without a PG address');
      setSelectedPropertyId(response.data.id);
      setEditingPropertyId(null);
      propertyFormApi.reset(EMPTY_PROPERTY_FORM);
      setPropertyPhotoFiles([]);
      setExistingPhotoUrls([]);
      toast.success(editingPropertyId ? 'Property updated' : 'Property added');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not add property'));
    }
  }, showFirstError);

  const selectProperty = (property: Property) => {
    setSelectedPropertyId(property.id);
    setEditingPropertyId(property.id);
    propertyFormApi.reset({
      name: property.name,
      description: property.description || '',
      address: property.address,
      locality: property.locality,
      contactPhone: property.contactPhone || '',
      upiId: property.upiId || '',
      city: property.city,
      latitude: property.latitude == null ? '' : String(property.latitude),
      longitude: property.longitude == null ? '' : String(property.longitude),
      genderPolicy: property.genderPolicy,
      amenities: Array.isArray(property.amenities) ? property.amenities.join(', ') : '',
      houseRules: Array.isArray(property.houseRules) ? property.houseRules.join('\n') : '',
      status: property.status || 'ACTIVE',
      bookingLockMinutes: String(property.bookingLockMinutes ?? 120),
      rentDay: String(property.rentDay ?? 1),
      rentDueDay: String(property.rentDueDay ?? 5)
    });
    setExistingPhotoUrls(Array.isArray(property.photoUrls) ? property.photoUrls : []);
    setPropertyPhotoFiles([]);
  };

  const startNewProperty = () => {
    setEditingPropertyId(null);
    propertyFormApi.reset(EMPTY_PROPERTY_FORM);
    setExistingPhotoUrls([]);
    setPropertyPhotoFiles([]);
  };

  const removeProperty = async (propertyId: string) => {
    if (!window.confirm('Delete this property and its archived records? Active tenants or bookings must be resolved first.')) return;
    try {
      await api.delete(`/pg/owner/properties/${propertyId}`);
      if (selectedPropertyId === propertyId) {
        setSelectedPropertyId('');
        startNewProperty();
      }
      toast.success('Property deleted');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not delete property'));
    }
  };

  const togglePublish = async (property: Property) => {
    try {
      await api.patch(`/pg/owner/properties/${property.id}`, { status: property.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE' });
      toast.success(property.status === 'INACTIVE' ? 'Property published' : 'Property unpublished');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update property'));
    }
  };

  const createRoom = roomFormApi.handleSubmit(async (roomForm) => {
    if (!selectedPropertyId) return;
    try {
      await api.post(`/pg/owner/properties/${selectedPropertyId}/rooms`, { ...roomForm, floor: roomForm.floor || null });
      roomFormApi.reset(EMPTY_ROOM_FORM);
      toast.success('Room and beds added');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not add room'));
    }
  }, showFirstError);

  const updateBooking = async (bookingId: string, status: 'APPROVED' | 'REJECTED', newBedId?: string) => {
    if (status === 'REJECTED' && !rejectionReason.trim()) { toast.error('Add a reason for declining'); return; }
    try {
      await api.patch(`/pg/owner/bookings/${bookingId}/status`, { status, ...(status === 'REJECTED' ? { rejectionReason: rejectionReason.trim() } : {}), ...(status === 'APPROVED' && newBedId ? { newBedId } : {}) });
      toast.success(status === 'APPROVED' ? 'Booking approved; tenant and rent entry created' : 'Booking declined');
      setRejectingBookingId('');
      setRejectionReason('');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update booking'));
    }
  };

  const updateBedStatus = async (bedId: string, status: 'AVAILABLE' | 'MAINTENANCE') => {
    try {
      await api.patch(`/pg/owner/beds/${bedId}/status`, { status });
      toast.success(status === 'MAINTENANCE' ? 'Bed marked for maintenance' : 'Bed is available again');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update bed status'));
    }
  };

  const updateTenant = async (event: React.FormEvent<HTMLFormElement>, tenantId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const document = form.get('kycDocument') as File | null;
    setSaving(true);
    try {
      let kycDocumentUrl: string | undefined;
      if (document?.size) {
        const upload = new FormData();
        upload.append('image', document);
        const result = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
        kycDocumentUrl = result.data.fileKey;
      }
      await api.patch(`/pg/owner/tenants/${tenantId}`, {
        permanentAddress: form.get('permanentAddress'),
        bloodGroup: form.get('bloodGroup'),
        institutionOrEmployer: form.get('institutionOrEmployer'),
        emergencyName: form.get('emergencyName'),
        emergencyPhone: form.get('emergencyPhone'),
        kycType: form.get('kycType'),
        ...(kycDocumentUrl ? { kycDocumentUrl } : {})
      });
      toast.success('Tenant profile updated');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update tenant profile'));
    } finally {
      setSaving(false);
    }
  };

  const viewKycDocument = async (fileKey: string) => {
    const preview = window.open('about:blank', '_blank');
    try {
      const response = await api.get(`/view-image/${encodeURIComponent(fileKey)}`);
      if (preview) preview.location.href = response.data.viewUrl;
      else toast.error('Allow pop-ups to open the KYC document');
    } catch (error) {
      preview?.close();
      toast.error(apiErrorMessage(error, 'Could not open KYC document'));
    }
  };

  const verifyKyc = async (tenantId: string, verified: boolean) => {
    try {
      await api.patch(`/pg/owner/tenants/${tenantId}`, { kycVerified: verified });
      toast.success(verified ? 'KYC marked verified' : 'KYC verification revoked');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update KYC status'));
    }
  };

  const updateTenantStay = async (tenantId: string, action: 'check-in' | 'check-out', checkout?: { depositDeductions: number; checkoutNote: string }) => {
    try {
      await api.post(`/pg/owner/tenants/${tenantId}/${action}`, checkout || {});
      toast.success(action === 'check-in' ? 'Tenant checked in' : 'Tenant checked out; bed released');
      setCheckoutTenantId('');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, `Could not ${action} tenant`));
    }
  };

  const markDepositRefunded = async (tenantId: string) => {
    try {
      await api.patch(`/pg/owner/tenants/${tenantId}/deposit-refund`, { reference: refundReference.trim() });
      toast.success('Deposit refund recorded');
      setRefundReference('');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not record deposit refund'));
    }
  };

  const addRentEntry = rentFormApi.handleSubmit(async (rentForm) => {
    try {
      await api.post('/pg/owner/rent', rentForm);
      rentFormApi.reset(emptyRentForm());
      toast.success('Ledger entry created');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create ledger entry'));
    }
  }, showFirstError);

  const addStaff = staffFormApi.handleSubmit(async (staffForm) => {
    try {
      await api.post('/pg/owner/staff', staffForm);
      staffFormApi.reset(EMPTY_STAFF_FORM);
      toast.success('Warden account created');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create staff account'));
    }
  }, showFirstError);

  const removeStaff = async (member: Staff) => {
    try {
      await api.delete(`/pg/owner/staff/${member.property.id}/${member.id}`);
      toast.success('Staff access removed');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not remove staff access'));
    }
  };

  const recordPayment = async (event: React.FormEvent<HTMLFormElement>, entryId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.patch(`/pg/owner/rent/${entryId}/payment`, {
        amount: form.get('amount'),
        method: form.get('method'),
        reference: form.get('reference')
      });
      toast.success('Payment recorded');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not record payment'));
    }
  };

  const sendReminders = async () => {
    setReminding(true);
    try {
      const response = await api.post('/pg/owner/rent/reminders', {});
      toast.success(`Reminders sent to ${response.data.sent} of ${response.data.total} open dues`);
      refresh();
    } catch (error: unknown) {
      const failure = (error as { response?: { data?: { message?: string } } })?.response;
      toast.error(failure?.data?.message || 'Could not send reminders');
    } finally {
      setReminding(false);
    }
  };

  const submitExpense = expenseFormApi.handleSubmit(async (expenseForm) => {
    try {
      await api.post('/pg/owner/expenses', { ...expenseForm, propertyId: selectedPropertyId });
      toast.success('Expense recorded');
      expenseFormApi.reset(emptyExpenseForm());
      refresh();
    } catch (error: unknown) {
      const failure = (error as { response?: { data?: { message?: string } } })?.response;
      toast.error(failure?.data?.message || 'Could not record expense');
    }
  }, showFirstError);

  const removeExpense = async (expenseId: string) => {
    if (!window.confirm('Remove this expense from the ledger?')) return;
    try {
      await api.delete(`/pg/owner/expenses/${expenseId}`);
      toast.success('Expense removed');
      refresh();
    } catch (error: unknown) {
      const failure = (error as { response?: { data?: { message?: string } } })?.response;
      toast.error(failure?.data?.message || 'Could not remove expense');
    }
  };

  const proposeBill = billFormApi.handleSubmit(async (billForm) => {
    try {
      await api.post('/pg/owner/electricity/bills', { ...billForm, propertyId: selectedPropertyId });
      toast.success('Bill split proposed — review and approve below');
      billFormApi.reset(emptyBillForm());
      refresh();
    } catch (error: unknown) {
      const failure = (error as { response?: { data?: { message?: string } } })?.response;
      toast.error(failure?.data?.message || 'Could not propose bill');
    }
  }, showFirstError);

  const approveBill = async (billId: string) => {
    if (!window.confirm('Approve this split and bill every tenant for this period?')) return;
    try {
      const response = await api.post(`/pg/owner/electricity/bills/${billId}/approve`, {});
      toast.success(`Approved — ${response.data.entries} tenant bills created`);
      refresh();
    } catch (error: unknown) {
      const failure = (error as { response?: { data?: { message?: string } } })?.response;
      toast.error(failure?.data?.message || 'Could not approve bill');
    }
  };

  const setFoodOptOut = async (tenantId: string, optOut: boolean) => {
    try {
      await api.patch(`/pg/owner/tenants/${tenantId}`, { foodOptOut: optOut });
      toast.success(optOut ? 'Tenant opted out of food' : 'Tenant opted back in to food');
      refresh();
    } catch (error: unknown) {
      const failure = (error as { response?: { data?: { message?: string } } })?.response;
      toast.error(failure?.data?.message || 'Could not update food preference');
    }
  };

  const exportReport = () => {
    if (!report) return;
    const rows = [
      ['Period', 'Property', 'Resident', 'Entry Type', 'Amount', 'Paid', 'Status', 'Due Date'],
      ...report.entries.map((entry) => [entry.period, entry.tenant.property.name, entry.tenant.name, entry.entryType, entry.amount, entry.paidAmount, entry.status, new Date(entry.dueDate).toLocaleDateString()])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pg-report-${report.period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportReportExcel = () => {
    if (!report) return;
    downloadXlsx(`pg-report-${report.period}.xlsx`, 'PG Report', [
      ['PG Report', report.period],
      ['Properties', report.properties], ['Total beds', report.totalBeds], ['Occupied beds', report.occupiedBeds],
      ['Available beds', report.availableBeds], ['Occupancy %', report.occupancyRate], ['Active tenants', report.activeTenants],
      ['New booking requests', report.newBookings], ['Rent charged', report.rentCharged], ['Rent collected', report.rentCollected], ['Outstanding', report.outstanding],
      [],
      ['Period', 'Property', 'Resident', 'Entry Type', 'Amount', 'Paid', 'Status', 'Due Date'],
      ...report.entries.map((entry) => [entry.period, entry.tenant.property.name, entry.tenant.name, entry.entryType, entry.amount, entry.paidAmount, entry.status, new Date(entry.dueDate).toLocaleDateString()])
    ]);
  };

  const createTicket = ticketFormApi.handleSubmit(async (ticketForm) => {
    if (!selectedPropertyId) return;
    try {
      let imageUrl: string | undefined;
      if (ticketImage) {
        const upload = new FormData();
        upload.append('image', ticketImage);
        const uploadResponse = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
        imageUrl = uploadResponse.data.fileKey;
      }
      await api.post('/pg/owner/maintenance', { ...ticketForm, propertyId: selectedPropertyId, imageUrl });
      ticketFormApi.reset(EMPTY_TICKET_FORM);
      setTicketImage(null);
      toast.success('Maintenance ticket created');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create ticket'));
    }
  }, showFirstError);

  const updateTicket = async (ticketId: string, status: string) => {
    try {
      await api.patch(`/pg/owner/maintenance/${ticketId}/status`, { status });
      toast.success('Ticket status updated');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update ticket'));
    }
  };

  const reviewPaymentClaim = async (claim: PaymentClaim, status: 'APPROVED' | 'REJECTED') => {
    const responseNote = status === 'REJECTED' ? claimRejectionReason.trim() : '';
    if (status === 'REJECTED' && !responseNote) return;
    try {
      await api.patch(`/pg/owner/payment-claims/${claim.id}`, { status, responseNote });
      toast.success(status === 'APPROVED' ? 'Payment verified and ledger updated' : 'Payment claim rejected');
      setRejectingClaimId('');
      setClaimRejectionReason('');
      refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not review payment claim'));
    }
  };

  const decideRoomChange = async (requestId: string, decision: 'APPROVE_AND_MOVE' | 'DECLINE') => {
    if (decision === 'APPROVE_AND_MOVE' && !window.confirm('Move the resident(s) to the new bed(s) now? This updates the stay records.')) return;
    try {
      await api.post(`/pg/owner/room-changes/${requestId}/decision`, { decision, ...(decision === 'DECLINE' && changeDecisionNote.trim() ? { note: changeDecisionNote.trim() } : {}) });
      toast.success(decision === 'APPROVE_AND_MOVE' ? 'Rooms updated' : 'Request declined');
      setDecliningChangeId('');
      setChangeDecisionNote('');
      refresh();
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
        : undefined;
      toast.error(typeof message === 'string' && message.trim() ? message : 'Could not decide room change');
    }
  };

  const views = useMemo(() => [
    { id: 'overview', label: 'Today', icon: Building2 },
    { id: 'properties', label: 'Properties & Beds', icon: BedDouble },
    { id: 'bookings', label: 'Bookings', icon: ClipboardList },
    { id: 'roomchanges', label: 'Room changes', icon: ArrowLeftRight },
    { id: 'tenants', label: 'Tenants & KYC', icon: Users },
    { id: 'activity', label: 'Activity', icon: Clock },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    ...(summary.canManageStaff ? [
      { id: 'rent' as const, label: 'Rent Ledger', icon: Wallet },
      { id: 'payments' as const, label: 'Payment claims', icon: IndianRupee },
      { id: 'expenses' as const, label: 'Expenses', icon: IndianRupee },
      { id: 'utilities' as const, label: 'Utilities', icon: Zap },
      { id: 'reports' as const, label: 'Reports', icon: FileText },
      { id: 'staff' as const, label: 'Staff', icon: Users }
    ] : [])
  ] as const, [summary.canManageStaff]);

  const { setSectionNav } = useSidebar();

  useEffect(() => {
    setSectionNav(views.map(({ id, label, icon }) => ({ id, label, icon, active: id === view, onSelect: () => setView(id) })));
    return () => setSectionNav(null);
  }, [views, view, setSectionNav]);

  return (
      <div className="space-y-6 text-slate-900">
        {/* The page title is the section itself; Today brings its own heading. */}
        {view !== 'overview' && <h1 className="text-2xl font-bold">{views.find((item) => item.id === view)?.label}</h1>}

        {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-navy-900" /></div> : (
          <>
            {view === 'payments' && <section className="pt-2 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Resident payment claims</h2>
              <div className="space-y-3">
                {paymentClaims.map((claim) => <article key={claim.id} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-bold text-slate-900 text-base">{claim.tenant.name}</h3>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${claim.status === 'PENDING' ? 'border-amber-200 bg-amber-50 text-amber-800' : claim.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{claim.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 font-medium">{claim.property.name} · {claim.rentEntry.entryType} {claim.rentEntry.period} · ₹{claim.amount.toLocaleString('en-IN')}</p>
                    <p className="mt-0.5 text-xs text-slate-400">UPI reference: {claim.reference} · Submitted {new Date(claim.createdAt).toLocaleString()}</p>
                    {claim.responseNote && <p className="mt-1 text-xs text-red-700 font-semibold">{claim.responseNote}</p>}
                  </div>
                  {claim.status === 'PENDING' && rejectingClaimId !== claim.id && <div className="flex gap-2">
                    <button onClick={() => { setRejectingClaimId(claim.id); setClaimRejectionReason(''); }} className="rounded-xl border border-red-200 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-50 transition-colors">Reject</button>
                    <button onClick={() => void reviewPaymentClaim(claim, 'APPROVED')} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs">Verify and credit</button>
                  </div>}
                  {claim.status === 'PENDING' && rejectingClaimId === claim.id && <form onSubmit={(event) => { event.preventDefault(); void reviewPaymentClaim(claim, 'REJECTED'); }} className="flex min-w-0 flex-col gap-2 md:w-80">
                    <label className="text-xs font-bold text-slate-700">Reason for rejecting payment
                      <input required maxLength={300} value={claimRejectionReason} onChange={(event) => setClaimRejectionReason(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900" />
                    </label>
                    <div className="flex gap-2"><button className="rounded-xl bg-red-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-800 transition-colors">Confirm rejection</button><button type="button" onClick={() => setRejectingClaimId('')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button></div>
                  </form>}
                </article>)}
                {!paymentClaims.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-sm">No resident payment claims awaiting verification.</div>}
              </div>
            </section>}

            {view === 'overview' && (() => {
              // Today (DESIGN.md §4.3): what needs the owner now, most urgent first.
              type Need = { key: string; rank: number; text: string; detail: string; action: string; go: WorkspaceView; tone: 'negative' | 'attention' | 'info' };
              const needs: Need[] = [
                ...(summary.canManageStaff ? rentEntries.filter((entry) => entry.status === 'OVERDUE' || (['DUE', 'PARTIAL'].includes(entry.status) && new Date(entry.dueDate).getTime() < new Date().setHours(0, 0, 0, 0))).map((entry): Need => ({
                  key: `rent-${entry.id}`, rank: 0, tone: 'negative', go: 'rent', action: 'Open ledger',
                  text: `Rent overdue: ${entry.tenant.name}`,
                  detail: `${rupees(Math.max(0, entry.amount - entry.paidAmount))} · due ${shortDate(entry.dueDate)}`
                })) : []),
                ...tickets.filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status) && ['URGENT', 'HIGH'].includes(ticket.priority)).map((ticket): Need => ({
                  key: `urgent-${ticket.id}`, rank: 1, tone: 'negative', go: 'maintenance', action: 'Assign',
                  text: ticket.title, detail: `${ticket.priority === 'URGENT' ? 'Urgent' : 'High priority'} · ${ticket.property.name}`
                })),
                ...(summary.canManageStaff ? paymentClaims.filter((claim) => claim.status === 'PENDING').map((claim): Need => ({
                  key: `claim-${claim.id}`, rank: 2, tone: 'attention', go: 'payments', action: 'Confirm',
                  text: `Payment to confirm: ${claim.tenant.name}`, detail: `${rupees(claim.amount)} · ref ${claim.reference}`
                })) : []),
                ...bookings.filter((booking) => booking.status === 'PENDING').map((booking): Need => ({
                  key: `booking-${booking.id}`, rank: 3, tone: 'attention', go: 'bookings', action: 'Review',
                  text: `${booking.residentName} wants ${booking.bed ? `Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : 'a bed'}`,
                  detail: `${booking.property.name} · move-in ${shortDate(booking.moveInDate)}`
                })),
                ...tickets.filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status) && !['URGENT', 'HIGH'].includes(ticket.priority)).map((ticket): Need => ({
                  key: `ticket-${ticket.id}`, rank: 4, tone: 'info', go: 'maintenance', action: 'Open',
                  text: ticket.title, detail: `${ticket.tenant?.name ? `${ticket.tenant.name} · ` : ''}${ticket.property.name}`
                }))
              ].sort((a, b) => a.rank - b.rank);
              const tiles: [string, string, WorkspaceView][] = [
                [`${summary.pendingBookings}`, summary.pendingBookings === 1 ? 'request to review' : 'requests to review', 'bookings'],
                ...(summary.canManageStaff ? [[rupees(summary.rentOutstanding), 'rent outstanding', 'rent'] as [string, string, WorkspaceView]] : []),
                [`${summary.openTickets}`, summary.openTickets === 1 ? 'open issue' : 'open issues', 'maintenance']
              ];
              const dot = { negative: 'bg-negative', attention: 'bg-attention', info: 'bg-info' };
              return (
                <section className="space-y-6 pt-2" aria-labelledby="today-heading">
                  <div>
                    <h1 id="today-heading" className="text-2xl font-bold">Today</h1>
                    <p className="tabular text-muted">
                      {summary.occupiedBeds} of {summary.totalBeds} beds occupied ({summary.occupancyRate}%) across {summary.properties} {summary.properties === 1 ? 'PG' : 'PGs'}
                    </p>
                  </div>
                  <div className={`grid gap-2 sm:gap-3 ${tiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {tiles.map(([value, label, go]) => (
                      <button key={label} type="button" onClick={() => setView(go)} className="rounded-[14px] border border-hairline bg-white p-3 text-left hover:border-field-border sm:p-4">
                        <span className="tabular block font-display text-xl font-bold leading-none text-navy-900 sm:text-[2rem]">{value}</span>
                        <span className="mt-1 block text-sm leading-tight text-muted sm:text-base">{label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-[14px] border border-hairline bg-white">
                    <h2 className="border-b border-hairline px-5 py-3 font-sans text-base font-semibold text-navy-900">
                      Needs you{needs.length > 0 && <span className="tabular text-muted"> ({needs.length})</span>}
                    </h2>
                    {needs.length ? (
                      <ul className="divide-y divide-hairline">
                        {needs.slice(0, 8).map((need) => (
                          <li key={need.key} className="flex items-center gap-3 px-5 py-3">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${dot[need.tone]}`} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-navy-900">{need.text}</p>
                              <p className="tabular truncate text-sm text-muted">{need.detail}</p>
                            </div>
                            <button type="button" onClick={() => setView(need.go)} className="btn-secondary min-h-10 shrink-0 px-3 py-1.5 text-sm">{need.action}</button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="flex items-center gap-2 px-5 py-6 text-positive"><Check className="h-5 w-5" aria-hidden="true" /> Nothing needs you right now.</p>
                    )}
                    {needs.length > 8 && <p className="border-t border-hairline px-5 py-2.5 text-sm text-muted">{needs.length - 8} more in Bookings, Rent and Maintenance.</p>}
                  </div>
                </section>
              );
            })()}

            {view === 'properties' && <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-slate-900">Your properties</h2>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{properties.length} properties</span>
                </div>
                <div className="space-y-3">
                  {properties.map((property) => {
                    const beds = property.rooms.flatMap((room) => room.beds);
                    const occupied = beds.filter((bed) => bed.status === 'OCCUPIED').length;
                    const isSelected = selectedPropertyId === property.id;
                    return <div key={property.id} className={`rounded-2xl border transition-all overflow-hidden ${isSelected ? 'border-navy-900 bg-white shadow-sm ring-1 ring-navy-900/20' : 'border-slate-200/90 bg-white hover:border-slate-300 shadow-xs'}`}>
                      <button onClick={() => selectProperty(property)} className={`block w-full p-4 text-left transition-colors ${isSelected ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span className="block font-bold text-navy-900 text-base">{property.name}</span>
                            <span className="mt-1 block text-xs text-slate-500 font-medium">{property.locality}, {property.city} · {property.rooms.length} rooms</span>
                          </div>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${occupied === beds.length && beds.length > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                            {occupied}/{beds.length} occupied
                          </span>
                        </div>
                      </button>
                      {isSelected && <div className="space-y-4 bg-white p-4 pt-1 border-t border-slate-100">
                        {property.slug && <ResidentSiteLink slug={property.slug} />}
                        <div className="space-y-2.5">
                          {property.rooms.map((room) => <div key={room.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-slate-900">Room {room.roomNumber} · {room.roomType}</span>
                              <span className="font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">₹{room.monthlyRent.toLocaleString('en-IN')} / mo</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {room.beds.map((bed) => <span key={bed.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                                <span className={`h-2 w-2 rounded-full ${bed.status === 'AVAILABLE' ? 'bg-emerald-500' : bed.status === 'OCCUPIED' ? 'bg-blue-500' : bed.status === 'MAINTENANCE' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                {bed.label} · {bed.status.toLowerCase().replace('_', ' ')}
                                {summary.canManageStaff && ['AVAILABLE', 'MAINTENANCE'].includes(bed.status) && (
                                  <button type="button" title={bed.status === 'AVAILABLE' ? 'Mark bed for maintenance' : 'Mark bed available'} onClick={() => void updateBedStatus(bed.id, bed.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE')} className="ml-1 text-[11px] font-bold text-navy-900 hover:underline">
                                    {bed.status === 'AVAILABLE' ? 'Repair' : 'Release'}
                                  </button>
                                )}
                              </span>)}
                            </div>
                          </div>)}
                        </div>
                        {summary.canManageStaff && <div className="flex gap-2 pt-2 border-t border-slate-100">
                          <button type="button" onClick={() => void togglePublish(property)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors">
                            {property.status === 'INACTIVE' ? 'Publish' : 'Unpublish'}
                          </button>
                          <button type="button" onClick={() => void removeProperty(property.id)} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors">
                            Delete property
                          </button>
                        </div>}
                      </div>}
                    </div>;
                  })}
                  {!properties.length && <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-500 font-medium">Add a property to start managing rooms and beds.</div>}
                </div>
                {summary.canManageStaff && selectedPropertyId && <form onSubmit={createRoom} className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
                  <h3 className="font-bold text-slate-900 text-sm">Add room and beds</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-700">Room number<input required {...roomFormApi.register('roomNumber')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="text-xs font-semibold text-slate-700">Block / wing<input {...roomFormApi.register('block')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="text-xs font-semibold text-slate-700">Floor<input type="number" {...roomFormApi.register('floor')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="text-xs font-semibold text-slate-700">Sharing type<select {...roomFormApi.register('roomType')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="PRIVATE">Private</option><option value="DOUBLE">2 sharing</option><option value="TRIPLE">3 sharing</option><option value="SHARED">Shared dorm</option></select></label>
                    <label className="text-xs font-semibold text-slate-700">Monthly rent<input required min="1" type="number" {...roomFormApi.register('monthlyRent')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="text-xs font-semibold text-slate-700">Deposit<input min="0" type="number" {...roomFormApi.register('depositAmount')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="text-xs font-semibold text-slate-700">Maintenance fee<input min="0" type="number" {...roomFormApi.register('maintenanceFee')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="text-xs font-semibold text-slate-700">Utilities<input min="0" type="number" {...roomFormApi.register('utilitiesSurcharge')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="text-xs font-semibold text-slate-700">Food / month (0 for none)<input min="0" type="number" {...roomFormApi.register('foodCharge')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="text-xs font-semibold text-slate-700">Number of beds<input required min="1" max="20" type="number" {...roomFormApi.register('numberOfBeds')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mt-2"><input type="checkbox" {...roomFormApi.register('hasAc')} className="rounded border-slate-300 text-navy-900 focus:ring-navy-900" />AC room</label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mt-2"><input type="checkbox" {...roomFormApi.register('foodIncluded')} className="rounded border-slate-300 text-navy-900 focus:ring-navy-900" />Food included</label>
                  </div>
                  <button disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-60"><Plus className="h-4 w-4" />Add room</button>
                </form>}
              </div>
              {summary.canManageStaff && <form onSubmit={saveProperty} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm h-fit">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900 text-sm">{editingPropertyId ? 'Edit property' : 'Add a property'}</h2>
                  <button type="button" onClick={startNewProperty} className="text-xs font-bold text-navy-900 hover:underline">New</button>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Property Name</label>
                    <input required placeholder="Property name" {...propertyFormApi.register('name')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Description</label>
                    <textarea rows={2} placeholder="Description" {...propertyFormApi.register('description')} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Street Address</label>
                    <input required placeholder="Street address" {...propertyFormApi.register('address')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input required placeholder="Locality" {...propertyFormApi.register('locality')} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                    <input placeholder="City" {...propertyFormApi.register('city')} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" step="any" placeholder="Latitude (optional)" {...propertyFormApi.register('latitude')} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                    <input type="number" step="any" placeholder="Longitude (optional)" {...propertyFormApi.register('longitude')} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  {import.meta.env.VITE_GOOGLE_MAPS_API_KEY && <MapPicker apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} defaultAddress={mapAddress} initialCoordinates={mapLatitude && mapLongitude ? { lat: Number(mapLatitude), lng: Number(mapLongitude) } : null} onAddressChange={(address) => propertyFormApi.setValue('address', address)} onLocationSelect={(location) => { propertyFormApi.setValue('address', location.address); propertyFormApi.setValue('latitude', String(location.lat)); propertyFormApi.setValue('longitude', String(location.lng)); if (location.city) propertyFormApi.setValue('city', location.city); }} />}
                  <input type="tel" placeholder="Public WhatsApp contact (optional)" {...propertyFormApi.register('contactPhone')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  <input type="text" placeholder="UPI ID for resident payments (optional)" {...propertyFormApi.register('upiId')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  <select {...propertyFormApi.register('genderPolicy')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="ANY">All residents</option><option value="MEN">Men</option><option value="WOMEN">Women</option></select>
                  <div className="grid grid-cols-2 gap-3">
                    <select {...propertyFormApi.register('status')} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="ACTIVE">Published</option><option value="INACTIVE">Unpublished</option></select>
                    <label className="min-w-0 text-[11px] font-semibold text-slate-500">Hold (min)<input type="number" min="10" max="1440" {...propertyFormApi.register('bookingLockMinutes')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="min-w-0 text-[11px] font-semibold text-slate-500">Rent cycle day<input type="number" min="1" max="28" {...propertyFormApi.register('rentDay')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                    <label className="min-w-0 text-[11px] font-semibold text-slate-500">Rent due day<input type="number" min="1" max="28" {...propertyFormApi.register('rentDueDay')} className="mt-1 block w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" /></label>
                  </div>
                  <input placeholder="Amenities, separated by commas" {...propertyFormApi.register('amenities')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  <textarea rows={3} placeholder="House rules, one per line" {...propertyFormApi.register('houseRules')} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Property photos</label>
                    <input type="file" accept="image/*" multiple onChange={(event) => setPropertyPhotoFiles(Array.from(event.target.files || []))} className="block w-full text-xs file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold text-slate-600 hover:file:bg-slate-200 transition-colors" />
                  </div>
                  {existingPhotoUrls.length > 0 && <div className="flex gap-2 overflow-x-auto pt-1">{existingPhotoUrls.map((photo) => <SecureImage key={photo} srcKey={photo} alt="Property" className="h-16 w-20 shrink-0 rounded-xl object-cover border border-slate-200" />)}</div>}
                </div>
                <button disabled={saving} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-60"><Plus className="h-4 w-4" />{editingPropertyId ? 'Update property' : 'Save property'}</button>
              </form>}
            </section>}

            {view === 'bookings' && <section className="pt-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">Booking requests</h2>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{bookings.length} requests</span>
              </div>
              <div className="space-y-3">
                {bookings.map((booking) => <article key={booking.id} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base">{booking.residentName}</h3>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${booking.status === 'PENDING' ? 'border-amber-200 bg-amber-50 text-amber-800' : booking.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{booking.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">{booking.property.name} · {booking.property.locality}</p>
                    <p className="text-xs text-slate-500">{booking.phone} · Move-in {new Date(booking.moveInDate).toLocaleDateString()}{booking.bed ? ` · Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : ''}</p>
                    <p className="text-[11px] text-slate-400">Ref {booking.bookingRef}</p>
                    {booking.status === 'REJECTED' && booking.rejectionReason && <p className="text-xs text-rose-700 font-semibold bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl mt-1">Declined: {booking.rejectionReason}</p>}
                    {rejectingBookingId === booking.id && <form onSubmit={(event) => { event.preventDefault(); void updateBooking(booking.id, 'REJECTED'); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input required value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Reason for declining (guest will see this)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 sm:w-80" />
                      <button className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 transition-colors">Confirm decline</button>
                      <button type="button" onClick={() => { setRejectingBookingId(''); setRejectionReason(''); }} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                    </form>}
                  </div>
                  {booking.status === 'PENDING' && rejectingBookingId !== booking.id && <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Reassign bed" value={reassignBed[booking.id] || ''} onChange={(event) => setReassignBed({ ...reassignBed, [booking.id]: event.target.value })} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-navy-900">
                      <option value="">Keep {booking.bed ? `Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : 'bed'}</option>
                      {properties.flatMap((property) => property.rooms.flatMap((room) => room.beds.filter((bed) => bed.status === 'AVAILABLE').map((bed) => <option key={bed.id} value={bed.id}>{property.name} · Room {room.roomNumber}, {bed.label}</option>)))}
                    </select>
                    <button onClick={() => { setRejectingBookingId(booking.id); setRejectionReason(''); }} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors">
                      <X className="h-4 w-4" />Decline
                    </button>
                    <button disabled={!booking.bedId && !reassignBed[booking.id]} onClick={() => void updateBooking(booking.id, 'APPROVED', reassignBed[booking.id] || undefined)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50">
                      <Check className="h-4 w-4" />Approve
                    </button>
                  </div>}
                  {booking.status === 'APPROVED' && booking.tenant?.status === 'RESERVED' && <button onClick={() => void updateTenantStay(booking.tenant!.id, 'check-in')} className="rounded-xl bg-navy-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs">Check in</button>}
                </article>)}
                {!bookings.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-xs">No booking requests yet.</div>}
              </div>
            </section>}

            {view === 'roomchanges' && <section className="pt-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">Room swap and move requests</h2>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{roomChanges.length} requests</span>
              </div>
              <div className="space-y-3">
                {roomChanges.map((row) => <article key={row.request_id} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base">{row.request_type === 'MOVE' ? 'Move' : 'Swap'} · {row.requester}{row.partner ? ` ↔ ${row.partner}` : ''}</h3>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${row.status === 'ACCEPTED' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : row.status === 'PENDING_MATCH' || row.status === 'PROPOSED' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{row.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">{row.property}{row.from_bed ? ` · from Room ${row.from_bed.room_number || '?'}, ${row.from_bed.label}` : ''}{row.to_bed ? ` → Room ${row.to_bed.room_number || '?'}, ${row.to_bed.label}` : ''}</p>
                    {row.reason && <p className="text-xs text-slate-500 italic">“{row.reason}”</p>}
                    {decliningChangeId === row.request_id && <form onSubmit={(event) => { event.preventDefault(); void decideRoomChange(row.request_id, 'DECLINE'); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input value={changeDecisionNote} onChange={(event) => setChangeDecisionNote(event.target.value)} maxLength={200} placeholder="Note for the residents (optional)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 sm:w-80" />
                      <button className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 transition-colors">Confirm decline</button>
                      <button type="button" onClick={() => { setDecliningChangeId(''); setChangeDecisionNote(''); }} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                    </form>}
                  </div>
                  {(row.status === 'ACCEPTED' || (row.status === 'PENDING_MATCH' && row.request_type === 'MOVE' && row.to_bed)) && decliningChangeId !== row.request_id && <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => { setDecliningChangeId(row.request_id); setChangeDecisionNote(''); }} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors">
                      <X className="h-4 w-4" />Decline
                    </button>
                    <button onClick={() => void decideRoomChange(row.request_id, 'APPROVE_AND_MOVE')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs">
                      <Check className="h-4 w-4" />Approve and move
                    </button>
                  </div>}
                  {row.status === 'PROPOSED' && <p className="text-xs text-slate-500 font-medium">Waiting on the other resident.</p>}
                </article>)}
                {!roomChanges.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-xs">No room change requests yet.</div>}
              </div>
            </section>}

            {view === 'tenants' && <section className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900">Tenants and KYC records</h2>
                <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {['', 'ACTIVE', 'NOTICE_PERIOD', 'RESERVED', 'CHECKED_OUT'].map((status) => (
                    <button key={status} onClick={() => setTenantFilter(status)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${tenantFilter === status ? 'bg-white text-navy-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                      {status ? status.replace('_', ' ') : 'All'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {tenants.filter((tenant) => !tenantFilter || tenant.status === tenantFilter).map((tenant) => <article key={tenant.id} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-base text-navy-900">{tenant.name}</h3>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${tenant.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tenant.status === 'NOTICE_PERIOD' ? 'border-amber-200 bg-amber-50 text-amber-800' : tenant.status === 'RESERVED' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{tenant.status.replace('_', ' ')}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 font-medium">{tenant.property.name} · {tenant.bed ? `Room ${tenant.bed.room.roomNumber}, ${tenant.bed.label}` : 'No bed assigned'}</p>
                      <p className="mt-1 text-xs text-slate-700 font-medium">{tenant.phone} · ₹{tenant.monthlyRent.toLocaleString('en-IN')} / month · Deposit ₹{tenant.depositReceived.toLocaleString('en-IN')} / ₹{tenant.depositAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tenant.status === 'RESERVED' && <button onClick={() => void updateTenantStay(tenant.id, 'check-in')} className="rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs">Check in</button>}
                      {tenant.status === 'ACTIVE' && <button onClick={() => setCheckoutTenantId(checkoutTenantId === tenant.id ? '' : tenant.id)} className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors">Check out</button>}
                      {tenant.status === 'CHECKED_OUT' && tenant.depositRefundStatus === 'PENDING' && <span className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800">Refund due ₹{(tenant.depositRefundAmount || 0).toLocaleString('en-IN')}</span>}
                      {tenant.kycDocumentUrl && <button type="button" onClick={() => void viewKycDocument(tenant.kycDocumentUrl!)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">View KYC</button>}
                      {tenant.kycDocumentUrl && !tenant.kycVerified && <button type="button" onClick={() => void verifyKyc(tenant.id, true)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors">Verify KYC</button>}
                      {tenant.kycVerified && <button type="button" onClick={() => void verifyKyc(tenant.id, false)} className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors">KYC verified · revoke</button>}
                      {tenant.foodOptOut ? <button type="button" onClick={() => void setFoodOptOut(tenant.id, false)} className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors">Food off · turn on</button> : <button type="button" onClick={() => void setFoodOptOut(tenant.id, true)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">Food on · opt out</button>}
                    </div>
                  </div>
                  <form onSubmit={(event) => void updateTenant(event, tenant.id)} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                    <input name="permanentAddress" defaultValue={tenant.permanentAddress || ''} placeholder="Permanent address" className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                    <input name="institutionOrEmployer" defaultValue={tenant.institutionOrEmployer || ''} placeholder="College / employer" className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                    <input name="emergencyName" defaultValue={tenant.emergencyName || ''} placeholder="Emergency contact name" className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                    <input name="emergencyPhone" defaultValue={tenant.emergencyPhone || ''} placeholder="Emergency contact phone" className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                    <select name="bloodGroup" defaultValue={tenant.bloodGroup || ''} className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="">Blood group</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group}>{group}</option>)}</select>
                    <select name="kycType" defaultValue={tenant.kycType || ''} className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="">KYC document type</option>{['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'STUDENT_ID', 'WORK_ID'].map((type) => <option key={type}>{type}</option>)}</select>
                    <input name="kycDocument" type="file" accept="image/*,application/pdf" className="rounded-xl border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-xs sm:col-span-2 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-200 file:px-2.5 file:py-1 file:text-[11px] file:font-semibold" />
                    <button disabled={saving} className="rounded-xl bg-navy-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-60">Save resident record</button>
                  </form>
                  {checkoutTenantId === tenant.id && tenant.status === 'ACTIVE' && <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void updateTenantStay(tenant.id, 'check-out', { depositDeductions: Number(form.get('depositDeductions') || 0), checkoutNote: String(form.get('checkoutNote') || '') }); }} className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:grid-cols-[1fr_1.5fr_auto_auto]">
                    <label className="text-xs font-bold text-slate-700">Deposit deductions (₹, max {(tenant.depositReceived || 0).toLocaleString('en-IN')})<input name="depositDeductions" type="number" min="0" max={tenant.depositReceived || 0} defaultValue="0" className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900" /></label>
                    <label className="text-xs font-bold text-slate-700">Inspection / checkout note<input name="checkoutNote" placeholder="Room condition, damages…" className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900" /></label>
                    <button className="self-end rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 transition-colors">Confirm check-out</button>
                    <button type="button" onClick={() => setCheckoutTenantId('')} className="self-end rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
                    <p className="text-[11px] text-slate-500 font-medium sm:col-span-4">Refund due = deposit received − deductions. It stays Pending until you mark it refunded below.</p>
                  </form>}
                  {tenant.status === 'CHECKED_OUT' && (tenant.depositDeductions || tenant.checkoutNote) ? <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3">Check-out: deductions ₹{(tenant.depositDeductions || 0).toLocaleString('en-IN')}{tenant.checkoutNote ? ` · ${tenant.checkoutNote}` : ''} · Refund {tenant.depositRefundStatus?.toLowerCase().replace('_', ' ')}{(tenant.depositRefundAmount ?? 0) > 0 ? ` ₹${(tenant.depositRefundAmount || 0).toLocaleString('en-IN')}` : ''}{tenant.depositRefundReference ? ` · Ref ${tenant.depositRefundReference}` : ''}</p> : null}
                  {tenant.status === 'CHECKED_OUT' && tenant.depositRefundStatus === 'PENDING' && summary.canManageStaff && <form onSubmit={(event) => { event.preventDefault(); void markDepositRefunded(tenant.id); }} className="flex flex-col gap-2 sm:flex-row">
                    <input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} placeholder="Refund UPI / transaction reference" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 sm:w-80" />
                    <button className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs">Mark refunded</button>
                  </form>}
                </article>)}
                {!tenants.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-xs">Approved bookings will appear here for check-in.</div>}
              </div>
            </section>}

            {view === 'rent' && <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h2 className="text-base font-bold text-slate-900">Rent and deposit ledger</h2>
                  <button onClick={() => void sendReminders()} disabled={reminding} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors disabled:opacity-60">{reminding ? 'Sending…' : 'Send due reminders'}</button>
                </div>
                <div className="space-y-3">
                  {rentEntries.map((entry) => <article key={entry.id} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm">{entry.tenant.name}</h3>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{entry.entryType} · {entry.period}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${entry.status === 'PAID' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{entry.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{entry.tenant.property.name}{entry.tenant.bed ? ` · Room ${entry.tenant.bed.room.roomNumber}, ${entry.tenant.bed.label}` : ''} · Due {new Date(entry.dueDate).toLocaleDateString()}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-800">₹{entry.paidAmount.toLocaleString('en-IN')} paid of ₹{entry.amount.toLocaleString('en-IN')}{entry.method ? ` · ${entry.method}` : ''}{entry.reference ? ` · Ref ${entry.reference}` : ''}</p>
                      </div>
                    </div>
                    {entry.status !== 'PAID' && <form onSubmit={(event) => void recordPayment(event, entry.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto] pt-2 border-t border-slate-100">
                      <input required name="amount" type="number" min="1" max={entry.amount - entry.paidAmount} defaultValue={entry.amount - entry.paidAmount} aria-label="Payment amount" className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                      <select name="method" className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="CASH">Cash</option><option value="NEFT">NEFT</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select>
                      <input name="reference" placeholder="Receipt / transaction reference" className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                      <button className="rounded-xl bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs">Record payment</button>
                    </form>}
                  </article>)}
                  {!rentEntries.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-xs">No rent entries yet.</div>}
                </div>
              </div>
              <form onSubmit={addRentEntry} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm h-fit">
                <h2 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100">Add ledger charge</h2>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Resident</label>
                    <select required {...rentFormApi.register('tenantId')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="">Select resident</option>{tenants.filter((tenant) => tenant.status === 'ACTIVE').map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.property.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Period</label>
                    <select {...rentFormApi.register('period')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value={new Date().toISOString().slice(0, 7)}>{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option><option value="DEPOSIT">Security deposit</option></select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Amount</label>
                    <input required type="number" min="1" placeholder="Amount" {...rentFormApi.register('amount')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Due Date</label>
                    <input required type="date" {...rentFormApi.register('dueDate')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                </div>
                <button disabled={saving || !tenants.some((tenant) => tenant.status === 'ACTIVE')} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-60"><Plus className="h-4 w-4" />Add charge</button>
              </form>
            </section>}

            {view === 'expenses' && <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h2 className="text-base font-bold text-slate-900">Property expenses</h2>
                  <span className="text-xs font-bold text-navy-900 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">₹{expenseTotal.toLocaleString('en-IN')} total</span>
                </div>
                <div className="space-y-3">
                  {expenses.map((entry) => <article key={entry.id} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-slate-900">₹{entry.amount.toLocaleString('en-IN')}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{entry.category}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{entry.property.name} · {new Date(entry.spentOn).toLocaleDateString()}{entry.note ? ` · ${entry.note}` : ''}</p>
                    </div>
                    <button onClick={() => void removeExpense(entry.id)} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors self-start sm:self-auto">Remove</button>
                  </article>)}
                  {!expenses.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-xs">No expenses logged yet.</div>}
                </div>
              </div>
              <form onSubmit={submitExpense} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm h-fit">
                <h2 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100">Log expense</h2>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Property</label>
                    <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white">{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Category</label>
                    <select {...expenseFormApi.register('category')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white">{['FOOD', 'STAFF', 'MAINTENANCE', 'UTILITIES', 'OTHER'].map((category) => <option key={category} value={category}>{category}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Amount</label>
                    <input required type="number" min="1" placeholder="Amount" {...expenseFormApi.register('amount')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Date</label>
                    <input required type="date" {...expenseFormApi.register('spentOn')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Note (optional)</label>
                    <input placeholder="Note (optional)" {...expenseFormApi.register('note')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                </div>
                <button disabled={saving || !selectedPropertyId} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-60"><Plus className="h-4 w-4" />Log expense</button>
              </form>
            </section>}

            {view === 'utilities' && <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div>
                <h2 className="text-base font-bold text-slate-900 mb-4">Electricity bills</h2>
                <div className="space-y-3">
                  {bills.map((bill) => <article key={bill.id} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 text-sm">₹{bill.totalAmount.toLocaleString('en-IN')}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{bill.period}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{bill.property.name} · <span className="font-bold text-amber-700">{bill.status}</span></p>
                      </div>
                      {bill.status === 'DRAFT' && <button onClick={() => void approveBill(bill.id)} className="rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors shadow-xs">Review & approve</button>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                      {JSON.parse(bill.splitJson || '[]').map((row: { tenantName: string; roomNumber: string; share: number }) => <span key={row.tenantName} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 font-medium">{row.tenantName} · Room {row.roomNumber} · ₹{row.share.toLocaleString('en-IN')}</span>)}
                    </div>
                  </article>)}
                  {!bills.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-xs">No electricity bills yet.</div>}
                </div>
              </div>
              <form onSubmit={proposeBill} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm h-fit">
                <h2 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100">Propose split</h2>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Property</label>
                    <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white">{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Billing Month</label>
                    <input required type="month" {...billFormApi.register('period')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Bill Total (₹)</label>
                    <input required type="number" min="1" placeholder="Bill total" {...billFormApi.register('totalAmount')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                </div>
                <button disabled={saving || !selectedPropertyId} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-60"><Plus className="h-4 w-4" />Propose split</button>
              </form>
            </section>}

            {view === 'reports' && report && <section className="pt-2 space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-700">Monthly operations</p>
                  <h2 className="mt-1 text-xl font-bold text-navy-900 tracking-tight">Report · {report.period}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={exportReport} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"><Download className="h-4 w-4" />Export CSV</button>
                  <button onClick={exportReportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"><Download className="h-4 w-4" />Export Excel</button>
                  <button onClick={() => window.print()} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors">Print / PDF</button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Occupancy', `${report.occupancyRate}%`, 'Capacity utilized across properties'],
                  ['Available beds', report.availableBeds, 'Beds ready for new move-ins'],
                  ['Rent charged', `₹${report.rentCharged.toLocaleString('en-IN')}`, 'Total invoiced this period'],
                  ['Rent collected', `₹${report.rentCollected.toLocaleString('en-IN')}`, 'Actual payments received'],
                  ['Outstanding', `₹${report.outstanding.toLocaleString('en-IN')}`, 'Unpaid rent balance'],
                  ['New booking requests', report.newBookings, 'Applications during period']
                ].map(([label, value, subtext]) => (
                  <div key={label} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all flex flex-col justify-between">
                    <p className="text-xs font-bold text-slate-500">{label}</p>
                    <div className="mt-3">
                      <p className="text-2xl font-bold text-navy-900">{value}</p>
                      <p className="mt-1 text-[11px] text-slate-400 font-medium">{subtext}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>}

            {view === 'activity' && <section className="pt-2 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Activity log</h2>
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs divide-y divide-slate-100">
                {activity.map((entry) => <div key={entry.id} className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between first:pt-0 last:pb-0">
                  <div>
                    <p className="font-bold text-sm text-slate-800">{entry.action.replace(/_/g, ' ')}{entry.detail ? <span className="font-medium text-slate-500"> · {entry.detail}</span> : null}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{entry.actorName || 'System'}{entry.entityType ? ` · ${entry.entityType}` : ''}</p>
                  </div>
                  <span className="text-xs font-medium text-slate-400">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>)}
                {!activity.length && <p className="py-8 text-center text-xs text-slate-500 font-medium">No activity logged yet.</p>}
              </div>
            </section>}

            {view === 'staff' && summary.canManageStaff && <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <h2 className="text-base font-bold text-slate-900 mb-4">Property wardens</h2>
                <div className="space-y-3">
                  {staff.map((member) => <article key={`${member.property.id}-${member.id}`} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{member.name}</p>
                      <p className="mt-1 text-xs text-slate-500 font-medium">{member.property.name} · {member.phone}{member.email ? ` · ${member.email}` : ''}</p>
                    </div>
                    <button onClick={() => void removeStaff(member)} className="rounded-xl border border-rose-200 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors">Remove access</button>
                  </article>)}
                  {!staff.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-xs">No wardens assigned yet.</div>}
                </div>
              </div>
              <form onSubmit={addStaff} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm h-fit">
                <h2 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100">Add a warden</h2>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Property</label>
                    <select required {...staffFormApi.register('propertyId')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="">Assign property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Full Name</label>
                    <input required placeholder="Full name" {...staffFormApi.register('name')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Phone Number</label>
                    <input required type="tel" placeholder="Phone number" {...staffFormApi.register('phone')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Email (optional)</label>
                    <input type="email" placeholder="Email (optional)" {...staffFormApi.register('email')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Temporary Password</label>
                    <input required type="password" minLength={8} placeholder="Temporary password" {...staffFormApi.register('password')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                </div>
                <button disabled={saving} className="mt-5 w-full rounded-xl bg-navy-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-60">Create warden account</button>
              </form>
            </section>}

            {view === 'maintenance' && <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <h2 className="text-base font-bold text-slate-900 mb-4">Maintenance tickets</h2>
                <div className="space-y-3">
                  {tickets.map((ticket) => <article key={ticket.id} className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">{ticket.title}</h3>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${ticket.priority === 'URGENT' ? 'border-rose-200 bg-rose-50 text-rose-800' : ticket.priority === 'HIGH' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>{ticket.priority}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{ticket.status.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-slate-500">{ticket.property.name} · {ticket.category}{ticket.tenant ? ` · ${ticket.tenant.name}` : ''}{ticket.assignedName ? ` · Assigned to ${ticket.assignedName}` : ''}</p>
                      <p className="text-xs text-slate-700 pt-1">{ticket.description}</p>
                      {ticket.imageUrl && <p className="text-[11px] text-slate-400 font-medium">Photo attached</p>}
                    </div>
                    {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && <button onClick={() => void updateTicket(ticket.id, 'RESOLVED')} className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors">Mark resolved</button>}
                  </article>)}
                  {!tickets.length && <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-500 font-medium shadow-xs">No maintenance tickets yet.</div>}
                </div>
              </div>
              <form onSubmit={createTicket} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm h-fit">
                <h2 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100">Log maintenance</h2>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Property</label>
                    <select required value={selectedPropertyId} onChange={(event) => { setSelectedPropertyId(event.target.value); ticketFormApi.setValue('assignedTo', ''); }} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Assign Warden</label>
                    <select {...ticketFormApi.register('assignedTo')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option value="">Unassigned</option>{staff.filter((member) => member.property.id === selectedPropertyId).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Issue Title</label>
                    <input required placeholder="Issue title" {...ticketFormApi.register('title')} className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Description</label>
                    <textarea required rows={3} placeholder="Describe the issue" {...ticketFormApi.register('description')} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <select {...ticketFormApi.register('category')} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option>PLUMBING</option><option>ELECTRICAL</option><option>APPLIANCE</option><option>CLEANING</option><option>OTHER</option></select>
                    <select {...ticketFormApi.register('priority')} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-navy-900 focus:bg-white"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Photo</label>
                    <input type="file" accept="image/*" onChange={(event) => setTicketImage(event.target.files?.[0] || null)} className="block w-full text-xs file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold text-slate-600 hover:file:bg-slate-200 transition-colors" />
                  </div>
                </div>
                <button disabled={saving || !properties.length} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-60"><Plus className="h-4 w-4" />Create ticket</button>
              </form>
            </section>}
          </>
        )}
      </div>
  );
}