import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { paymentClaimSchema, residentProfileSchema, residentTicketSchema, type PaymentClaimForm, type ResidentProfileForm, type ResidentTicketForm } from '../validation/forms';
import { AlertCircle, ArrowLeftRight, Bell, Building2, Check, Download, History, Loader2, LogOut, Menu, Plus, ReceiptIndianRupee, Send, ShieldCheck, UserRound, UtensilsCrossed, Wallet, Wrench } from 'lucide-react';
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
import ResidentHome from '../components/ResidentHome';
import StatusPill from '../components/ui/StatusPill';
import { statusLabel } from '../utils/status';

const ENTRY_NAMES: Record<string, string> = { RENT: 'rent', FOOD: 'food', ELECTRICITY: 'electricity', DEPOSIT: 'deposit', MAINTENANCE: 'maintenance' };
/** "2026-10" -> "Oct 2026" */
const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return year && month ? new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : period;
};
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
  if (isPending) return <div className="flex min-h-screen items-center justify-center bg-surface"><Loader2 className="h-8 w-8 animate-spin text-navy-900" /></div>;
  if (isError || !site) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <section>
          <h1 className="text-2xl font-bold text-slate-900">PG site not found</h1>
          <p className="mt-2 text-sm text-slate-600">This resident link doesn't match any PG. Check the link your PG shared, or find your PG.</p>
          <Link to={ROUTES.residentFinder} className="mt-4 inline-block font-bold text-navy-900 hover:underline">Find your PG</Link>
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
      toast.success('Report sent. The warden will update its status here.');
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
    { id: 'stays', label: 'Home', icon: Building2 },
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
          <p className="text-xs font-bold text-amber-700">Resident login</p>
          <h1 className="mt-1 text-2xl font-bold text-navy-900">{site.name}</h1>
          {site.locality && <p className="text-sm text-slate-500">{[site.locality, site.city].filter(Boolean).join(', ')}</p>}
          <p className="mt-2 text-sm text-slate-500">Log in with the phone number on your stay. No password needed.</p>
        </div>
          {step === 'phone' ? (<>
            <form onSubmit={requestCode} className="mt-5 space-y-3">
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={loading || cooldown > 0} className="flex w-full items-center justify-center gap-2 bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}</button>
            </form>
            <p className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
              Not staying here yet?{' '}
              <a href={ROUTES.guestHome} className="font-bold text-navy-900 hover:underline">Browse PGs</a>
              {' · '}
              <Link to={ROUTES.residentFinder} className="font-bold text-navy-900 hover:underline">Different PG</Link>
            </p>
          </>) : (
            <form onSubmit={verifyCode} className="mt-5 space-y-3">
              <input required aria-label="6-digit verification code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" inputMode="numeric" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={loading} className="flex w-full items-center justify-center gap-2 bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Verify & open my stays</button>
              <button type="button" onClick={() => setStep('phone')} className="text-sm font-semibold text-slate-500">Use a different number</button>
            </form>
          )}
      </SplitAuthLayout>
    );
  }



  return (
    <div className="flex h-[100dvh] bg-surface text-slate-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-8 shadow-xs">
          <div className="flex items-center gap-3">
            <button onClick={toggle} aria-label="Open navigation" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden transition-colors"><Menu className="h-6 w-6" /></button>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-navy-900 flex items-center justify-center text-amber-500 shadow-xs">
                <Building2 className="h-4.5 w-4.5" />
              </div>
              <span className="font-bold text-slate-900 text-sm sm:text-base">{site.name}</span>
            </div>
            {stays[0] && (
              <span className="hidden items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full md:inline-flex ml-2">
                <UserRound className="h-3.5 w-3.5 text-navy-900" />
                {stays[0].name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm md:gap-3">
            <button
              onClick={() => setActiveTab('notifications')}
              className="inline-flex items-center gap-1.5 font-semibold text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition-colors"
              aria-label={`${unreadCount} unread notifications`}
            >
              <Bell className="h-4 w-4 text-slate-500" />
              <span>{unreadCount}</span>
            </button>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 font-semibold text-xs text-slate-600 hover:text-red-700 bg-slate-50 hover:bg-red-50 border border-slate-200 px-3 py-1.5 rounded-xl transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 lg:pb-8">
          <div className="mx-auto max-w-5xl">
        {activeTab === 'stays' && (<div className="space-y-6">
          {stays[0] && (
            <ResidentHome
              stay={stays.find((stay) => ['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status)) ?? stays[0]}
              tickets={tickets}
              claims={paymentClaims}
              onPay={() => setActiveTab('money')}
              onReport={() => setActiveTab('maintenance')}
            />
          )}
          {stays.length > 0 && <h2 className="pt-2 text-xl font-semibold">Your stay</h2>}
          {!stays.length && (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm">
              <Building2 className="mx-auto h-10 w-10 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">No active stays found for this number.</p>
              <p className="text-xs text-slate-400 mt-1">If you recently booked, your PG owner will approve your stay shortly.</p>
            </div>
          )}
          {stays.map((stay) => {
            const isActive = stay.status === 'ACTIVE';
            const isNotice = stay.status === 'NOTICE_PERIOD';
            return (
              <article key={stay.id} className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-xl font-bold text-navy-900">{stay.property.name}</h2>
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                        isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : isNotice
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-600' : isNotice ? 'bg-amber-600' : 'bg-slate-500'}`} />
                        {statusLabel(stay.status)}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs text-slate-500 font-medium">
                      {stay.property.address}, {stay.property.locality}, {stay.property.city}
                    </p>

                    {/* Stay Specs Pill Row */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {stay.bed && (
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 px-3 py-1 rounded-lg text-xs font-semibold">
                          <Building2 className="h-3.5 w-3.5 text-navy-900" />
                          Room {stay.bed.room.roomNumber} · {stay.bed.label} ({stay.bed.room.roomType})
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 text-navy-900 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">
                        ₹{stay.monthlyRent.toLocaleString('en-IN')} / month
                      </span>
                      <span className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 px-3 py-1 rounded-lg text-xs font-medium border border-slate-200">
                        Deposit: ₹{(stay.depositReceived || 0).toLocaleString('en-IN')} / ₹{(stay.depositAmount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>

                    {isNotice && stay.noticeDate && (
                      <p className="mt-2 text-xs font-semibold text-amber-800 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200 inline-block">
                        Vacating notice active since {new Date(stay.noticeDate).toLocaleDateString()}
                      </p>
                    )}

                    {stay.depositRefundStatus === 'PENDING' && (
                      <p className="mt-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block">
                        Deposit refund due: ₹{(stay.depositRefundAmount || 0).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 self-start">
                    {stay.status === 'ACTIVE' && (
                      <button
                        onClick={() => void submitNotice(stay.id)}
                        className="rounded-xl border border-amber-300 bg-amber-50/80 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors shadow-xs"
                      >
                        Give vacating notice
                      </button>
                    )}
                    {stay.status === 'NOTICE_PERIOD' && (
                      <button
                        onClick={() => void cancelNotice(stay.id)}
                        className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                      >
                        Cancel vacating notice
                      </button>
                    )}
                    <button
                      onClick={() => exportReceipts(stay)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                    >
                      <Download className="h-3.5 w-3.5" /> Download Receipts
                    </button>
                  </div>
                </div>

                {/* Invoices and Payments Section */}
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-bold text-slate-500 mb-3">
                    Invoices & Payment Records
                  </h3>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
                    {stay.rentEntries.map((entry) => {
                      const isPaid = entry.status === 'PAID';
                      const balance = Math.max(0, entry.amount - entry.paidAmount);
                      return (
                        <div key={entry.id} className="p-3.5 sm:p-4 text-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white hover:bg-slate-50/60 transition-colors">
                          <div>
                            <div className="flex items-center gap-2">
                              <ReceiptIndianRupee className="h-4 w-4 text-amber-500" />
                              <span className="font-semibold text-navy-900">{periodLabel(entry.period)} {ENTRY_NAMES[entry.entryType] ?? entry.entryType.toLowerCase()}</span>
                              <StatusPill status={entry.status} />
                            </div>
                            <p className="mt-1 text-xs text-slate-600">
                              ₹{entry.paidAmount.toLocaleString('en-IN')} paid of ₹{entry.amount.toLocaleString('en-IN')}
                              {balance > 0 ? ` (₹${balance.toLocaleString('en-IN')} due)` : ''}
                              {entry.reference ? ` · Ref: ${entry.reference}` : ''}
                            </p>
                          </div>

                          {!isPaid && stay.property.upiId && ['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && (
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={`upi://pay?pa=${encodeURIComponent(stay.property.upiId)}&pn=${encodeURIComponent(stay.property.name)}&am=${balance.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`${entry.period} ${entry.entryType}`)}`}
                                className="btn-accent py-1.5 px-3 rounded-lg text-xs font-bold shadow-xs"
                              >
                                Pay with UPI
                              </a>
                              {paymentClaims.some((claim) => claim.rentEntryId === entry.id && claim.status === 'PENDING') ? (
                                <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                  Verification pending
                                </span>
                              ) : (
                                <button
                                  onClick={() => startPaymentClaim(stay, entry)}
                                  className="btn-primary py-1.5 px-3 rounded-lg text-xs font-semibold shadow-xs"
                                >
                                  I paid
                                </button>
                              )}
                            </div>
                          )}

                          {paymentFormFor === entry.id && (
                            <form onSubmit={submitPaymentClaim} className="grid w-full gap-2.5 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1.5fr_auto]">
                              <label className="text-xs font-semibold text-slate-700">
                                Amount paid (₹)
                                <input
                                  required
                                  type="number"
                                  min="0.01"
                                  max={balance}
                                  step="0.01"
                                  {...paymentFormApi.register('amount')}
                                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-navy-900 outline-none"
                                />
                              </label>
                              <label className="text-xs font-semibold text-slate-700">
                                UPI UTR / Transaction Reference
                                <input
                                  required
                                  minLength={6}
                                  maxLength={80}
                                  {...paymentFormApi.register('reference')}
                                  placeholder="e.g. 331234567890"
                                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-navy-900 outline-none"
                                />
                              </label>
                              {Object.values(paymentFormApi.formState.errors)[0]?.message && (
                                <p role="alert" className="text-xs font-medium text-red-600 sm:col-span-3">
                                  {Object.values(paymentFormApi.formState.errors)[0]?.message}
                                </p>
                              )}
                              <button
                                disabled={submittingPayment}
                                className="self-end rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60 transition-colors shadow-xs"
                              >
                                {submittingPayment ? 'Submitting…' : 'Submit verification'}
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                    {!stay.rentEntries.length && (
                      <p className="p-4 text-center text-xs text-slate-500 font-medium">No active invoices issued yet.</p>
                    )}
                  </div>
                </div>

                {/* Payment Claims List */}
                {paymentClaims.some((claim) => claim.tenantId === stay.id) && (
                  <section className="mt-5 border-t border-slate-100 pt-4">
                    <h3 className="text-xs font-bold text-slate-500 mb-2">
                      Recent Payment Claims
                    </h3>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                      {paymentClaims.filter((claim) => claim.tenantId === stay.id).map((claim) => (
                        <article key={claim.id} className="p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-800">
                              ₹{claim.amount.toLocaleString('en-IN')} · {claim.rentEntry.entryType} {claim.rentEntry.period}
                            </p>
                            <p className="text-slate-500 mt-0.5">
                              Ref {claim.reference} · Submitted {new Date(claim.createdAt).toLocaleDateString()}
                            </p>
                            {claim.responseNote && <p className="mt-1 text-red-700 font-medium">{claim.responseNote}</p>}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            claim.status === 'PENDING'
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : claim.status === 'APPROVED'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'
                          }`}>
                            {claim.status}
                          </span>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </article>
            );
          })}
        </div>)}

        {activeTab === 'profile' && (<div className="space-y-6">
          {!stays.length && <p className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm">No stays found for this number.</p>}
          {stays.map((stay) => (
            <article key={stay.id} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-navy-900">{stay.property.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{stay.property.locality}, {stay.property.city}</p>
                </div>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  {statusLabel(stay.status)}{stay.bed ? ` · Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''}
                </span>
              </div>

              <section className="pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> Resident Verification & Identity
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">Government KYC documents remain confidential and protected under privacy policies.</p>
                  </div>
                  {profileEditingFor !== stay.id && (
                    <button
                      onClick={() => editProfile(stay)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                    >
                      <UserRound className="h-3.5 w-3.5" /> Edit details
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 rounded-xl bg-slate-50 p-4 border border-slate-150 text-xs text-slate-700">
                  <div>
                    <span className="text-slate-400 block font-medium">Permanent Address</span>
                    <span className="font-semibold text-slate-800">{stay.permanentAddress || 'Not provided'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">College / Employer</span>
                    <span className="font-semibold text-slate-800">{stay.institutionOrEmployer || 'Not provided'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Emergency Contact</span>
                    <span className="font-semibold text-slate-800">{stay.emergencyName ? `${stay.emergencyName} (${stay.emergencyPhone || '—'})` : 'Not provided'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">KYC Verification Status</span>
                    <span className={`font-bold inline-flex items-center gap-1 ${stay.kycVerified ? 'text-emerald-700' : stay.kycDocumentUrl ? 'text-amber-700' : 'text-slate-500'}`}>
                      {stay.kycVerified ? '✓ Verified by PG Owner' : stay.kycDocumentUrl ? 'Awaiting Owner Review' : 'Document not yet uploaded'}
                    </span>
                  </div>
                </div>

                {profileEditingFor === stay.id && (
                  <form onSubmit={saveProfile(stay.id)} className="mt-5 grid gap-3.5 border-t border-slate-100 pt-5 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600 ">Permanent address
                      <input maxLength={200} {...profileFormApi.register('permanentAddress')} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-navy-900/15 outline-none" />
                    </label>
                    <label className="text-xs font-bold text-slate-600 ">College / employer
                      <input maxLength={200} {...profileFormApi.register('institutionOrEmployer')} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-navy-900/15 outline-none" />
                    </label>
                    <label className="text-xs font-bold text-slate-600 ">Emergency contact name
                      <input maxLength={200} {...profileFormApi.register('emergencyName')} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-navy-900/15 outline-none" />
                    </label>
                    <label className="text-xs font-bold text-slate-600 ">Emergency contact phone
                      <input type="tel" maxLength={20} {...profileFormApi.register('emergencyPhone')} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-navy-900/15 outline-none" />
                    </label>
                    <label className="text-xs font-bold text-slate-600 ">Blood group
                      <select {...profileFormApi.register('bloodGroup')} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-navy-900/15 outline-none">
                        <option value="">Not provided</option>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group} value={group}>{group}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600 ">KYC document type
                      <select {...profileFormApi.register('kycType')} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-navy-900/15 outline-none">
                        <option value="">Select document</option>
                        {[['AADHAAR', 'Aadhaar Card'], ['PAN', 'PAN Card'], ['PASSPORT', 'Passport'], ['DRIVING_LICENSE', 'Driving License'], ['STUDENT_ID', 'Student College ID'], ['WORK_ID', 'Work Employee ID']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600 sm:col-span-2">Replace KYC document
                      <input type="file" accept="image/*,application/pdf" onChange={(event) => setProfileFile(event.target.files?.[0] || null)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-xs file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:rounded-md file:font-semibold" />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 sm:col-span-2">
                      <input type="checkbox" {...profileFormApi.register('foodOptOut')} className="accent-navy-900 h-4 w-4 rounded" />
                      Opt out of included food / mess charges
                    </label>
                    <div className="flex gap-2 sm:col-span-2 mt-2">
                      <button disabled={savingProfile} className="btn-primary py-2 px-4 rounded-xl text-xs font-bold shadow-sm">
                        {savingProfile ? 'Saving…' : 'Save profile'}
                      </button>
                      <button type="button" onClick={() => setProfileEditingFor('')} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </article>
          ))}
        </div>)}

        {activeTab === 'maintenance' && (<div className="space-y-6">
          {!stays.length && <p className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm">No stays found for this number.</p>}
          {stays.map((stay) => (
            <article key={stay.id} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-navy-900">{stay.property.name}</h2>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  {statusLabel(stay.status)}{stay.bed ? ` · Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''}
                </span>
              </div>

              <section className="pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-navy-900" /> Maintenance & Requests
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">Fast reporting direct to PG staff and wardens.</p>
                  </div>
                  {['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && ticketFormFor !== stay.id && (
                    <button
                      onClick={() => openTicketForm(stay.id)}
                      className="btn-primary py-2 px-3.5 rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Report an issue
                    </button>
                  )}
                </div>

                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {tickets.filter((ticket) => ticket.tenantId === stay.id).map((ticket) => (
                    <article key={ticket.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold text-slate-900 text-sm">{ticket.title}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400 font-medium">
                        {ticket.category} · Reported {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600 leading-relaxed bg-slate-50/70 p-2.5 rounded-lg border border-slate-150">
                        {ticket.description}
                      </p>
                    </article>
                  ))}
                  {!tickets.some((ticket) => ticket.tenantId === stay.id) && (
                    <p className="p-6 text-center text-xs text-slate-500 font-medium">No maintenance requests submitted yet. Everything running smoothly!</p>
                  )}
                </div>

                {ticketFormFor === stay.id && (
                  <form onSubmit={submitTicket} className="mt-5 space-y-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                    <h4 className="text-xs font-bold text-slate-700">New issue details</h4>
                    <label className="block text-xs font-semibold text-slate-700">Issue category
                      <select {...ticketFormApi.register('category')} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-navy-900/15 outline-none">
                        <option value="PLUMBING">Plumbing (Tap, Pipe, Flush, Leakage)</option>
                        <option value="ELECTRICAL">Electrical (Fan, Light, Switch, Geyser)</option>
                        <option value="APPLIANCE">Appliance (AC, Washing Machine, Fridge)</option>
                        <option value="CLEANING">Cleaning & Housekeeping</option>
                        <option value="SAFETY">Safety & Locks</option>
                        <option value="PEST">Pest Control</option>
                        <option value="OTHER">Other Query</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-navy-900">What needs fixing?
                      <input required maxLength={120} {...ticketFormApi.register('title')} placeholder="e.g. Geyser not heating in 2nd floor bathroom" className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-navy-900/15 outline-none" />
                    </label>
                    <label className="block text-sm font-medium text-navy-900">Where is it, and what's wrong?
                      <textarea required maxLength={2000} rows={3} {...ticketFormApi.register('description')} placeholder="Please describe the problem and exact location so staff can fix it quickly…" className="mt-1 block w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-navy-900/15 outline-none" />
                    </label>
                    {Object.values(ticketFormApi.formState.errors)[0]?.message && (
                      <p role="alert" className="text-xs font-medium text-red-600">{Object.values(ticketFormApi.formState.errors)[0]?.message}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button disabled={submittingTicket} className="btn-primary py-2 px-4 rounded-xl text-xs font-bold shadow-sm">
                        {submittingTicket ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Send report
                      </button>
                      <button type="button" onClick={() => setTicketFormFor('')} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                {!['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    Maintenance requests are enabled during an active stay.
                  </p>
                )}
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
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold text-slate-900 mb-3"><Bell className="h-4 w-4 text-navy-900" />All Notifications</h2>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                {notifications.slice(0, 10).map((notification) => (
                  <article key={notification.id} className={`flex items-start justify-between gap-4 p-4 hover:bg-slate-50/50 transition-colors ${notification.readAt ? 'opacity-65' : 'bg-blue-50/20'}`}>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{notification.title}</p>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">{notification.message}</p>
                      <p className="mt-1 text-[11px] text-slate-400 font-medium">{new Date(notification.createdAt).toLocaleString()}</p>
                    </div>
                    {!notification.readAt && (
                      <button onClick={() => void markNotificationRead(notification.id)} aria-label="Mark notification as read" title="Mark as read" className="shrink-0 p-2 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors">
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white py-14 text-center text-xs text-slate-500 shadow-sm font-medium">No notifications yet. You're all caught up!</div>
          )}
        </div>)}
          </div>
        </main>
        {/* Phones: the four main sections within thumb reach (DESIGN.md §4.2). */}
        <nav aria-label="Resident" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-hairline bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {([
            ['stays', 'Home', Building2],
            ['money', 'Money', Wallet],
            ['maintenance', 'Requests', Wrench],
            ['profile', 'Profile', UserRound]
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[13px] font-medium ${activeTab === id ? 'text-navy-900' : 'text-muted'}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <AIChatPanel />
      </div>
    </div>
  );
}
