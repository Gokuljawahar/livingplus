import { useState } from 'react';
import { Building2, Download, Loader2, LogOut, ReceiptIndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

type Stay = {
  id: string; name: string; status: string; monthlyRent: number; depositAmount: number;
  depositReceived: number; depositDeductions?: number; depositRefundAmount?: number | null;
  depositRefundStatus?: string; noticeDate?: string | null;
  property: { name: string; address: string; locality: string; city: string; contactPhone?: string | null };
  bed?: { label: string; room: { roomNumber: string; roomType: string } } | null;
  rentEntries: { id: string; period: string; entryType: string; amount: number; paidAmount: number; status: string; method?: string | null; reference?: string | null; dueDate: string }[];
};

export default function ResidentPortal() {
  const [step, setStep] = useState<'phone' | 'code' | 'portal'>(() => (localStorage.getItem('token') ? 'portal' : 'phone'));
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [stays, setStays] = useState<Stay[]>([]);

  const loadStays = async () => {
    const response = await api.get('/pg/tenant/stays');
    setStays(response.data);
  };

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/auth/otp-request', { phone, purpose: 'TENANT_LOGIN' });
      if (response.data.devCode) toast.success(`Demo code: ${response.data.devCode}`);
      else toast.success('Code sent');
      setStep('code');
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
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      await loadStays();
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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setStays([]);
    setStep('phone');
  };

  if (step !== 'portal') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <section className="w-full max-w-md bg-white p-6 shadow-xl">
          <p className="text-xs font-bold uppercase text-amber-700">Resident access</p>
          <h1 className="mt-1 text-xl font-bold text-[#02224B]">Resident login</h1>
          <p className="mt-1 text-sm text-slate-500">Log in with the phone number on your stay. No password needed.</p>
          {step === 'phone' ? (
            <form onSubmit={requestCode} className="mt-5 space-y-3">
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={loading} className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Send code</button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="mt-5 space-y-3">
              <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" inputMode="numeric" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={loading} className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Verify & open my stays</button>
              <button type="button" onClick={() => setStep('phone')} className="text-sm font-semibold text-slate-500">Use a different number</button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2 font-semibold text-[#02224B]"><Building2 className="h-5 w-5" /> My stays</span>
          <button onClick={logout} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </header>
      <section className="mx-auto max-w-5xl space-y-4 px-5 py-8">
        {!stays.length && <p className="border-y border-slate-200 py-10 text-center text-sm text-slate-500">No stays found for this number.</p>}
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
                <button onClick={() => exportReceipts(stay)} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Download className="h-4 w-4" />Receipts</button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              {stay.rentEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-700"><ReceiptIndianRupee className="h-4 w-4 text-slate-400" />{entry.period} · {entry.entryType}</span>
                  <span className="text-slate-600">₹{entry.paidAmount.toLocaleString('en-IN')} / ₹{entry.amount.toLocaleString('en-IN')} · {entry.status}{entry.reference ? ` · ${entry.reference}` : ''}</span>
                </div>
              ))}
              {!stay.rentEntries.length && <p className="py-3 text-sm text-slate-500">No invoices yet.</p>}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
