import { AlertCircle, CheckCircle2, Clock, IndianRupee, ReceiptIndianRupee, ShieldCheck } from 'lucide-react';

export type MoneyStay = {
  id: string; name: string; status: string;
  monthlyRent: number; depositAmount: number; depositReceived: number;
  depositRefundAmount?: number | null; depositRefundStatus?: string;
  property: { name: string };
  bed?: { label: string; room: { roomNumber: string } } | null;
  rentEntries: {
    id: string; period: string; entryType: string; amount: number; paidAmount: number;
    status: string; dueDate: string;
  }[];
};

export type MoneyClaim = {
  id: string; amount: number; reference: string; status: string; responseNote?: string | null;
  createdAt: string; tenantId: string;
  rentEntry: { entryType: string; period: string };
  property?: { name: string };
};

export default function MoneyOverview({ stays, claims }: { stays: MoneyStay[]; claims: MoneyClaim[] }) {
  const unpaid = stays.flatMap((stay) => stay.rentEntries
    .filter((entry) => entry.status !== 'PAID')
    .map((entry) => ({ stay, entry })));
  const totalDue = unpaid.reduce((sum, { entry }) => sum + Math.max(0, entry.amount - entry.paidAmount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = unpaid.filter(({ entry }) => entry.status === 'OVERDUE' || entry.dueDate < today).length;

  if (!stays.length) return (
    <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm">
      No stays found for this number.
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Bento KPI Summary */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Total Outstanding</span>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-navy-900 flex items-center justify-center">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-navy-900">₹{totalDue.toLocaleString('en-IN')}</p>
          <p className="mt-1 text-xs text-slate-400">Total open rent & utility dues</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Pending Invoices</span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800">{unpaid.length}</p>
          <p className="mt-1 text-xs text-slate-400">Bills awaiting payment</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-shadow">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Overdue Invoices</span>
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${overdueCount ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className={`mt-2 text-2xl font-bold ${overdueCount ? 'text-red-700' : 'text-slate-800'}`}>{overdueCount}</p>
          <p className="mt-1 text-xs text-slate-400">{overdueCount ? 'Requires immediate attention' : 'All bills on track ✓'}</p>
        </div>
      </section>

      {unpaid.length > 0 && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base">
            <ReceiptIndianRupee className="h-4 w-4 text-amber-500" />
            Unpaid Invoices
          </h2>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-150 overflow-hidden">
            {unpaid.map(({ stay, entry }) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white hover:bg-slate-50/50 transition-colors text-sm">
                <div>
                  <p className="font-bold text-slate-800">{stay.property.name} · {entry.period} · {entry.entryType}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ₹{(entry.amount - entry.paidAmount).toLocaleString('en-IN')} remaining of ₹{entry.amount.toLocaleString('en-IN')} · due {new Date(entry.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  entry.status === 'OVERDUE'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {claims.length > 0 && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Payment Verifications
          </h2>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-150 overflow-hidden">
            {claims.map((claim) => (
              <div key={claim.id} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white hover:bg-slate-50/50 transition-colors text-sm">
                <div>
                  <p className="font-bold text-slate-800">₹{claim.amount.toLocaleString('en-IN')} · {claim.rentEntry.entryType} {claim.rentEntry.period}</p>
                  <p className="text-xs text-slate-400 mt-0.5">UPI Ref: {claim.reference} · Submitted on {new Date(claim.createdAt).toLocaleDateString()}</p>
                  {claim.responseNote && <p className="mt-1 text-xs text-red-600 font-semibold">{claim.responseNote}</p>}
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  claim.status === 'PENDING'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : claim.status === 'APPROVED'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}>
                  {claim.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-bold text-slate-900 text-sm sm:text-base">
          <ShieldCheck className="h-4 w-4 text-navy-900" />
          Security Deposits & Refund Protection
        </h2>
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-150 overflow-hidden">
          {stays.map((stay) => (
            <div key={stay.id} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white hover:bg-slate-50/50 transition-colors text-sm">
              <div>
                <p className="font-bold text-slate-800">{stay.property.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  ₹{(stay.depositReceived || 0).toLocaleString('en-IN')} recorded of ₹{(stay.depositAmount || 0).toLocaleString('en-IN')} agreed deposit
                  {stay.depositRefundStatus && stay.depositRefundStatus !== 'NOT_APPLICABLE' ? (
                    <span className="font-semibold text-navy-900">
                      {' '}· Refund {stay.depositRefundStatus.replace('_', ' ')}
                      {stay.depositRefundAmount ? ` ₹${stay.depositRefundAmount.toLocaleString('en-IN')}` : ''}
                    </span>
                  ) : ''}
                </p>
              </div>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                {stay.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
