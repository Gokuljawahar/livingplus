// Resident home, money first (DESIGN.md §4.2): what do I owe, by when, and is
// anything still open for me? One primary action: pay.
import { CheckCircle2, Wrench } from 'lucide-react';
import StatusPill from './ui/StatusPill';
import { rupees, shortDate } from '../utils/money';

type RentEntry = { id: string; entryType: string; amount: number; paidAmount: number; status: string; dueDate: string };
type Stay = { id: string; name: string; bed?: { label: string; room: { roomNumber: string } } | null; rentEntries: RentEntry[] };
type Ticket = { id: string; tenantId: string; title: string; status: string };
type Claim = { id: string; tenantId: string; amount: number; status: string };

const ENTRY_LABELS: Record<string, string> = { RENT: 'Rent', FOOD: 'Food', ELECTRICITY: 'Electricity', DEPOSIT: 'Deposit', MAINTENANCE: 'Maintenance' };
const UNPAID = new Set(['DUE', 'PARTIAL', 'OVERDUE']);
const OPEN_TICKETS = new Set(['OPEN', 'IN_PROGRESS']);

interface ResidentHomeProps {
  stay: Stay;
  tickets: Ticket[];
  claims: Claim[];
  onPay: () => void;
  onReport: () => void;
}

export default function ResidentHome({ stay, tickets, claims, onPay, onReport }: ResidentHomeProps) {
  const unpaid = stay.rentEntries.filter((entry) => UNPAID.has(entry.status));
  const outstanding = unpaid.reduce((sum, entry) => sum + Math.max(0, entry.amount - (entry.paidAmount || 0)), 0);
  const nextDue = unpaid.map((entry) => new Date(entry.dueDate)).sort((a, b) => a.getTime() - b.getTime())[0];
  const overdue = unpaid.some((entry) => entry.status === 'OVERDUE') || Boolean(nextDue && nextDue.getTime() < new Date().setHours(0, 0, 0, 0));
  const byType = new Map<string, number>();
  for (const entry of unpaid) byType.set(entry.entryType, (byType.get(entry.entryType) || 0) + Math.max(0, entry.amount - (entry.paidAmount || 0)));
  const waiting = claims.filter((claim) => claim.tenantId === stay.id && claim.status === 'PENDING').reduce((sum, claim) => sum + claim.amount, 0);
  const open = tickets.filter((ticket) => ticket.tenantId === stay.id && OPEN_TICKETS.has(ticket.status));
  const firstName = stay.name.split(' ')[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-labelledby="money-heading" className="rounded-[14px] border border-hairline bg-white p-5">
        <p className="text-muted">
          Hi {firstName}
          {stay.bed ? `, Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''}
        </p>
        {outstanding > 0 ? (
          <>
            <h2 id="money-heading" className="mt-2 text-[2rem] font-bold leading-tight">
              <span className="tabular">{rupees(outstanding)}</span>{' '}
              <span className={`font-sans text-lg font-semibold ${overdue ? 'text-negative' : 'text-attention'}`}>
                {nextDue ? (overdue ? `overdue since ${shortDate(nextDue)}` : `due by ${shortDate(nextDue)}`) : 'due'}
              </span>
            </h2>
            <p className="tabular mt-1 text-muted">
              {[...byType.entries()].map(([type, amount]) => `${ENTRY_LABELS[type] ?? type.toLowerCase()} ${rupees(amount)}`).join(', ')}
            </p>
            {waiting > 0 && (
              <p className="mt-3 rounded-[10px] bg-attention-bg px-3 py-2 text-attention">
                <span className="tabular font-semibold">{rupees(waiting)}</span> paid, waiting for the owner to confirm
              </p>
            )}
            <button onClick={onPay} className="btn-primary mt-4 w-full sm:w-auto">Pay rent</button>
          </>
        ) : (
          <>
            <h2 id="money-heading" className="mt-2 flex items-center gap-2 text-2xl font-bold text-positive">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> You're all paid up
            </h2>
            <p className="mt-1 text-muted">
              {waiting > 0 ? `${rupees(waiting)} is waiting for the owner to confirm.` : 'Nothing is due right now. New dues appear here first.'}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="requests-heading" className="rounded-[14px] border border-hairline bg-white p-5">
        <h2 id="requests-heading" className="text-xl font-semibold">
          Open requests{open.length > 0 && <span className="tabular text-muted"> ({open.length})</span>}
        </h2>
        {open.length > 0 ? (
          <ul className="mt-2 divide-y divide-hairline">
            {open.slice(0, 4).map((ticket) => (
              <li key={ticket.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-ink">{ticket.title}</span>
                <StatusPill status={ticket.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted">Nothing open. If something needs fixing, tell the warden here.</p>
        )}
        <button onClick={onReport} className="btn-secondary mt-4 w-full sm:w-auto">
          <Wrench className="h-4 w-4" aria-hidden="true" /> Report an issue
        </button>
      </section>
    </div>
  );
}
