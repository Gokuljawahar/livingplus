import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch, type FieldErrors, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  electricityBillSchema, expenseSchema, ownerPropertySchema, ownerRoomSchema, ownerTicketSchema, rentEntrySchema, staffSchema,
  type ElectricityBillForm, type ExpenseForm, type OwnerPropertyForm, type OwnerRoomForm, type OwnerTicketForm, type RentEntryForm, type StaffForm
} from '../validation/forms';
import { ArrowLeftRight, BedDouble, Building2, Check, ClipboardList, Clock, Download, FileText, IndianRupee, Loader2, Plus, Users, Wallet, Wrench, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import ResidentSiteLink from '../components/ResidentSiteLink';
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
  const [view, setView] = useState<'overview' | 'properties' | 'bookings' | 'roomchanges' | 'tenants' | 'activity' | 'rent' | 'payments' | 'expenses' | 'utilities' | 'maintenance' | 'reports' | 'staff'>('overview');
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
    { id: 'overview', label: 'Overview', icon: Building2 },
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
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Property operations</p><h1 className="mt-1 text-2xl font-bold text-[#02224B]">Owner workspace</h1></div>
        </div>

        {loading ? <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-[#02224B]" /></div> : (
          <>
            {view === 'payments' && <section className="pt-6">
              <h2 className="font-semibold">Resident payment claims</h2>
              <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {paymentClaims.map((claim) => <article key={claim.id} className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{claim.tenant.name}</h3><span className={`text-xs font-semibold uppercase ${claim.status === 'PENDING' ? 'text-amber-700' : claim.status === 'APPROVED' ? 'text-emerald-700' : 'text-red-700'}`}>{claim.status}</span></div>
                    <p className="mt-1 text-sm text-slate-600">{claim.property.name} · {claim.rentEntry.entryType} {claim.rentEntry.period} · ₹{claim.amount.toLocaleString('en-IN')}</p>
                    <p className="mt-1 text-sm text-slate-500">UPI reference: {claim.reference} · Submitted {new Date(claim.createdAt).toLocaleString()}</p>
                    {claim.responseNote && <p className="mt-1 text-sm text-red-700">{claim.responseNote}</p>}
                  </div>
                  {claim.status === 'PENDING' && rejectingClaimId !== claim.id && <div className="flex gap-2">
                    <button onClick={() => { setRejectingClaimId(claim.id); setClaimRejectionReason(''); }} className="border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Reject</button>
                    <button onClick={() => void reviewPaymentClaim(claim, 'APPROVED')} className="bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Verify and credit</button>
                  </div>}
                  {claim.status === 'PENDING' && rejectingClaimId === claim.id && <form onSubmit={(event) => { event.preventDefault(); void reviewPaymentClaim(claim, 'REJECTED'); }} className="flex min-w-0 flex-col gap-2 md:w-80">
                    <label className="text-sm text-slate-700">Reason for rejecting payment
                      <input required maxLength={300} value={claimRejectionReason} onChange={(event) => setClaimRejectionReason(event.target.value)} className="mt-1 block w-full border border-slate-300 px-3 py-2" />
                    </label>
                    <div className="flex gap-2"><button className="bg-red-700 px-3 py-2 text-sm font-semibold text-white">Confirm rejection</button><button type="button" onClick={() => setRejectingClaimId('')} className="border border-slate-300 px-3 py-2 text-sm">Cancel</button></div>
                  </form>}
                </article>)}
                {!paymentClaims.length && <p className="py-8 text-center text-sm text-slate-500">No resident payment claims.</p>}
              </div>
            </section>}

            {view === 'overview' && <section className="pt-6">
              <div className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
                {([
                  ['Properties', summary.properties, Building2],
                  ['Beds occupied', `${summary.occupiedBeds} / ${summary.totalBeds}`, BedDouble],
                  ['Occupancy', `${summary.occupancyRate}%`, Building2],
                  ...(summary.canManageStaff ? [['Rent outstanding', `₹${summary.rentOutstanding.toLocaleString('en-IN')}`, IndianRupee]] : []),
                  ['Pending requests', summary.pendingBookings, ClipboardList],
                  ['Open maintenance', summary.openTickets, Wrench]
                ] as [string, string | number, LucideIcon][]).map(([label, value, Icon]) => <div key={label} className="bg-white p-5"><div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon className="h-4 w-4" /></div><p className="mt-3 text-2xl font-bold text-[#02224B]">{value}</p></div>)}
              </div>
              <div className="mt-8 grid gap-8 lg:grid-cols-2">
                <div><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Latest booking requests</h2><button onClick={() => setView('bookings')} className="text-sm font-semibold text-[#02224B]">View all</button></div><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{bookings.slice(0, 4).map((booking) => <div key={booking.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium">{booking.residentName}</p><p className="text-sm text-slate-500">{booking.property.name} · {booking.status.toLowerCase()}</p></div><span className="text-xs text-slate-500">{new Date(booking.moveInDate).toLocaleDateString()}</span></div>)}{!bookings.length && <p className="py-5 text-sm text-slate-500">No booking requests yet.</p>}</div></div>
                <div><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Maintenance queue</h2><button onClick={() => setView('maintenance')} className="text-sm font-semibold text-[#02224B]">View all</button></div><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{tickets.filter((ticket) => ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED').slice(0, 4).map((ticket) => <div key={ticket.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium">{ticket.title}</p><p className="text-sm text-slate-500">{ticket.property.name} · {ticket.category}</p></div><span className="text-xs font-semibold uppercase text-amber-700">{ticket.priority}</span></div>)}{!tickets.length && <p className="py-5 text-sm text-slate-500">No maintenance tickets.</p>}</div></div>
              </div>
            </section>}

            {view === 'properties' && <section className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
              <div>
                <h2 className="font-semibold">Your properties</h2>
                <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                  {properties.map((property) => {
                    const beds = property.rooms.flatMap((room) => room.beds);
                    const occupied = beds.filter((bed) => bed.status === 'OCCUPIED').length;
                    return <div key={property.id} className="border-b border-slate-100">
                      <button onClick={() => selectProperty(property)} className={`block w-full px-3 py-4 text-left ${selectedPropertyId === property.id ? 'bg-amber-50/60' : 'hover:bg-white'}`}>
                        <span className="flex items-start justify-between gap-4"><span><span className="block font-semibold text-[#02224B]">{property.name}</span><span className="mt-1 block text-sm text-slate-500">{property.locality}, {property.city} · {property.rooms.length} rooms</span></span><span className="text-sm text-slate-600">{occupied}/{beds.length} occupied</span></span>
                      </button>
                      {selectedPropertyId === property.id && <div className="space-y-3 bg-white px-3 pb-4">
                        {property.slug && <ResidentSiteLink slug={property.slug} />}
                        {property.rooms.map((room) => <div key={room.id} className="border-t border-slate-100 pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold">Room {room.roomNumber} · {room.roomType}</span><span className="text-slate-500">₹{room.monthlyRent.toLocaleString('en-IN')} / month</span></div>
                          <div className="mt-2 flex flex-wrap gap-2">{room.beds.map((bed) => <span key={bed.id} className="inline-flex items-center gap-2 border border-slate-200 px-2 py-1 text-xs"><span className={`h-2 w-2 rounded-full ${bed.status === 'AVAILABLE' ? 'bg-emerald-500' : bed.status === 'OCCUPIED' ? 'bg-blue-500' : bed.status === 'MAINTENANCE' ? 'bg-red-500' : 'bg-amber-500'}`} />{bed.label} · {bed.status.toLowerCase().replace('_', ' ')}{summary.canManageStaff && ['AVAILABLE', 'MAINTENANCE'].includes(bed.status) && <button type="button" title={bed.status === 'AVAILABLE' ? 'Mark bed for maintenance' : 'Mark bed available'} onClick={() => void updateBedStatus(bed.id, bed.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE')} className="font-semibold text-[#02224B]">{bed.status === 'AVAILABLE' ? 'Repair' : 'Release'}</button>}</span>)}</div>
                        </div>)}
                        {summary.canManageStaff && <div className="flex gap-2"><button type="button" onClick={() => void togglePublish(property)} className="border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">{property.status === 'INACTIVE' ? 'Publish' : 'Unpublish'}</button><button type="button" onClick={() => void removeProperty(property.id)} className="border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Delete property</button></div>}
                      </div>}
                    </div>;
                  })}
                  {!properties.length && <p className="py-5 text-sm text-slate-500">Add a property to start managing rooms and beds.</p>}
                </div>
                {summary.canManageStaff && selectedPropertyId && <form onSubmit={createRoom} className="mt-8 border-t border-slate-200 pt-5">
                  <h3 className="font-semibold">Add room and beds</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-slate-600">Room number<input required {...roomFormApi.register('roomNumber')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm text-slate-600">Block / wing<input {...roomFormApi.register('block')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm text-slate-600">Floor<input type="number" {...roomFormApi.register('floor')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm text-slate-600">Sharing type<select {...roomFormApi.register('roomType')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2"><option value="PRIVATE">Private</option><option value="DOUBLE">2 sharing</option><option value="TRIPLE">3 sharing</option><option value="SHARED">Shared dorm</option></select></label>
                    <label className="text-sm text-slate-600">Monthly rent<input required min="1" type="number" {...roomFormApi.register('monthlyRent')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm text-slate-600">Deposit<input min="0" type="number" {...roomFormApi.register('depositAmount')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm text-slate-600">Maintenance fee<input min="0" type="number" {...roomFormApi.register('maintenanceFee')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm text-slate-600">Utilities<input min="0" type="number" {...roomFormApi.register('utilitiesSurcharge')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label><label className="text-sm text-slate-600">Food / month (0 for none)<input min="0" type="number" {...roomFormApi.register('foodCharge')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm text-slate-600">Number of beds<input required min="1" max="20" type="number" {...roomFormApi.register('numberOfBeds')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label>
                    <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" {...roomFormApi.register('hasAc')} />AC room</label>
                    <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" {...roomFormApi.register('foodIncluded')} />Food included</label>
                  </div>
                  <button disabled={saving} className="mt-4 inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" />Add room</button>
                </form>}
              </div>
              {summary.canManageStaff && <form onSubmit={saveProperty} className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-7">
                <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{editingPropertyId ? 'Edit property' : 'Add a property'}</h2><button type="button" onClick={startNewProperty} className="text-xs font-semibold text-[#02224B]">New</button></div>
                <div className="mt-4 space-y-3">
                  <input required placeholder="Property name" {...propertyFormApi.register('name')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm" />
                  <textarea rows={2} placeholder="Description" {...propertyFormApi.register('description')} className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm" />
                  <input required placeholder="Street address" {...propertyFormApi.register('address')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm" />
                  <div className="grid grid-cols-2 gap-3"><input required placeholder="Locality" {...propertyFormApi.register('locality')} className="min-w-0 border border-slate-300 bg-white px-3 py-2.5 text-sm" /><input placeholder="City" {...propertyFormApi.register('city')} className="min-w-0 border border-slate-300 bg-white px-3 py-2.5 text-sm" /></div>
                  <div className="grid grid-cols-2 gap-3"><input type="number" step="any" placeholder="Latitude (optional)" {...propertyFormApi.register('latitude')} className="min-w-0 border border-slate-300 bg-white px-3 py-2.5 text-sm" /><input type="number" step="any" placeholder="Longitude (optional)" {...propertyFormApi.register('longitude')} className="min-w-0 border border-slate-300 bg-white px-3 py-2.5 text-sm" /></div>
                  {import.meta.env.VITE_GOOGLE_MAPS_API_KEY && <MapPicker apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} defaultAddress={mapAddress} initialCoordinates={mapLatitude && mapLongitude ? { lat: Number(mapLatitude), lng: Number(mapLongitude) } : null} onAddressChange={(address) => propertyFormApi.setValue('address', address)} onLocationSelect={(location) => { propertyFormApi.setValue('address', location.address); propertyFormApi.setValue('latitude', String(location.lat)); propertyFormApi.setValue('longitude', String(location.lng)); if (location.city) propertyFormApi.setValue('city', location.city); }} />}
                  <input type="tel" placeholder="Public WhatsApp contact (optional)" {...propertyFormApi.register('contactPhone')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm" />
                  <input type="text" placeholder="UPI ID for resident payments (optional)" {...propertyFormApi.register('upiId')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm" />
                  <select {...propertyFormApi.register('genderPolicy')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="ANY">All residents</option><option value="MEN">Men</option><option value="WOMEN">Women</option></select>
                  <div className="grid grid-cols-2 gap-3"><select {...propertyFormApi.register('status')} className="min-w-0 border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="ACTIVE">Published</option><option value="INACTIVE">Unpublished</option></select><label className="min-w-0 text-xs text-slate-500">Booking hold (min)<input type="number" min="10" max="1440" {...propertyFormApi.register('bookingLockMinutes')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" /></label></div>
                  <div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-xs text-slate-500">Rent cycle day<input type="number" min="1" max="28" {...propertyFormApi.register('rentDay')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" /></label><label className="min-w-0 text-xs text-slate-500">Rent due day<input type="number" min="1" max="28" {...propertyFormApi.register('rentDueDay')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900" /></label></div>
                  <input placeholder="Amenities, separated by commas" {...propertyFormApi.register('amenities')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm" />
                  <textarea rows={3} placeholder="House rules, one per line" {...propertyFormApi.register('houseRules')} className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm" />
                  <label className="block text-sm text-slate-600">Property photos<input type="file" accept="image/*" multiple onChange={(event) => setPropertyPhotoFiles(Array.from(event.target.files || []))} className="mt-1.5 block w-full text-sm file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2" /></label>
                  {existingPhotoUrls.length > 0 && <div className="flex gap-2 overflow-x-auto">{existingPhotoUrls.map((photo) => <SecureImage key={photo} srcKey={photo} alt="Property" className="h-16 w-20 shrink-0 object-cover" />)}</div>}
                </div>
                <button disabled={saving} className="mt-4 inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" />{editingPropertyId ? 'Update property' : 'Save property'}</button>
              </form>}
            </section>}

            {view === 'bookings' && <section className="pt-6">
              <h2 className="font-semibold">Booking requests</h2>
              <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {bookings.map((booking) => <article key={booking.id} className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{booking.residentName}</h3><span className={`text-xs font-semibold uppercase ${booking.status === 'PENDING' ? 'text-amber-700' : 'text-slate-500'}`}>{booking.status.replace('_', ' ')}</span></div>
                    <p className="mt-1 text-sm text-slate-600">{booking.property.name} · {booking.property.locality}</p>
                    <p className="mt-1 text-sm text-slate-500">{booking.phone} · Move-in {new Date(booking.moveInDate).toLocaleDateString()}{booking.bed ? ` · Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : ''}</p>
                    <p className="mt-1 text-xs text-slate-400">Ref {booking.bookingRef}</p>
                    {booking.status === 'REJECTED' && booking.rejectionReason && <p className="mt-1 text-sm text-red-700">Declined: {booking.rejectionReason}</p>}
                    {rejectingBookingId === booking.id && <form onSubmit={(event) => { event.preventDefault(); void updateBooking(booking.id, 'REJECTED'); }} className="mt-3 flex flex-col gap-2 sm:flex-row"><input required value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Reason for declining (guest will see this)" className="w-full border border-slate-300 px-3 py-2 text-sm sm:w-80" /><button className="bg-red-700 px-3 py-2 text-sm font-semibold text-white">Confirm decline</button><button type="button" onClick={() => { setRejectingBookingId(''); setRejectionReason(''); }} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button></form>}
                  </div>
                  {booking.status === 'PENDING' && rejectingBookingId !== booking.id && <div className="flex flex-wrap items-center gap-2"><select aria-label="Reassign bed" value={reassignBed[booking.id] || ''} onChange={(event) => setReassignBed({ ...reassignBed, [booking.id]: event.target.value })} className="border border-slate-300 bg-white px-2 py-2 text-xs"><option value="">Keep {booking.bed ? `Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : 'bed'}</option>{properties.flatMap((property) => property.rooms.flatMap((room) => room.beds.filter((bed) => bed.status === 'AVAILABLE').map((bed) => <option key={bed.id} value={bed.id}>{property.name} · Room {room.roomNumber}, {bed.label}</option>)))}</select><button onClick={() => { setRejectingBookingId(booking.id); setRejectionReason(''); }} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><X className="h-4 w-4" />Decline</button><button disabled={!booking.bedId && !reassignBed[booking.id]} onClick={() => void updateBooking(booking.id, 'APPROVED', reassignBed[booking.id] || undefined)} className="inline-flex items-center gap-1 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4" />Approve</button></div>}
                  {booking.status === 'APPROVED' && booking.tenant?.status === 'RESERVED' && <button onClick={() => void updateTenantStay(booking.tenant!.id, 'check-in')} className="bg-[#02224B] px-3 py-2 text-sm font-semibold text-white">Check in</button>}
                </article>)}
                {!bookings.length && <p className="py-8 text-center text-sm text-slate-500">No booking requests yet.</p>}
              </div>
            </section>}

            {view === 'roomchanges' && <section className="pt-6">
              <h2 className="font-semibold">Room swap and move requests</h2>
              <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {roomChanges.map((row) => <article key={row.request_id} className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{row.request_type === 'MOVE' ? 'Move' : 'Swap'} · {row.requester}{row.partner ? ` ↔ ${row.partner}` : ''}</h3><span className={`text-xs font-semibold uppercase ${row.status === 'ACCEPTED' ? 'text-emerald-700' : row.status === 'PENDING_MATCH' || row.status === 'PROPOSED' ? 'text-amber-700' : 'text-slate-500'}`}>{row.status.replace('_', ' ')}</span></div>
                    <p className="mt-1 text-sm text-slate-600">{row.property}{row.from_bed ? ` · from Room ${row.from_bed.room_number || '?'}, ${row.from_bed.label}` : ''}{row.to_bed ? ` → Room ${row.to_bed.room_number || '?'}, ${row.to_bed.label}` : ''}</p>
                    {row.reason && <p className="mt-1 text-sm text-slate-500">“{row.reason}”</p>}
                    {decliningChangeId === row.request_id && <form onSubmit={(event) => { event.preventDefault(); void decideRoomChange(row.request_id, 'DECLINE'); }} className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={changeDecisionNote} onChange={(event) => setChangeDecisionNote(event.target.value)} maxLength={200} placeholder="Note for the residents (optional)" className="w-full border border-slate-300 px-3 py-2 text-sm sm:w-80" /><button className="bg-red-700 px-3 py-2 text-sm font-semibold text-white">Confirm decline</button><button type="button" onClick={() => { setDecliningChangeId(''); setChangeDecisionNote(''); }} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button></form>}
                  </div>
                  {(row.status === 'ACCEPTED' || (row.status === 'PENDING_MATCH' && row.request_type === 'MOVE' && row.to_bed)) && decliningChangeId !== row.request_id && <div className="flex flex-wrap items-center gap-2"><button onClick={() => { setDecliningChangeId(row.request_id); setChangeDecisionNote(''); }} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><X className="h-4 w-4" />Decline</button><button onClick={() => void decideRoomChange(row.request_id, 'APPROVE_AND_MOVE')} className="inline-flex items-center gap-1 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><Check className="h-4 w-4" />Approve and move</button></div>}
                  {row.status === 'PROPOSED' && <p className="text-xs text-slate-500">Waiting on the other resident.</p>}
                </article>)}
                {!roomChanges.length && <p className="py-8 text-center text-sm text-slate-500">No room change requests yet.</p>}
              </div>
            </section>}

            {view === 'tenants' && <section className="space-y-4 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Tenants and KYC records</h2><div className="flex gap-1">{['', 'ACTIVE', 'NOTICE_PERIOD', 'RESERVED', 'CHECKED_OUT'].map((status) => <button key={status} onClick={() => setTenantFilter(status)} className={`border px-2.5 py-1.5 text-xs font-semibold ${tenantFilter === status ? 'border-[#02224B] bg-[#02224B] text-white' : 'border-slate-300 text-slate-600'}`}>{status ? status.replace('_', ' ') : 'All'}</button>)}</div></div>
              {tenants.filter((tenant) => !tenantFilter || tenant.status === tenantFilter).map((tenant) => <article key={tenant.id} className="border border-slate-200 bg-white p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[#02224B]">{tenant.name}</h3><span className="text-xs font-semibold uppercase text-slate-500">{tenant.status.replace('_', ' ')}</span></div><p className="mt-1 text-sm text-slate-500">{tenant.property.name} · {tenant.bed ? `Room ${tenant.bed.room.roomNumber}, ${tenant.bed.label}` : 'No bed assigned'}</p><p className="mt-1 text-sm text-slate-600">{tenant.phone} · ₹{tenant.monthlyRent.toLocaleString('en-IN')} / month · Deposit ₹{tenant.depositReceived.toLocaleString('en-IN')} / ₹{tenant.depositAmount.toLocaleString('en-IN')}</p></div>
                  <div className="flex gap-2">{tenant.status === 'RESERVED' && <button onClick={() => void updateTenantStay(tenant.id, 'check-in')} className="bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Check in</button>}{tenant.status === 'ACTIVE' && <button onClick={() => setCheckoutTenantId(checkoutTenantId === tenant.id ? '' : tenant.id)} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Check out</button>}
                  {tenant.status === 'CHECKED_OUT' && tenant.depositRefundStatus === 'PENDING' && <span className="inline-flex items-center border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Refund due ₹{(tenant.depositRefundAmount || 0).toLocaleString('en-IN')}</span>}{tenant.kycDocumentUrl && <button type="button" onClick={() => void viewKycDocument(tenant.kycDocumentUrl!)} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">View KYC</button>}{tenant.kycDocumentUrl && !tenant.kycVerified && <button type="button" onClick={() => void verifyKyc(tenant.id, true)} className="border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700">Verify KYC</button>}{tenant.kycVerified && <button type="button" onClick={() => void verifyKyc(tenant.id, false)} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500">KYC verified · revoke</button>}{tenant.foodOptOut ? <button type="button" onClick={() => void setFoodOptOut(tenant.id, false)} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500">Food off · turn on</button> : <button type="button" onClick={() => void setFoodOptOut(tenant.id, true)} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Food on · opt out</button>}</div>
                </div>
                <form onSubmit={(event) => void updateTenant(event, tenant.id)} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                  <input name="permanentAddress" defaultValue={tenant.permanentAddress || ''} placeholder="Permanent address" className="border border-slate-300 px-3 py-2 text-sm" />
                  <input name="institutionOrEmployer" defaultValue={tenant.institutionOrEmployer || ''} placeholder="College / employer" className="border border-slate-300 px-3 py-2 text-sm" />
                  <input name="emergencyName" defaultValue={tenant.emergencyName || ''} placeholder="Emergency contact name" className="border border-slate-300 px-3 py-2 text-sm" />
                  <input name="emergencyPhone" defaultValue={tenant.emergencyPhone || ''} placeholder="Emergency contact phone" className="border border-slate-300 px-3 py-2 text-sm" />
                  <select name="bloodGroup" defaultValue={tenant.bloodGroup || ''} className="border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Blood group</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group}>{group}</option>)}</select>
                  <select name="kycType" defaultValue={tenant.kycType || ''} className="border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">KYC document type</option>{['AADHAAR', 'PAN', 'PASSPORT', 'DRIVING_LICENSE', 'STUDENT_ID', 'WORK_ID'].map((type) => <option key={type}>{type}</option>)}</select>
                  <input name="kycDocument" type="file" accept="image/*,application/pdf" className="border border-slate-300 px-2 py-1.5 text-xs sm:col-span-2" />
                  <button disabled={saving} className="bg-[#02224B] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Save resident record</button>
                </form>
                {checkoutTenantId === tenant.id && tenant.status === 'ACTIVE' && <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void updateTenantStay(tenant.id, 'check-out', { depositDeductions: Number(form.get('depositDeductions') || 0), checkoutNote: String(form.get('checkoutNote') || '') }); }} className="mt-4 grid gap-3 border-t border-amber-100 bg-amber-50/60 p-4 sm:grid-cols-[1fr_1.5fr_auto_auto]"><label className="text-sm text-slate-700">Deposit deductions (₹, max {(tenant.depositReceived || 0).toLocaleString('en-IN')})<input name="depositDeductions" type="number" min="0" max={tenant.depositReceived || 0} defaultValue="0" className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label><label className="text-sm text-slate-700">Inspection / checkout note<input name="checkoutNote" placeholder="Room condition, damages…" className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2" /></label><button className="self-end bg-red-700 px-3 py-2 text-sm font-semibold text-white">Confirm check-out</button><button type="button" onClick={() => setCheckoutTenantId('')} className="self-end border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><p className="text-xs text-slate-500 sm:col-span-4">Refund due = deposit received − deductions. It stays Pending until you mark it refunded below.</p></form>}
                {tenant.status === 'CHECKED_OUT' && (tenant.depositDeductions || tenant.checkoutNote) ? <p className="mt-3 text-sm text-slate-600">Check-out: deductions ₹{(tenant.depositDeductions || 0).toLocaleString('en-IN')}{tenant.checkoutNote ? ` · ${tenant.checkoutNote}` : ''} · Refund {tenant.depositRefundStatus?.toLowerCase().replace('_', ' ')}{(tenant.depositRefundAmount ?? 0) > 0 ? ` ₹${(tenant.depositRefundAmount || 0).toLocaleString('en-IN')}` : ''}{tenant.depositRefundReference ? ` · Ref ${tenant.depositRefundReference}` : ''}</p> : null}
                {tenant.status === 'CHECKED_OUT' && tenant.depositRefundStatus === 'PENDING' && summary.canManageStaff && <form onSubmit={(event) => { event.preventDefault(); void markDepositRefunded(tenant.id); }} className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} placeholder="Refund UPI / transaction reference" className="w-full border border-slate-300 px-3 py-2 text-sm sm:w-80" /><button className="bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Mark refunded</button></form>}
              </article>)}
              {!tenants.length && <p className="border-y border-slate-200 py-8 text-center text-sm text-slate-500">Approved bookings will appear here for check-in.</p>}
            </section>}

            {view === 'rent' && <section className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Rent and deposit ledger</h2><button onClick={() => void sendReminders()} disabled={reminding} className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60">{reminding ? 'Sending…' : 'Send due reminders'}</button></div><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{rentEntries.map((entry) => <article key={entry.id} className="py-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{entry.tenant.name}</h3><span className="text-xs font-semibold uppercase text-slate-500">{entry.entryType} · {entry.period}</span><span className="text-xs font-semibold uppercase text-amber-700">{entry.status}</span></div><p className="mt-1 text-sm text-slate-500">{entry.tenant.property.name}{entry.tenant.bed ? ` · Room ${entry.tenant.bed.room.roomNumber}, ${entry.tenant.bed.label}` : ''} · Due {new Date(entry.dueDate).toLocaleDateString()}</p><p className="mt-1 text-sm text-slate-700">₹{entry.paidAmount.toLocaleString('en-IN')} paid of ₹{entry.amount.toLocaleString('en-IN')}{entry.method ? ` · ${entry.method}` : ''}{entry.reference ? ` · Ref ${entry.reference}` : ''}</p></div></div>{entry.status !== 'PAID' && <form onSubmit={(event) => void recordPayment(event, entry.id)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]"><input required name="amount" type="number" min="1" max={entry.amount - entry.paidAmount} defaultValue={entry.amount - entry.paidAmount} aria-label="Payment amount" className="border border-slate-300 px-3 py-2 text-sm" /><select name="method" className="border border-slate-300 bg-white px-3 py-2 text-sm"><option value="CASH">Cash</option><option value="NEFT">NEFT</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select><input name="reference" placeholder="Receipt / transaction reference" className="border border-slate-300 px-3 py-2 text-sm" /><button className="bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Record payment</button></form>}</article>)}{!rentEntries.length && <p className="py-8 text-center text-sm text-slate-500">No rent entries yet.</p>}</div></div>
              <form onSubmit={addRentEntry} className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-7"><h2 className="font-semibold">Add ledger charge</h2><div className="mt-4 space-y-3"><select required {...rentFormApi.register('tenantId')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Select resident</option>{tenants.filter((tenant) => tenant.status === 'ACTIVE').map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.property.name}</option>)}</select><select {...rentFormApi.register('period')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value={new Date().toISOString().slice(0, 7)}>{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option><option value="DEPOSIT">Security deposit</option></select><input required type="number" min="1" placeholder="Amount" {...rentFormApi.register('amount')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /><input required type="date" {...rentFormApi.register('dueDate')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /></div><button disabled={saving || !tenants.some((tenant) => tenant.status === 'ACTIVE')} className="mt-4 inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" />Add charge</button></form>
            </section>}

            {view === 'expenses' && <section className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_340px]"><div><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Property expenses</h2><span className="text-sm font-semibold text-[#02224B]">₹{expenseTotal.toLocaleString('en-IN')} total</span></div><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{expenses.map((entry) => <article key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">₹{entry.amount.toLocaleString('en-IN')} · {entry.category}</p><p className="text-xs text-slate-500">{entry.property.name} · {new Date(entry.spentOn).toLocaleDateString()}{entry.note ? ` · ${entry.note}` : ''}</p></div><button onClick={() => void removeExpense(entry.id)} className="text-xs font-semibold text-red-700 hover:underline">Remove</button></article>)}{!expenses.length && <p className="py-8 text-center text-sm text-slate-500">No expenses yet.</p>}</div></div><form onSubmit={submitExpense} className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-7"><h2 className="font-semibold">Log expense</h2><div className="mt-4 space-y-3"><select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm">{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><select {...expenseFormApi.register('category')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm">{['FOOD', 'STAFF', 'MAINTENANCE', 'UTILITIES', 'OTHER'].map((category) => <option key={category} value={category}>{category}</option>)}</select><input required type="number" min="1" placeholder="Amount" {...expenseFormApi.register('amount')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /><input required type="date" {...expenseFormApi.register('spentOn')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /><input placeholder="Note (optional)" {...expenseFormApi.register('note')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /></div><button disabled={saving || !selectedPropertyId} className="mt-4 inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" />Log expense</button></form></section>}
            {view === 'utilities' && <section className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_340px]"><div><h2 className="font-semibold">Electricity bills</h2><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{bills.map((bill) => <article key={bill.id} className="py-4"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">₹{bill.totalAmount.toLocaleString('en-IN')} · {bill.period}</p><p className="text-xs text-slate-500">{bill.property.name} · <span className="font-semibold uppercase">{bill.status}</span></p></div>{bill.status === 'DRAFT' && <button onClick={() => void approveBill(bill.id)} className="bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Review & approve</button>}</div><div className="mt-2 flex flex-wrap gap-2">{JSON.parse(bill.splitJson || '[]').map((row: { tenantName: string; roomNumber: string; share: number }) => <span key={row.tenantName} className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">{row.tenantName} · Room {row.roomNumber} · ₹{row.share.toLocaleString('en-IN')}</span>)}</div></article>)}{!bills.length && <p className="py-8 text-center text-sm text-slate-500">No electricity bills yet.</p>}</div></div><form onSubmit={proposeBill} className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-7"><h2 className="font-semibold">Propose split</h2><div className="mt-4 space-y-3"><select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm">{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><input required type="month" {...billFormApi.register('period')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /><input required type="number" min="1" placeholder="Bill total" {...billFormApi.register('totalAmount')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /></div><button disabled={saving || !selectedPropertyId} className="mt-4 inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" />Propose split</button></form></section>}
            {view === 'reports' && report && <section className="pt-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Monthly operations</p><h2 className="mt-1 text-xl font-semibold text-[#02224B]">Report · {report.period}</h2></div><div className="flex gap-2"><button onClick={exportReport} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Download className="h-4 w-4" />Export CSV</button><button onClick={exportReportExcel} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Download className="h-4 w-4" />Export Excel</button><button onClick={() => window.print()} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Print / PDF</button></div></div><div className="mt-5 grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">{[['Occupancy', `${report.occupancyRate}%`], ['Available beds', report.availableBeds], ['Rent charged', `₹${report.rentCharged.toLocaleString('en-IN')}`], ['Rent collected', `₹${report.rentCollected.toLocaleString('en-IN')}`], ['Outstanding', `₹${report.outstanding.toLocaleString('en-IN')}`], ['New booking requests', report.newBookings]].map(([label, value]) => <div key={label} className="bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-[#02224B]">{value}</p></div>)}</div></section>}

            {view === 'activity' && <section className="pt-6"><h2 className="font-semibold">Activity log</h2><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{activity.map((entry) => <div key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{entry.action.replace(/_/g, ' ')}{entry.detail ? <span className="font-normal text-slate-600"> · {entry.detail}</span> : null}</p><p className="text-xs text-slate-500">{entry.actorName || 'System'}{entry.entityType ? ` · ${entry.entityType}` : ''}</p></div><span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span></div>)}{!activity.length && <p className="py-8 text-center text-sm text-slate-500">No activity yet.</p>}</div></section>}

            {view === 'staff' && summary.canManageStaff && <section className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div><h2 className="font-semibold">Property wardens</h2><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{staff.map((member) => <article key={`${member.property.id}-${member.id}`} className="flex items-center justify-between gap-4 py-4"><div><p className="font-semibold">{member.name}</p><p className="mt-1 text-sm text-slate-500">{member.property.name} · {member.phone}{member.email ? ` · ${member.email}` : ''}</p></div><button onClick={() => void removeStaff(member)} className="border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Remove access</button></article>)}{!staff.length && <p className="py-6 text-sm text-slate-500">No wardens assigned yet.</p>}</div></div>
              <form onSubmit={addStaff} className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-7"><h2 className="font-semibold">Add a warden</h2><div className="mt-4 space-y-3"><select required {...staffFormApi.register('propertyId')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Assign property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><input required placeholder="Full name" {...staffFormApi.register('name')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /><input required type="tel" placeholder="Phone number" {...staffFormApi.register('phone')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /><input type="email" placeholder="Email (optional)" {...staffFormApi.register('email')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /><input required type="password" minLength={8} placeholder="Temporary password" {...staffFormApi.register('password')} className="w-full border border-slate-300 px-3 py-2.5 text-sm" /></div><button disabled={saving} className="mt-4 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Create warden account</button></form>
            </section>}

            {view === 'maintenance' && <section className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div><h2 className="font-semibold">Maintenance tickets</h2><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{tickets.map((ticket) => <article key={ticket.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{ticket.title}</h3><span className="text-xs font-semibold uppercase text-amber-700">{ticket.priority}</span><span className="text-xs uppercase text-slate-500">{ticket.status.replace('_', ' ')}</span></div><p className="mt-1 text-sm text-slate-500">{ticket.property.name} · {ticket.category}{ticket.tenant ? ` · ${ticket.tenant.name}` : ''}{ticket.assignedName ? ` · Assigned to ${ticket.assignedName}` : ''}</p><p className="mt-2 text-sm text-slate-700">{ticket.description}</p>{ticket.imageUrl && <p className="mt-2 text-xs text-slate-500">Photo attached</p>}</div>{ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && <button onClick={() => void updateTicket(ticket.id, 'RESOLVED')} className="shrink-0 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Mark resolved</button>}</article>)}{!tickets.length && <p className="py-8 text-center text-sm text-slate-500">No maintenance tickets yet.</p>}</div></div>
              <form onSubmit={createTicket} className="border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-7"><h2 className="font-semibold">Log maintenance</h2><div className="mt-4 space-y-3"><select required value={selectedPropertyId} onChange={(event) => { setSelectedPropertyId(event.target.value); ticketFormApi.setValue('assignedTo', ''); }} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><select {...ticketFormApi.register('assignedTo')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Unassigned</option>{staff.filter((member) => member.property.id === selectedPropertyId).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><input required placeholder="Issue title" {...ticketFormApi.register('title')} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm" /><textarea required rows={3} placeholder="Describe the issue" {...ticketFormApi.register('description')} className="w-full resize-y border border-slate-300 bg-white px-3 py-2.5 text-sm" /><div className="grid grid-cols-2 gap-3"><select {...ticketFormApi.register('category')} className="min-w-0 border border-slate-300 bg-white px-3 py-2.5 text-sm"><option>PLUMBING</option><option>ELECTRICAL</option><option>APPLIANCE</option><option>CLEANING</option><option>OTHER</option></select><select {...ticketFormApi.register('priority')} className="min-w-0 border border-slate-300 bg-white px-3 py-2.5 text-sm"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></div><label className="block text-sm text-slate-600">Photo<input type="file" accept="image/*" onChange={(event) => setTicketImage(event.target.files?.[0] || null)} className="mt-1.5 block w-full text-sm file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2" /></label></div><button disabled={saving || !properties.length} className="mt-4 inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Plus className="h-4 w-4" />Create ticket</button></form>
            </section>}
          </>
        )}
      </div>
  );
}