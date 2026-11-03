import { useEffect, useState } from 'react';
import { AlertCircle, Bell, Building2, Check, Download, Loader2, LogOut, Plus, ReceiptIndianRupee, Send, UserRound, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { RESIDENT_TOKEN_KEY } from '../utils/session';
import { resolveAppHost } from '../utils/pg-host';
import { useOtpCooldown } from '../hooks/useOtpCooldown';
import AIChatPanel from '../components/AIChatPanel';
import RoomChange from '../components/RoomChange';
import FoodPreferences from '../components/FoodPreferences';
import MoneyOverview from '../components/MoneyOverview';
import StayServices from '../components/StayServices';

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

export default function ResidentPortal() {
  const { login, logout: clearSession } = useAuth();
  const [step, setStep] = useState<'phone' | 'code' | 'portal'>(() => (localStorage.getItem(RESIDENT_TOKEN_KEY) ? 'portal' : 'phone'));
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { cooldown, startCooldown } = useOtpCooldown();
  const [activeTab, setActiveTab] = useState<'stays' | 'money' | 'food' | 'services' | 'maintenance' | 'roomchange' | 'notifications' | 'profile'>('stays');
  const [stays, setStays] = useState<Stay[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [ticketFormFor, setTicketFormFor] = useState('');
  const [ticketForm, setTicketForm] = useState({ tenantId: '', title: '', description: '', category: 'OTHER' });
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [notifications, setNotifications] = useState<ResidentNotification[]>([]);
  const [paymentClaims, setPaymentClaims] = useState<PaymentClaim[]>([]);
  const [profileEditingFor, setProfileEditingFor] = useState('');
  const [profileForm, setProfileForm] = useState({ permanentAddress: '', bloodGroup: '', institutionOrEmployer: '', emergencyName: '', emergencyPhone: '', kycType: '', foodOptOut: false });
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [paymentFormFor, setPaymentFormFor] = useState('');
  const [paymentForm, setPaymentForm] = useState({ tenantId: '', rentEntryId: '', amount: '', reference: '' });
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const canFindPg = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) || resolveAppHost().kind === 'public';

  useEffect(() => {
    if (step !== 'portal') return;
    const loadPortal = async () => {
      try {
        const [stayResponse, ticketResponse, notificationResponse, claimResponse] = await Promise.all([
          api.get('/pg/tenant/stays'),
          api.get('/pg/tenant/maintenance'),
          api.get('/pg/tenant/notifications'),
          api.get('/pg/tenant/payment-claims')
        ]);
        setStays(stayResponse.data);
        setTickets(ticketResponse.data);
        setNotifications(notificationResponse.data.notifications || []);
        setPaymentClaims(claimResponse.data || []);
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Could not load resident account');
      }
    };
    void loadPortal();
    const intervalId = window.setInterval(() => void loadPortal(), 30000);
    return () => window.clearInterval(intervalId);
  }, [step]);

  const loadStays = async () => {
    const response = await api.get('/pg/tenant/stays');
    setStays(response.data);
  };

  const refreshResidentData = async () => {
    const [stayResponse, ticketResponse, notificationResponse, claimResponse] = await Promise.all([
      api.get('/pg/tenant/stays'),
      api.get('/pg/tenant/maintenance'),
      api.get('/pg/tenant/notifications'),
      api.get('/pg/tenant/payment-claims')
    ]);
    setStays(stayResponse.data);
    setTickets(ticketResponse.data);
    setNotifications(notificationResponse.data.notifications || []);
    setPaymentClaims(claimResponse.data || []);
  };

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/auth/otp-request', { phone, purpose: 'TENANT_LOGIN' });
      if (response.data.devCode) toast.success(`Demo code: ${response.data.devCode}`);
      else toast.success('Code sent');
      setStep('code');
      startCooldown();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not send code');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/auth/otp-verify', { phone, code, purpose: 'TENANT_LOGIN' });
      login(response.data.token, response.data.user);
      setStep('portal');
      toast.success('Welcome back');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const submitNotice = async (stayId: string) => {
    if (!window.confirm('Submit your vacating notice? Your warden will plan the checkout.')) return;
    try {
      await api.post(`/pg/tenant/${stayId}/notice`);
      toast.success('Notice submitted');
      await loadStays();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not submit notice');
    }
  };

  const cancelNotice = async (stayId: string) => {
    if (!window.confirm('Cancel your vacating notice?')) return;
    try {
      await api.post(`/pg/tenant/${stayId}/notice-cancel`);
      toast.success('Vacating notice cancelled');
      await loadStays();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not cancel notice');
    }
  };

  const openTicketForm = (stayId: string) => {
    setTicketFormFor(stayId);
    setTicketForm({ tenantId: stayId, title: '', description: '', category: 'OTHER' });
  };

  const submitTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingTicket(true);
    try {
      await api.post('/pg/tenant/maintenance', ticketForm);
      toast.success('Maintenance request sent');
      setTicketFormFor('');
      setTicketForm({ tenantId: '', title: '', description: '', category: 'OTHER' });
      await refreshResidentData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not send maintenance request');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const editProfile = (stay: Stay) => {
    setProfileEditingFor(stay.id);
    setProfileFile(null);
    setProfileForm({
      permanentAddress: stay.permanentAddress || '',
      bloodGroup: stay.bloodGroup || '',
      institutionOrEmployer: stay.institutionOrEmployer || '',
      emergencyName: stay.emergencyName || '',
      emergencyPhone: stay.emergencyPhone || '',
      kycType: stay.kycType || '',
      foodOptOut: Boolean(stay.foodOptOut)
    });
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>, stayId: string) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      let kycDocumentUrl: string | undefined;
      if (profileFile) {
        const upload = new FormData();
        upload.append('image', profileFile);
        const result = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
        kycDocumentUrl = result.data.fileKey;
      }
      await api.patch(`/pg/tenant/${stayId}/profile`, { ...profileForm, ...(kycDocumentUrl ? { kycDocumentUrl } : {}) });
      toast.success('Profile saved. New KYC documents need owner verification.');
      setProfileEditingFor('');
      setProfileFile(null);
      await refreshResidentData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const startPaymentClaim = (stay: Stay, entry: Stay['rentEntries'][number]) => {
    setPaymentFormFor(entry.id);
    setPaymentForm({ tenantId: stay.id, rentEntryId: entry.id, amount: String(Math.max(0, entry.amount - entry.paidAmount)), reference: '' });
  };

  const submitPaymentClaim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingPayment(true);
    try {
      await api.post('/pg/tenant/payment-claims', { ...paymentForm, amount: Number(paymentForm.amount) });
      toast.success('Payment submitted for PG verification');
      setPaymentFormFor('');
      setPaymentForm({ tenantId: '', rentEntryId: '', amount: '', reference: '' });
      await refreshResidentData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not submit payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const markNotificationRead = async (notificationId: string) => {
    try {
      await api.patch(`/pg/tenant/notifications/${notificationId}/read`);
      setNotifications((current) => current.map((notification) => notification.id === notificationId ? { ...notification, readAt: new Date().toISOString() } : notification));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not update notification');
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
    setStays([]);
    setTickets([]);
    setNotifications([]);
    setPaymentClaims([]);
    setStep('phone');
  };

  if (step !== 'portal') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <section className="w-full max-w-md bg-white p-6 shadow-xl">
          <p className="text-xs font-bold uppercase text-amber-700">Resident access</p>
          <h1 className="mt-1 text-xl font-bold text-[#02224B]">Resident login</h1>
          <p className="mt-1 text-sm text-slate-500">Log in with the phone number on your stay. No password needed.</p>
          {step === 'phone' ? (<>
            <form onSubmit={requestCode} className="mt-5 space-y-3">
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={loading || cooldown > 0} className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}</button>
            </form>
            {canFindPg && (
              <p className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
                Not onboarded yet?{' '}
                <a href="/pg" className="font-bold text-[#02224B] hover:underline">
                  Browse PGs as a guest
                </a>
              </p>
            )}
          </>) : (
            <form onSubmit={verifyCode} className="mt-5 space-y-3">
              <input required aria-label="6-digit verification code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" inputMode="numeric" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={loading} className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Verify & open my stays</button>
              <button type="button" onClick={() => setStep('phone')} className="text-sm font-semibold text-slate-500">Use a different number</button>
            </form>
          )}
        </section>
      </main>
    );
  }

  const tabs = [
    { id: 'stays', label: 'My stays', badge: stays.length > 1 ? stays.length : 0 },
    { id: 'money', label: 'Money', badge: 0 },
    { id: 'food', label: 'Food', badge: 0 },
    { id: 'services', label: 'Services', badge: 0 },
    { id: 'maintenance', label: 'Maintenance', badge: 0 },
    { id: 'roomchange', label: 'Room change', badge: 0 },
    { id: 'notifications', label: 'Notifications', badge: unreadCount },
    { id: 'profile', label: 'Profile', badge: 0 }
  ] as const;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-[#02224B] text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="flex items-center gap-2 text-lg font-bold"><Building2 className="h-5 w-5 text-[#FEB109]" /> My stays</span>
          {stays[0] && <span className="hidden items-center gap-1.5 text-sm font-medium text-blue-100 md:inline-flex"><UserRound className="h-4 w-4" />{stays[0].name}</span>}
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-blue-100" aria-label={`${unreadCount} unread notifications`}><Bell className="h-4 w-4" />{unreadCount}</span>
            {canFindPg ? <a href="/pg" className="font-semibold text-blue-100 hover:text-white">Find a PG</a> : null}
            <button onClick={logout} className="inline-flex items-center gap-1 font-semibold text-blue-100 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        </div>
        <nav className="border-t border-white/10" aria-label="Resident sections">
          <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 text-sm" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 px-3 py-2 font-semibold ${activeTab === tab.id ? 'text-[#FEB109] underline underline-offset-4' : 'text-blue-100 hover:text-white'}`}
              >
                {tab.label}
                {tab.badge > 0 && <span className="bg-[#FEB109] px-1.5 py-0.5 text-[11px] font-bold text-[#02224B]">{tab.badge}</span>}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <section className="mx-auto max-w-5xl px-4 py-6">
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
                      <input required type="number" min="0.01" max={entry.amount - entry.paidAmount} step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} className="mt-1 block w-full border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">UPI transaction reference
                      <input required minLength={6} maxLength={80} value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} placeholder="UPI reference / UTR" className="mt-1 block w-full border border-slate-300 px-3 py-2 text-sm" />
                    </label>
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
              {profileEditingFor === stay.id && <form onSubmit={(event) => void saveProfile(event, stay.id)} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Permanent address<input maxLength={200} value={profileForm.permanentAddress} onChange={(event) => setProfileForm({ ...profileForm, permanentAddress: event.target.value })} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm font-medium text-slate-700">College / employer<input maxLength={200} value={profileForm.institutionOrEmployer} onChange={(event) => setProfileForm({ ...profileForm, institutionOrEmployer: event.target.value })} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm font-medium text-slate-700">Emergency contact<input maxLength={200} value={profileForm.emergencyName} onChange={(event) => setProfileForm({ ...profileForm, emergencyName: event.target.value })} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm font-medium text-slate-700">Emergency phone<input type="tel" maxLength={20} value={profileForm.emergencyPhone} onChange={(event) => setProfileForm({ ...profileForm, emergencyPhone: event.target.value })} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
                <label className="text-sm font-medium text-slate-700">Blood group<select value={profileForm.bloodGroup} onChange={(event) => setProfileForm({ ...profileForm, bloodGroup: event.target.value })} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2"><option value="">Not provided</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700">KYC document type<select value={profileForm.kycType} onChange={(event) => setProfileForm({ ...profileForm, kycType: event.target.value })} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2"><option value="">Select document</option>{[['AADHAAR', 'Aadhaar'], ['PAN', 'PAN'], ['PASSPORT', 'Passport'], ['DRIVING_LICENSE', 'Driving license'], ['STUDENT_ID', 'Student ID'], ['WORK_ID', 'Work ID']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">Replace KYC document<input type="file" accept="image/*,application/pdf" onChange={(event) => setProfileFile(event.target.files?.[0] || null)} className="mt-1 block w-full border border-slate-300 px-2 py-2 text-sm" /></label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={profileForm.foodOptOut} onChange={(event) => setProfileForm({ ...profileForm, foodOptOut: event.target.checked })} />Opt out of included food</label>
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
                  <select value={ticketForm.category} onChange={(event) => setTicketForm({ ...ticketForm, category: event.target.value })} className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2.5">
                    <option value="PLUMBING">Plumbing</option><option value="ELECTRICAL">Electrical</option><option value="APPLIANCE">Appliance</option><option value="CLEANING">Cleaning</option><option value="SAFETY">Safety</option><option value="PEST">Pest control</option><option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Title
                  <input required maxLength={120} value={ticketForm.title} onChange={(event) => setTicketForm({ ...ticketForm, title: event.target.value })} placeholder="What needs attention?" className="mt-1 block w-full border border-slate-300 px-3 py-2.5" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Details
                  <textarea required maxLength={2000} rows={3} value={ticketForm.description} onChange={(event) => setTicketForm({ ...ticketForm, description: event.target.value })} placeholder="Describe the issue and where it is." className="mt-1 block w-full resize-y border border-slate-300 px-3 py-2.5" />
                </label>
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
      </section>
      <AIChatPanel />
    </main>
  );
}
