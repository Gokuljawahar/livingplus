// Resident money: what you owe first (one number, one status), then each bill
// by name ("October 2026 rent"), your payment claims, and your deposit.
import StatusPill from './ui/StatusPill';
import { billName, rupees, shortDate } from '../utils/money';

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

const card = 'rounded-[14px] border border-hairline bg-white';

export default function MoneyOverview({ stays, claims }: { stays: MoneyStay[]; claims: MoneyClaim[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const unpaid = stays
    .flatMap((stay) => stay.rentEntries.filter((entry) => entry.status !== 'PAID').map((entry) => ({ stay, entry })))
    .map(({ stay, entry }) => ({ stay, entry, overdue: entry.status === 'OVERDUE' || entry.dueDate.slice(0, 10) < today }))
    .sort((a, b) => a.entry.dueDate.localeCompare(b.entry.dueDate));
  const totalDue = unpaid.reduce((sum, { entry }) => sum + Math.max(0, entry.amount - entry.paidAmount), 0);
  const overdue = unpaid.filter((item) => item.overdue);
  const nextDue = unpaid[0];
  const multipleStays = stays.length > 1;

  if (!stays.length) return (
    <div className={`${card} px-6 py-12 text-center text-muted`}>No stays found for this number.</div>
  );

  return (
    <div className="space-y-5">
      <section className={`${card} p-5 sm:p-6`} aria-labelledby="owed-heading">
        <h2 id="owed-heading" className="text-sm font-medium text-muted">You owe</h2>
        <p className="tabular mt-1 font-display text-4xl font-bold text-navy-900">{rupees(totalDue)}</p>
        <p className={`mt-1 ${overdue.length ? 'font-medium text-negative' : 'text-muted'}`}>
          {!unpaid.length
            ? 'All paid up. Nothing is due.'
            : overdue.length
              ? `${overdue.length === 1 ? '1 bill is' : `${overdue.length} bills are`} overdue since ${shortDate(overdue[0]!.entry.dueDate)}`
              : `Next due ${shortDate(nextDue!.entry.dueDate)}`}
        </p>
      </section>

      {unpaid.length > 0 && (
        <section className={card} aria-labelledby="bills-heading">
          <h2 id="bills-heading" className="px-5 pt-5 text-lg font-semibold sm:px-6">Unpaid bills</h2>
          <ul className="mt-2 divide-y divide-hairline">
            {unpaid.map(({ stay, entry, overdue: late }) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="font-medium text-navy-900 first-letter:uppercase">{billName(entry.period, entry.entryType)}</p>
                  <p className="text-sm text-muted">
                    {entry.paidAmount > 0 ? `${rupees(entry.amount - entry.paidAmount)} left of ${rupees(entry.amount)}` : rupees(entry.amount)}
                    {' · '}due {shortDate(entry.dueDate)}{multipleStays ? ` · ${stay.property.name}` : ''}
                  </p>
                </div>
                <StatusPill status={late ? 'OVERDUE' : entry.status === 'PARTIAL' ? 'PARTIAL' : 'DUE'} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {claims.length > 0 && (
        <section className={card} aria-labelledby="claims-heading">
          <h2 id="claims-heading" className="px-5 pt-5 text-lg font-semibold sm:px-6">Payments you reported</h2>
          <ul className="mt-2 divide-y divide-hairline">
            {claims.map((claim) => (
              <li key={claim.id} className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="font-medium text-navy-900">
                    <span className="tabular">{rupees(claim.amount)}</span> for <span className="first-letter:lowercase">{billName(claim.rentEntry.period, claim.rentEntry.entryType)}</span>
                  </p>
                  <p className="text-sm text-muted">UPI ref {claim.reference} · sent {shortDate(claim.createdAt)}</p>
                  {claim.responseNote && <p className="mt-1 text-sm font-medium text-negative">{claim.responseNote}</p>}
                </div>
                <StatusPill status={claim.status === 'PENDING' ? 'PENDING' : claim.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={card} aria-labelledby="deposit-heading">
        <h2 id="deposit-heading" className="px-5 pt-5 text-lg font-semibold sm:px-6">Deposit</h2>
        <ul className="mt-2 divide-y divide-hairline">
          {stays.map((stay) => {
            const refund = stay.depositRefundStatus && stay.depositRefundStatus !== 'NOT_APPLICABLE';
            return (
              <li key={stay.id} className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="font-medium text-navy-900">{stay.property.name}</p>
                  <p className="text-sm text-muted">
                    {stay.depositAmount > 0
                      ? <><span className="tabular">{rupees(stay.depositReceived)}</span> paid of <span className="tabular">{rupees(stay.depositAmount)}</span> agreed</>
                      : 'No deposit agreed'}
                    {refund && <> · refund {stay.depositRefundStatus!.toLowerCase().replace(/_/g, ' ')}{stay.depositRefundAmount ? ` ${rupees(stay.depositRefundAmount)}` : ''}</>}
                  </p>
                </div>
                <StatusPill status={stay.status} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
