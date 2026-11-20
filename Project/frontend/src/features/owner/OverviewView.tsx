import { Check } from 'lucide-react';
import { rupees, shortDate } from '../../utils/money';
import type { Booking, PaymentClaim, RentEntry, Summary, Ticket, WorkspaceView } from './types';

interface Props {
  summary: Summary;
  rentEntries: RentEntry[];
  tickets: Ticket[];
  paymentClaims: PaymentClaim[];
  bookings: Booking[];
  onNavigate: (view: WorkspaceView) => void;
}

type Need = {
  key: string;
  rank: number;
  text: string;
  detail: string;
  action: string;
  go: WorkspaceView;
  tone: 'negative' | 'attention' | 'info';
};

export default function OverviewView({ summary, rentEntries, tickets, paymentClaims, bookings, onNavigate }: Props) {
  const needs: Need[] = [
    ...(summary.canManageStaff
      ? rentEntries
          .filter((entry) => entry.status === 'OVERDUE' || (['DUE', 'PARTIAL'].includes(entry.status) && new Date(entry.dueDate).getTime() < new Date().setHours(0, 0, 0, 0)))
          .map((entry): Need => ({
            key: `rent-${entry.id}`,
            rank: 0,
            tone: 'negative',
            go: 'rent',
            action: 'Open ledger',
            text: `Rent overdue: ${entry.tenant.name}`,
            detail: `${rupees(Math.max(0, entry.amount - entry.paidAmount))} · due ${shortDate(entry.dueDate)}`
          }))
      : []),
    ...tickets
      .filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status) && ['URGENT', 'HIGH'].includes(ticket.priority))
      .map((ticket): Need => ({
        key: `urgent-${ticket.id}`,
        rank: 1,
        tone: 'negative',
        go: 'maintenance',
        action: 'Assign',
        text: ticket.title,
        detail: `${ticket.priority === 'URGENT' ? 'Urgent' : 'High priority'} · ${ticket.property.name}`
      })),
    ...(summary.canManageStaff
      ? paymentClaims
          .filter((claim) => claim.status === 'PENDING')
          .map((claim): Need => ({
            key: `claim-${claim.id}`,
            rank: 2,
            tone: 'attention',
            go: 'payments',
            action: 'Confirm',
            text: `Payment to confirm: ${claim.tenant.name}`,
            detail: `${rupees(claim.amount)} · ref ${claim.reference}`
          }))
      : []),
    ...bookings
      .filter((booking) => booking.status === 'PENDING')
      .map((booking): Need => ({
        key: `booking-${booking.id}`,
        rank: 3,
        tone: 'attention',
        go: 'bookings',
        action: 'Review',
        text: `${booking.residentName} wants ${booking.bed ? `Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : 'a bed'}`,
        detail: `${booking.property.name} · move-in ${shortDate(booking.moveInDate)}`
      })),
    ...tickets
      .filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status) && !['URGENT', 'HIGH'].includes(ticket.priority))
      .map((ticket): Need => ({
        key: `ticket-${ticket.id}`,
        rank: 4,
        tone: 'info',
        go: 'maintenance',
        action: 'Open',
        text: ticket.title,
        detail: `${ticket.tenant?.name ? `${ticket.tenant.name} · ` : ''}${ticket.property.name}`
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
          <button key={label} type="button" onClick={() => onNavigate(go)} className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-3 text-left hover:border-field-border sm:p-4">
            <span className="tabular block font-display text-xl font-bold leading-none text-navy-900 sm:text-[2rem]">{value}</span>
            <span className="mt-1 block text-sm leading-tight text-muted sm:text-base">{label}</span>
          </button>
        ))}
      </div>
      <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas">
        <h2 className="border-b border-hairline px-5 py-3 font-sans text-base font-semibold text-navy-900">
          Needs you{needs.length > 0 && <span className="tabular text-muted"> ({needs.length})</span>}
        </h2>
        {needs.length ? (
          <ul className="divide-y divide-hairline">
            {needs.slice(0, 8).map((need) => (
              <li key={need.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot[need.tone]}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug text-navy-900 sm:truncate">{need.text}</p>
                  <p className="tabular text-sm text-muted sm:truncate">{need.detail}</p>
                </div>
                <button type="button" onClick={() => onNavigate(need.go)} className="btn-secondary min-h-10 shrink-0 px-3 py-1.5 text-sm">
                  {need.action}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 px-5 py-6 text-positive">
            <Check className="h-5 w-5" aria-hidden="true" /> Nothing needs you right now.
          </p>
        )}
        {needs.length > 8 && (
          <p className="border-t border-hairline px-5 py-2.5 text-sm text-muted">
            {needs.length - 8} more in Bookings, Rent and Maintenance.
          </p>
        )}
      </div>
    </section>
  );
}
