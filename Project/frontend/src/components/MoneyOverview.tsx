import { ReceiptIndianRupee, Wallet } from 'lucide-react';

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

  if (!stays.length) return <p className="border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No stays found for this number.</p>;

  return (
    <div className="space-y-4">
      <section className="border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Total outstanding</p>
            <p className="mt-1 text-2xl font-bold text-[#02224B]">₹{totalDue.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Unpaid invoices</p>
            <p className="mt-1 text-2xl font-bold text-slate-700">{unpaid.length}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Overdue</p>
            <p className={`mt-1 text-2xl font-bold ${overdueCount ? 'text-red-700' : 'text-slate-700'}`}>{overdueCount}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">Pay from the My stays tab with UPI, then tap “I paid” so the PG can verify it.</p>
      </section>

      {unpaid.length > 0 && (
        <section className="border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold text-[#02224B]"><ReceiptIndianRupee className="h-4 w-4 text-[#FEB109]" />Unpaid invoices</h2>
          <div className="mt-2 divide-y divide-slate-100">
            {unpaid.map(({ stay, entry }) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div><p className="font-medium text-slate-800">{stay.property.name} · {entry.period} · {entry.entryType}</p><p className="text-slate-600">₹{(entry.amount - entry.paidAmount).toLocaleString('en-IN')} left of ₹{entry.amount.toLocaleString('en-IN')} · due {new Date(entry.dueDate).toLocaleDateString()}</p></div>
                <span className={`text-xs font-semibold uppercase ${entry.status === 'OVERDUE' ? 'text-red-700' : 'text-amber-700'}`}>{entry.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {claims.length > 0 && (
        <section className="border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-[#02224B]">Payment verifications</h2>
          <div className="mt-2 divide-y divide-slate-100">
            {claims.map((claim) => (
              <div key={claim.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div><p className="font-medium text-slate-800">₹{claim.amount.toLocaleString('en-IN')} · {claim.rentEntry.entryType} {claim.rentEntry.period}</p><p className="text-xs text-slate-500">Ref {claim.reference} · {new Date(claim.createdAt).toLocaleDateString()}</p></div>
                <span className={`text-xs font-semibold uppercase ${claim.status === 'PENDING' ? 'text-amber-700' : claim.status === 'APPROVED' ? 'text-emerald-700' : 'text-red-700'}`}>{claim.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold text-[#02224B]"><Wallet className="h-4 w-4 text-[#FEB109]" />Deposits</h2>
        <div className="mt-2 divide-y divide-slate-100">
          {stays.map((stay) => (
            <div key={stay.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div><p className="font-medium text-slate-800">{stay.property.name}</p><p className="text-slate-600">₹{(stay.depositReceived || 0).toLocaleString('en-IN')} paid of ₹{(stay.depositAmount || 0).toLocaleString('en-IN')}{stay.depositRefundStatus && stay.depositRefundStatus !== 'NOT_APPLICABLE' ? ` · Refund ${stay.depositRefundStatus.replace('_', ' ')}${stay.depositRefundAmount ? ` ₹${stay.depositRefundAmount.toLocaleString('en-IN')}` : ''}` : ''}</p></div>
              <span className="text-xs font-semibold uppercase text-slate-500">{stay.status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
