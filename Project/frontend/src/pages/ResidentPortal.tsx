import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { paymentClaimSchema, residentProfileSchema, residentTicketSchema, type PaymentClaimForm, type ResidentProfileForm, type ResidentTicketForm } from '../validation/forms';
import { AlertCircle, ArrowLeftRight, Bell, Building2, Check, Download, History, Loader2, LogOut, Menu, Plus, ReceiptIndianRupee, Send, UserRound, UtensilsCrossed, Wallet, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/auth';
import { SidebarProvider } from '../context/SidebarContext';
import { useSidebar } from '../context/sidebar';
import Sidebar from '../components/layout/Sidebar';
import { Link, useParams } from 'react-router-dom';
import { RESIDENT_SITE_KEY, RESIDENT_TOKEN_KEY } from '../utils/session';
import { ROUTES } from '../utils/app-areas';
import { useOtpCooldown } from '../hooks/useOtpCooldown';
import AIChatPanel from '../components/AIChatPanel';
import RoomChange from '../components/RoomChange';
import FoodPreferences from '../components/FoodPreferences';
import MoneyOverview from '../components/MoneyOverview';
import StayServices from '../components/StayServices';
import SplitAuthLayout from '../components/SplitAuthLayout';
import { apiErrorMessage } from '../utils/api-error';
import { phoneOtpErrorMessage, startPhoneVerification, type PhoneChallenge } from '../utils/phone-otp';

type Stay = {
  id: string; name: string; status: string; monthlyRent: number; depositAmount: number;
  depositReceived: number; depositDeductions?: number; depositRefundAmount?: number | null;
  depositRefundStatus?: string; depositRefundReference?: string | null; noticeDate?: string | null;
  moveInDate: string; moveOutDate?: string | null;
  checkedInAt?: string | null; checkedOutAt?: string | null; checkoutNote?: string | null;
  permanentAddress?: string | null; bloodGroup?: string | null; institutionOrEmployer?: string | null;
  emergencyName?: string | null; emergencyPhone?: string | null; kycType?: string | null;
  kycDocumentUrl?: string | null; kycVerified?: boolean; foodOptOut?: boolean;
  property: { id: string; name: string; address: string; locality: string; city: string; contactPhone?: string | null; upiId?: string | null };
  bed?: { label: string; room: { roomNumber: string; roomType: string; foodIncluded?: boolean; foodCharge?: number | null } } | null;
  rentEntries: { id: string; period: string; entryType: string; amount: number; paidAmount: number; status: string; method?: string | null; reference?: string | null; dueDate: string }[];
};

type MaintenanceTicket = {
  id: string; tenantId: string; title: string; description: string; category: string;
  priority: string; status: string; createdAt: string;
};

type ResidentNotification = { id: string; type: string; title: string; message: string; entityId?: string | null; readAt?: string | null; createdAt: string };
type PaymentClaim = { id: string; tenantId: string; rentEntryId: string; amount: number; reference: string; status: string; responseNote?: string | null; createdAt: string; rentEntry: { id: string; entryType: string; period: string } };

const NO_STAYS: Stay[] = [];
const NO_TICKETS: MaintenanceTicket[] = [];
const NO_NOTIFICATIONS: ResidentNotification[] = [];
const NO_CLAIMS: PaymentClaim[] = [];
const EMPTY_TICKET: ResidentTicketForm = { tenantId: '', title: '', description: '', category: 'OTHER' };
const EMPTY_PAYMENT: PaymentClaimForm = { tenantId: '', rentEntryId: '', amount: '', reference: '' };
const EMPTY_PROFILE: ResidentProfileForm = { permanentAddress: '', bloodGroup: '', institutionOrEmployer: '', emergencyName: '', emergencyPhone: '', kycType: '', foodOptOut: false };

type PgSite = { slug: string; name: string; locality: string | null; city: string | null };

/** The resident site of one PG: /stay/<slug>. */
export default function ResidentPortal() {
  const slug = String(useParams().slug || '').toLowerCase();
  const { data: site, isPending, isError } = useQuery({
    queryKey: ['pg-site', slug],
    queryFn: async (): Promise<PgSite> => (await api.get(`/pg/sites/${encodeURIComponent(slug)}`)).data,
    retry: false
  });
  if (isPending) return <div className="flex min-h-screen items-center justify-center bg-[#F8FAFB]"><Loader2 className="h-8 w-8 animate-spin text-[#02224B]" /></div>;
  if (isError || !site) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <section>
          <h1 className="text-2xl font-bold text-slate-900">PG site not found</h1>
          <p className="mt-2 text-sm text-slate-600">This resident link doesn't match any PG. Check the link your PG shared, or find your PG.</p>
          <Link to={ROUTES.residentFinder} className="mt-4 inline-block font-bold text-[#02224B] hover:underline">Find your PG →</Link>
        </section>
      </main>
    );
  }
  return (
    <SidebarProvider>
      <ResidentPortalView key={site.slug} site={site} />
    </SidebarProvider>
  );
}

/** A saved resident session counts only on the PG site it was opened on. */
const hasSessionFor = (slug: string) => Boolean(localStorage.getItem(RESIDENT_TOKEN_KEY)) && localStorage.getItem(RESIDENT_SITE_KEY) === slug;

function ResidentPortalView({ site }: { site: PgSite }) {
  const { login, logout: clearSession } = useAuth();
  const { setSectionNav, toggle } = useSidebar();
  const [step, setStep] = useState<'phone' | 'code' | 'portal'>(() => (hasSessionFor(site.slug) ? 'portal' : 'phone'));
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const challenge = useRef<PhoneChallenge<'TENANT_LOGIN'> | null>(null);
  const [loading, setLoading] = useState(false);
  const { cooldown, startCooldown } = useOtpCooldown();
  const [activeTab, setActiveTab] = useState<'stays' | 'money' | 'food' | 'services' | 'maintenance' | 'roomchange' | 'notifications' | 'profile'>('stays');
  const [ticketFormFor, setTicketFormFor] = useState('');
  const [profileEditingFor, setProfileEditingFor] = useState('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [paymentFormFor, setPaymentFormFor] = useState('');

  // Portal data: one query (polled every 30s while signed in), refreshed after actions.
  const queryClient = useQueryClient();
  const { data: portal } = useQuery({
    queryKey: ['resident', 'portal'],
    queryFn: async () => {
      const [stayResponse, ticketResponse, notificationResponse, claimResponse] = await Promise.all([
        api.get('/pg/tenant/stays'),
        api.get('/pg/tenant/maintenance'),
        api.get('/pg/tenant/notifications'),
        api.get('/pg/tenant/payment-claims')
      ]);
      return {
        stays: stayResponse.data as Stay[],
        tickets: ticketResponse.data as MaintenanceTicket[],
        notifications: (notificationResponse.data.notifications || []) as ResidentNotification[],
        paymentClaims: (claimResponse.data || []) as PaymentClaim[]
      };
    },
    enabled: step === 'portal',
    refetchInterval: 30_000,
    meta: { errorMessage: 'Could not load resident account' }
  });
  const stays = portal?.stays ?? NO_STAYS;
  const tickets = portal?.tickets ?? NO_TICKETS;
  const notifications = portal?.notifications ?? NO_NOTIFICATIONS;
  const paymentClaims = portal?.paymentClaims ?? NO_CLAIMS;
  const refreshResidentData = () => queryClient.invalidateQueries({ queryKey: ['resident', 'portal'] });

  const ticketFormApi = useForm<ResidentTicketForm>({ resolver: zodResolver(residentTicketSchema), defaultValues: EMPTY_TICKET });
  const submittingTicket = ticketFormApi.formState.isSubmitting;
  const paymentFormApi = useForm<PaymentClaimForm>({ resolver: zodResolver(paymentClaimSchema), defaultValues: EMPTY_PAYMENT });
  const submittingPayment = paymentFormApi.formState.isSubmitting;
  const profileFormApi = useForm<ResidentProfileForm>({ resolver: zodResolver(residentProfileSchema), defaultValues: EMPTY_PROFILE });
  const savingProfile = profileFormApi.formState.isSubmitting;
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      challenge.current = await startPhoneVerification(phone, 'TENANT_LOGIN');
      if (challenge.current.devCode) toast.success(`Demo code: ${challenge.current.devCode}`);
      else toast.success('Code sent');
      setStep('code');
      startCooldown();
    } catch (error) {
      toast.error(phoneOtpErrorMessage(error, 'Could not send code'));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!challenge.current) {
      toast.error('Request a new code first');
      return;
    }
    setLoading(true);
    try {
      const data = await challenge.current.verify(code);
      login(data.token, data.user);
      localStorage.setItem(RESIDENT_SITE_KEY, site.slug);
      setStep('portal');
      toast.success('Welcome back');
    } catch (error) {
      toast.error(phoneOtpErrorMessage(error, 'Invalid code'));
    } finally {
      setLoading(false);
    }
  };

  const submitNotice = async (stayId: string) => {
    if (!window.confirm('Submit your vacating notice? Your warden will plan the checkout.')) return;
    try {
      await api.post(`/pg/tenant/${stayId}/notice`);
      toast.success('Notice submitted');
      await refreshResidentData();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not submit notice'));
    }
  };

  const cancelNotice = async (stayId: string) => {
    if (!window.confirm('Cancel your vacating notice?')) return;
    try {
      await api.post(`/pg/tenant/${stayId}/notice-cancel`);
      toast.success('Vacating notice cancelled');
      await refreshResidentData();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not cancel notice'));
    }
  };

  const openTicketForm = (stayId: string) => {
    setTicketFormFor(stayId);
    ticketFormApi.reset({ ...EMPTY_TICKET, tenantId: stayId });
  };

  const submitTicket = ticketFormApi.handleSubmit(async (form) => {
    try {
      await api.post('/pg/tenant/maintenance', form);
      toast.success('Maintenance request sent');
      setTicketFormFor('');
      ticketFormApi.reset(EMPTY_TICKET);
      await refreshResidentData();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not send maintenance request'));
    }
  });

  const editProfile = (stay: Stay) => {
    setProfileEditingFor(stay.id);
    setProfileFile(null);
    profileFormApi.reset({
      permanentAddress: stay.permanentAddress || '',
      bloodGroup: (stay.bloodGroup || '') as ResidentProfileForm['bloodGroup'],
      institutionOrEmployer: stay.institutionOrEmployer || '',
      emergencyName: stay.emergencyName || '',
      emergencyPhone: stay.emergencyPhone || '',
      kycType: stay.kycType || '',
      foodOptOut: Boolean(stay.foodOptOut)
    });
  };

  const saveProfile = (stayId: string) => profileFormApi.handleSubmit(async (form) => {
    try {
      let kycDocumentUrl: string | undefined;
      if (profileFile) {
        const upload = new FormData();
        upload.append('image', profileFile);
        const result = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
        kycDocumentUrl = result.data.fileKey;
      }
      await api.patch(`/pg/tenant/${stayId}/profile`, { ...form, ...(kycDocumentUrl ? { kycDocumentUrl } : {}) });
      toast.success('Profile saved. New KYC documents need owner verification.');
      setProfileEditingFor('');
      setProfileFile(null);
      await refreshResidentData();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save profile'));
    }
  });

  const startPaymentClaim = (stay: Stay, entry: Stay['rentEntries'][number]) => {
    setPaymentFormFor(entry.id);
    paymentFormApi.reset({ tenantId: stay.id, rentEntryId: entry.id, amount: String(Math.max(0, entry.amount - entry.paidAmount)), reference: '' });
  };

  const submitPaymentClaim = paymentFormApi.handleSubmit(async (form) => {
    try {
      await api.post('/pg/tenant/payment-claims', { ...form, amount: Number(form.amount) });
      toast.success('Payment submitted for PG verification');
      setPaymentFormFor('');
      paymentFormApi.reset(EMPTY_PAYMENT);
      await refreshResidentData();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not submit payment'));
    }
  });

  const markNotificationRead = async (notificationId: string) => {
    try {
      await api.patch(`/pg/tenant/notifications/${notificationId}/read`);
      queryClient.setQueryData(['resident', 'portal'], (current: typeof portal) => current && {
        ...current,
        notifications: current.notifications.map((notification) => notification.id === notificationId ? { ...notification, readAt: new Date().toISOString() } : notification)
      });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update notification'));
    }
  };

  const exportReceipts = (stay: Stay) => {
    const rows = [
      ['Resident', stay.name], ['Property', stay.property.name], ['Period', 'Type', 'Amount', 'Paid', 'Status', 'Method', 'Reference'],
      ...stay.rentEntries.map((e) => [e.period, e.entryType, e.amount, e.paidAmount, e.status, e.method || '', e.reference || ''])
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipts-${stay.id.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const logout = () => {
    clearSession('PG_TENANT');
    localStorage.removeItem(RESIDENT_SITE_KEY);
    queryClient.removeQueries({ queryKey: ['resident'] });
    setStep('phone');
  };

  const sections = useMemo(() => [
    { id: 'stays', label: 'My stays', icon: Building2 },
    { id: 'money', label: 'Money', icon: Wallet },
    { id: 'food', label: 'Food', icon: UtensilsCrossed },
    { id: 'services', label: 'Services', icon: History },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'roomchange', label: 'Room change', icon: ArrowLeftRight },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'profile', label: 'Profile', icon: UserRound }
  ] as const, []);

  useEffect(() => {
    if (step !== 'portal') return;
    setSectionNav(sections.map(({ id, label, icon }) => ({ id, label, icon, active: id === activeTab, onSelect: () => setActiveTab(id as typeof activeTab) })));
    return () => setSectionNav(null);
  }, [sections, activeTab, step, setSectionNav]);

  if (step !== 'portal') {
    return (
      <SplitAuthLayout
        panelTitle="Your stay, in your pocket"
        panelCopy="Sign in with the phone number on your stay. Rent, food, maintenance and room requests, all in one place."
        bullets={[
          { icon: Building2, heading: 'Your stays', text: 'Rooms, rent and deposits' },
          { icon: ReceiptIndianRupee, heading: 'Money clarity', text: 'Dues and verifications' },
          { icon: Wrench, heading: 'Get help fast', text: 'Maintenance and room changes' }
        ]}
        mobileTitle={site.name}
        mobileSubtitle="Resident login · use the phone number on your stay."
      >
        <div className="hidden lg:block">
          <p className="text-xs font-bold uppercase text-amber-700">Resident login</p>
          <h1 className="mt-1 text-2xl font-bold text-[#02224B]">{site.name}</h1>
          {site.locality && <p className="text-sm text-slate-500">{[site.locality, site.city].filter(Boolean).join(', ')}</p>}
          <p className="mt-2 text-sm text-slate-500">Log in with the phone number on your stay. No password needed.</p>
        </div>
          {step === 'phone' ? (<>
            <form onSubmit={requestCode} className="mt-5 space-y-3">
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={loading || cooldown > 0} className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}</button>
            </form>
            <p className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
              Not staying here yet?{' '}
              <a href={ROUTES.guestHome} className="font-bold text-[#02224B] hover:underline">Browse PGs</a>
              {' · '}
              <Link to={ROUTES.residentFinder} className="font-bold text-[#02224B] hover:underline">Different PG</Link>
            </p>
          </>) : (
            <form onSubmit={verifyCode} className="mt-5 space-y-3">
              <input required aria-label="6-digit verification code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" inputMode="numeric" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={loading} className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Verify & open my stays</button>
              <button type="button" onClick={() => setStep('phone')} className="text-sm font-semibold text-slate-500">Use a different number</button>
            </form>
          )}
      </SplitAuthLayout>
    );
  }



  return (
    <div className="flex h-[100dvh] bg-[#F8FAFB] text-slate-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button onClick={toggle} aria-label="Open navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu className="h-6 w-6" /></button>
            <span className="flex items-center gap-2 font-semibold text-[#02224B]"><Building2 className="h-5 w-5" /> {site.name}</span>
            {stays[0] && <span className="hidden items-center gap-1.5 text-sm font-medium text-slate-500 md:inline-flex"><UserRound className="h-4 w-4" />{stays[0].name}</span>}
          </div>
          <div className="flex items-center gap-2 text-sm md:gap-3">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500" aria-label={`${unreadCount} unread notifications`}><Bell className="h-4 w-4" />{unreadCount}</span>
            <button onClick={logout} className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-[#02224B]"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-5xl">
        {activeTab === 'stays' && (<div className="space-y-4">
          {!stays.length && <p className="border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No stays found for this number.</p>}
          {stays.map((stay) => (
          <article key={stay.id} className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#02224B]">{stay.property.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{stay.property.address}, {stay.property.locality}, {stay.property.city}{stay.bed ? ` · Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''}</p>
                <p className="mt-1 text-xs font-semibold uppercase text-slate-500">{stay.status.replace('_', ' ')}{stay.status === 'NOTICE_PERIOD' && stay.noticeDate ? ` · since ${new Date(stay.noticeDate).toLocaleDateString()}` : ''}</p>
                <p className="mt-1 text-sm text-slate-600">₹{stay.monthlyRent.toLocaleString('en-IN')} / month · Deposit ₹{(stay.depositReceived || 0).toLocaleString('en-IN')} / ₹{(stay.depositAmount || 0).toLocaleString('en-IN')}{stay.depositRefundStatus === 'PENDING' ? ` · Refund due ₹${(stay.depositRefundAmount || 0).toLocaleString('en-IN')}` : ''}</p>
              </div>
              <div className="flex flex-col gap-2">
                {stay.status === 'ACTIVE' && <button onClick={() => void submitNotice(stay.id)} className="border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800">Give vacating notice</button>}
                {stay.status === 'NOTICE_PERIOD' && <button onClick={() => void cancelNotice(stay.id)} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel vacating notice</button>}
                <button onClick={() => exportReceipts(stay)} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Download className="h-4 w-4" />Receipts</button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              {stay.rentEntries.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="flex items-center gap-2 text-slate-700"><ReceiptIndianRupee className="h-4 w-4 text-slate-400" />{entry.period} · {entry.entryType}</p><p className="mt-1 text-slate-600">₹{entry.paidAmount.toLocaleString('en-IN')} / ₹{entry.amount.toLocaleString('en-IN')} · {entry.status}{entry.reference ? ` · Ref ${entry.reference}` : ''}</p></div>
                  {entry.status !== 'PAID' && stay.property.upiId && ['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && <div className="flex flex-wrap items-center gap-2">
                    <a href={`upi://pay?pa=${encodeURIComponent(stay.property.upiId)}&pn=${encodeURIComponent(stay.property.name)}&am=${((entry.amount - entry.paidAmount) || 0).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`${entry.period} ${entry.entryType}`)}`} className="border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Pay with UPI</a>
                    {paymentClaims.some((claim) => claim.rentEntryId === entry.id && claim.status === 'PENDING') ? <span className="text-xs font-semibold uppercase text-amber-700">Verification pending</span> : <button onClick={() => startPaymentClaim(stay, entry)} className="bg-[#02224B] px-3 py-2 text-sm font-semibold text-white">I paid</button>}
                  </div>}
                  {paymentFormFor === entry.id && <form onSubmit={submitPaymentClaim} className="grid w-full gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1.5fr_auto]">
                    <label className="text-xs font-medium text-slate-600">Amount paid
                      <input required type="number" min="0.01" max={entry.amount - entry.paidAmount} step="0.01" {...paymentFormApi.register('amount')} className="mt-1 block w-full border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">UPI transaction reference
                      <input required minLength={6} maxLength={80} {...paymentFormApi.register('reference')} placeholder="UPI reference / UTR" className="mt-1 block w-full border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                    {Object.values(paymentFormApi.formState.errors)[0]?.message && <p role="alert" className="text-xs font-medium text-red-600 sm:col-span-3">{Object.values(paymentFormApi.formState.errors)[0]?.message}</p>}
                    <button disabled={submittingPayment} className="self-end bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{submittingPayment ? 'Submitting…' : 'Submit for verification'}</button>
                  </form>}
                </div>
              ))}
              {!stay.rentEntries.length && <p className="py-3 text-sm text-slate-500">No invoices yet.</p>}
            </div>
            {paymentClaims.some((claim) => claim.tenantId === stay.id) && <section className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="font-semibold text-slate-900">UPI payment verification</h3>
              <div className="mt-2 divide-y divide-slate-100">
                {paymentClaims.filter((claim) => claim.tenantId === stay.id).map((claim) => <article key={claim.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-slate-700">₹{claim.amount.toLocaleString('en-IN')} · {claim.rentEntry.entryType} {claim.rentEntry.period}</p><span className={`text-xs font-semibold uppercase ${claim.status === 'PENDING' ? 'text-amber-700' : claim.status === 'APPROVED' ? 'text-emerald-700' : 'text-red-700'}`}>{claim.status}</span></div>
                  <p className="mt-1 text-xs text-slate-500">Reference {claim.reference} · {new Date(claim.createdAt).toLocaleDateString()}</p>
                  {claim.responseNote && <p className="mt-1 text-sm text-red-700">{claim.responseNote}</p>}
                </article>)}
              </div>
            </section>}
          </article>
          ))}
        </div>)}
        {activeTab === 'profile' && (<div className="space-y-4">
          {!stays.length && <p className="border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No stays found for this number.</p>}
          {stays.map((stay) => (
          <article key={stay.id} className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-semibold text-[#02224B]">{stay.property.name}</h2>
              <p className="text-xs font-semibold uppercase text-slate-500">{stay.status.replace('_', ' ')}{stay.bed ? ` · Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''}</p>
            </div>
            <section className="pt-4">
              <div><h3 className="font-semibold text-slate-900">Resident profile & KYC</h3><p className="mt-1 text-xs text-slate-500">KYC documents remain private and require PG verification.</p></div>
                {profileEditingFor !== stay.id && <div className="mt-3 flex justify-end"><button onClick={() => editProfile(stay)} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><UserRound className="h-4 w-4" />Edit profile</button></div>}
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                {stay.permanentAddress && <span>{stay.permanentAddress}</span>}{stay.institutionOrEmployer && <span>{stay.institutionOrEmployer}</span>}{stay.emergencyName && <span>Emergency contact: {stay.emergencyName}{stay.emergencyPhone ? ` · ${stay.emergencyPhone}` : ''}</span>}
                <span>KYC {stay.kycVerified ? 'verified' : stay.kycDocumentUrl ? 'submitted, awaiting review' : 'not submitted'}</span>
              </div>
              {profileEditingFor === stay.id && <form onSubmit={saveProfile(stay.id)} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Permanent address<input maxLength={200} {...profileFormApi.register('permanentAddress')} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm font-medium text-slate-700">College / employer<input maxLength={200} {...profileFormApi.register('institutionOrEmployer')} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm font-medium text-slate-700">Emergency contact<input maxLength={200} {...profileFormApi.register('emergencyName')} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm font-medium text-slate-700">Emergency phone<input type="tel" maxLength={20} {...profileFormApi.register('emergencyPhone')} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm font-medium text-slate-700">Blood group<select {...profileFormApi.register('bloodGroup')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2"><option value="">Not provided</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700">KYC document type<select {...profileFormApi.register('kycType')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2"><option value="">Select document</option>{[['AADHAAR', 'Aadhaar'], ['PAN', 'PAN'], ['PASSPORT', 'Passport'], ['DRIVING_LICENSE', 'Driving license'], ['STUDENT_ID', 'Student ID'], ['WORK_ID', 'Work ID']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Replace KYC document<input type="file" accept="image/*,application/pdf" onChange={(event) => setProfileFile(event.target.files?.[0] || null)} className="mt-1 block w-full border border-slate-300 px-2 py-2 text-sm" /></label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" {...profileFormApi.register('foodOptOut')} />Opt out of included food</label>
                <div className="flex gap-2 sm:col-span-2"><button disabled={savingProfile} className="bg-[#02224B] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{savingProfile ? 'Saving…' : 'Save profile'}</button><button type="button" onClick={() => setProfileEditingFor('')} className="border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button></div>
              </form>}
              </section>
            </article>
          ))}
        </div>)}
        {activeTab === 'maintenance' && (<div className="space-y-4">
          {!stays.length && <p className="border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No stays found for this number.</p>}
          {stays.map((stay) => (
          <article key={stay.id} className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-semibold text-[#02224B]">{stay.property.name}</h2>
              <p className="text-xs font-semibold uppercase text-slate-500">{stay.status.replace('_', ' ')}{stay.bed ? ` · Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''}</p>
            </div>
            <section className="pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Wrench className="h-4 w-4 text-slate-500" />Maintenance requests</h3>
                {['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && ticketFormFor !== stay.id && <button onClick={() => openTicketForm(stay.id)} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Plus className="h-4 w-4" />Report an issue</button>}
              </div>
              <div className="mt-2 divide-y divide-slate-100">
                {tickets.filter((ticket) => ticket.tenantId === stay.id).map((ticket) => (
                  <article key={ticket.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{ticket.title}</p>
                      <span className="text-xs font-semibold uppercase text-amber-700">{ticket.status.replace('_', ' ')}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{ticket.category} · {new Date(ticket.createdAt).toLocaleDateString()}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{ticket.description}</p>
                  </article>
                ))}
                {!tickets.some((ticket) => ticket.tenantId === stay.id) && <p className="py-3 text-sm text-slate-500">No maintenance requests yet.</p>}
              </div>
              {ticketFormFor === stay.id && <form onSubmit={submitTicket} className="mt-3 space-y-3 border-t border-slate-100 pt-4">
                <label className="block text-sm font-medium text-slate-700">Issue category
                  <select {...ticketFormApi.register('category')} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2.5">
                    <option value="PLUMBING">Plumbing</option><option value="ELECTRICAL">Electrical</option><option value="APPLIANCE">Appliance</option><option value="CLEANING">Cleaning</option><option value="SAFETY">Safety</option><option value="PEST">Pest control</option><option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Title
                  <input required maxLength={120} {...ticketFormApi.register('title')} placeholder="What needs attention?" className="mt-1 block w-full border border-slate-300 px-3 py-2.5" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Details
                  <textarea required maxLength={2000} rows={3} {...ticketFormApi.register('description')} placeholder="Describe the issue and where it is." className="mt-1 block w-full resize-y border border-slate-300 px-3 py-2.5" />
                </label>
                {Object.values(ticketFormApi.formState.errors)[0]?.message && <p role="alert" className="text-xs font-medium text-red-600">{Object.values(ticketFormApi.formState.errors)[0]?.message}</p>}
                <div className="flex flex-wrap gap-2">
                  <button disabled={submittingTicket} className="inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{submittingTicket ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send request</button>
                  <button type="button" onClick={() => setTicketFormFor('')} className="border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button>
                </div>
              </form>}
              {!['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><AlertCircle className="h-3.5 w-3.5" />New requests are available during an active stay.</p>}
              </section>
            </article>
          ))}
        </div>)}
        {activeTab === 'roomchange' && <RoomChange />}
        {activeTab === 'money' && <MoneyOverview stays={stays} claims={paymentClaims} />}
        {activeTab === 'food' && <FoodPreferences stays={stays} onChanged={() => void refreshResidentData()} />}
        {activeTab === 'services' && <StayServices stays={stays} />}
        {activeTab === 'notifications' && (<div className="space-y-4">
          {notifications.length > 0 ? (
            <section className="border border-slate-200 bg-white px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Bell className="h-4 w-4" />Notifications</h2>
              <div className="mt-2 divide-y divide-slate-100">
                {notifications.slice(0, 8).map((notification) => <article key={notification.id} className={`flex items-start justify-between gap-4 py-3 ${notification.readAt ? 'opacity-70' : ''}`}>
                  <div><p className="font-medium text-slate-800">{notification.title}</p><p className="mt-1 text-sm text-slate-600">{notification.message}</p><p className="mt-1 text-xs text-slate-400">{new Date(notification.createdAt).toLocaleString()}</p></div>
                  {!notification.readAt && <button onClick={() => void markNotificationRead(notification.id)} aria-label="Mark notification as read" title="Mark as read" className="shrink-0 p-2 text-slate-500 hover:bg-slate-100"><Check className="h-4 w-4" /></button>}
                </article>)}
              </div>
            </section>
          ) : (
            <p className="border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No notifications yet.</p>
          )}
        </div>)}
          </div>
        </main>
        <AIChatPanel />
      </div>
    </div>
  );
}
