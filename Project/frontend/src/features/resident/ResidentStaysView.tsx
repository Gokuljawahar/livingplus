import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Download, ReceiptIndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import ConditionRecords from '../../components/ConditionRecords';
import ResidentHome from '../../components/ResidentHome';
import ResidentVibeCard from '../../components/ResidentVibeCard';
import { Button, Card, EmptyState, StatusPill } from '../../components/ui';
import { apiErrorMessage } from '../../utils/api-error';
import { shortDate } from '../../utils/money';
import { paymentClaimSchema, type PaymentClaimForm } from '../../validation/forms';
import type { MaintenanceTicket, PaymentClaim, ResidentTab, Stay } from './types';

const ENTRY_NAMES: Record<string, string> = {
  RENT: 'rent',
  FOOD: 'food',
  ELECTRICITY: 'electricity',
  DEPOSIT: 'deposit',
  MAINTENANCE: 'maintenance'
};

const EMPTY_PAYMENT: PaymentClaimForm = { tenantId: '', rentEntryId: '', amount: '', reference: '' };

/** "2026-10" -> "Oct 2026" */
const periodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return year && month ? new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : period;
};

interface Props {
  stays: Stay[];
  tickets: MaintenanceTicket[];
  paymentClaims: PaymentClaim[];
  onNavigate: (tab: ResidentTab) => void;
  onChanged: () => Promise<unknown>;
}

export default function ResidentStaysView({ stays, tickets, paymentClaims, onNavigate, onChanged }: Props) {
  const [paymentFormFor, setPaymentFormFor] = useState('');
  const paymentFormApi = useForm<PaymentClaimForm>({
    resolver: zodResolver(paymentClaimSchema),
    defaultValues: EMPTY_PAYMENT
  });
  const submittingPayment = paymentFormApi.formState.isSubmitting;

  const submitNotice = async (stayId: string) => {
    if (!window.confirm('Submit your vacating notice? Your warden will plan the checkout.')) return;
    try {
      await api.post(`/pg/tenant/${stayId}/notice`);
      toast.success('Notice submitted');
      await onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not submit notice'));
    }
  };

  const cancelNotice = async (stayId: string) => {
    if (!window.confirm('Cancel your vacating notice?')) return;
    try {
      await api.post(`/pg/tenant/${stayId}/notice-cancel`);
      toast.success('Vacating notice cancelled');
      await onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not cancel notice'));
    }
  };

  const startPaymentClaim = (stay: Stay, entry: Stay['rentEntries'][number]) => {
    setPaymentFormFor(entry.id);
    paymentFormApi.reset({
      tenantId: stay.id,
      rentEntryId: entry.id,
      amount: String(Math.max(0, entry.amount - entry.paidAmount)),
      reference: ''
    });
  };

  const submitPaymentClaim = paymentFormApi.handleSubmit(async (form) => {
    try {
      await api.post('/pg/tenant/payment-claims', { ...form, amount: Number(form.amount) });
      toast.success('Payment submitted for PG verification');
      setPaymentFormFor('');
      paymentFormApi.reset(EMPTY_PAYMENT);
      await onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not submit payment'));
    }
  });

  const exportReceipts = (stay: Stay) => {
    const rows = [
      ['Resident', stay.name],
      ['Property', stay.property.name],
      ['Period', 'Type', 'Amount', 'Paid', 'Status', 'Method', 'Reference'],
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

  const activeOrNotice = stays.find((stay) => ['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status));
  const vibeStay = stays.find((stay) => ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'].includes(stay.status));

  return (
    <div className="space-y-6">
      {stays[0] && (
        <ResidentHome
          stay={activeOrNotice ?? stays[0]}
          tickets={tickets}
          claims={paymentClaims}
          onPay={() => onNavigate('money')}
          onReport={() => onNavigate('maintenance')}
        />
      )}
      {vibeStay && <ResidentVibeCard tenantId={vibeStay.id} onRoomChange={() => onNavigate('roomchange')} />}
      {stays.length > 0 && <h2 className="pt-2 text-xl font-semibold text-ink">Your stay</h2>}
      {!stays.length && (
        <EmptyState
          title="No active stays found for this number."
          description="If you recently booked, your PG owner will approve your stay shortly."
        />
      )}
      {stays.map((stay) => {
        const isNotice = stay.status === 'NOTICE_PERIOD';
        return (
          <Card key={stay.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-bold text-navy-900">{stay.property.name}</h2>
                  <StatusPill status={stay.status} />
                </div>

                <p className="mt-1.5 text-xs font-medium text-muted">
                  {stay.property.address}, {stay.property.locality}, {stay.property.city}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {stay.bed && (
                    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] bg-surface px-3 py-1 text-xs font-semibold text-ink">
                      <Building2 className="h-3.5 w-3.5 text-navy-900" />
                      Room {stay.bed.room.roomNumber} · {stay.bed.label} ({stay.bed.room.roomType})
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-hairline bg-surface px-3 py-1 text-xs font-bold text-navy-900">
                    ₹{stay.monthlyRent.toLocaleString('en-IN')} / month
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-hairline bg-surface px-3 py-1 text-xs font-medium text-muted">
                    {stay.depositAmount > 0 ? `Deposit ₹${(stay.depositReceived || 0).toLocaleString('en-IN')} paid of ₹${stay.depositAmount.toLocaleString('en-IN')}` : 'No deposit'}
                  </span>
                </div>

                {isNotice && stay.noticeDate && (
                  <p className="mt-2 inline-block rounded-[var(--radius-chip)] border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600">
                    Vacating notice active since {shortDate(stay.noticeDate)}
                  </p>
                )}

                {stay.depositRefundStatus === 'PENDING' && (
                  <p className="mt-2 inline-block rounded-[var(--radius-chip)] border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
                    Deposit refund due: ₹{(stay.depositRefundAmount || 0).toLocaleString('en-IN')}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 self-start sm:flex-row">
                {stay.status === 'ACTIVE' && (
                  <Button variant="secondary" size="sm" onClick={() => void submitNotice(stay.id)}>
                    Give vacating notice
                  </Button>
                )}
                {stay.status === 'NOTICE_PERIOD' && (
                  <Button variant="secondary" size="sm" onClick={() => void cancelNotice(stay.id)}>
                    Cancel vacating notice
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => exportReceipts(stay)}>
                  <Download className="h-3.5 w-3.5" /> Download receipts
                </Button>
              </div>
            </div>

            <ConditionRecords tenantId={stay.id} viewer="resident" />

            <div className="mt-6 border-t border-hairline pt-5">
              <h3 className="mb-3 text-xs font-bold text-muted">Invoices and payments</h3>
              <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface">
                {stay.rentEntries.map((entry) => {
                  const isPaid = entry.status === 'PAID';
                  const balance = Math.max(0, entry.amount - entry.paidAmount);
                  return (
                    <div key={entry.id} className="flex flex-col gap-3 bg-canvas p-3.5 text-sm transition-colors hover:bg-surface/60 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <ReceiptIndianRupee className="h-4 w-4 text-amber-500" />
                          <span className="font-semibold text-navy-900">
                            {periodLabel(entry.period)} {ENTRY_NAMES[entry.entryType] ?? entry.entryType.toLowerCase()}
                          </span>
                          <StatusPill status={entry.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          ₹{entry.paidAmount.toLocaleString('en-IN')} paid of ₹{entry.amount.toLocaleString('en-IN')}
                          {balance > 0 ? ` (₹${balance.toLocaleString('en-IN')} due)` : ''}
                          {entry.reference ? ` · Ref: ${entry.reference}` : ''}
                        </p>
                      </div>

                      {!isPaid && stay.property.upiId && ['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && (
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`upi://pay?pa=${encodeURIComponent(stay.property.upiId)}&pn=${encodeURIComponent(stay.property.name)}&am=${balance.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`${entry.period} ${entry.entryType}`)}`}
                            className="btn-accent rounded-[var(--radius-button)] px-3 py-1.5 text-xs font-bold"
                          >
                            Pay with UPI
                          </a>
                          {paymentClaims.some((claim) => claim.rentEntryId === entry.id && claim.status === 'PENDING') ? (
                            <span className="rounded-[var(--radius-chip)] border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600">
                              Verification pending
                            </span>
                          ) : (
                            <Button size="sm" onClick={() => startPaymentClaim(stay, entry)}>
                              I paid
                            </Button>
                          )}
                        </div>
                      )}

                      {paymentFormFor === entry.id && (
                        <form onSubmit={submitPaymentClaim} className="grid w-full gap-2.5 border-t border-hairline pt-3 sm:grid-cols-[1fr_1.5fr_auto]">
                          <label className="text-xs font-semibold text-ink">
                            Amount paid (₹)
                            <input
                              required
                              type="number"
                              min="0.01"
                              max={balance}
                              step="0.01"
                              {...paymentFormApi.register('amount')}
                              className="mt-1 block w-full rounded-[var(--radius-input)] border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium outline-none focus:border-navy-900"
                            />
                          </label>
                          <label className="text-xs font-semibold text-ink">
                            UPI UTR / Transaction Reference
                            <input
                              required
                              minLength={6}
                              maxLength={80}
                              {...paymentFormApi.register('reference')}
                              placeholder="e.g. 331234567890"
                              className="mt-1 block w-full rounded-[var(--radius-input)] border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium outline-none focus:border-navy-900"
                            />
                          </label>
                          {Object.values(paymentFormApi.formState.errors)[0]?.message && (
                            <p role="alert" className="text-xs font-medium text-danger sm:col-span-3">
                              {Object.values(paymentFormApi.formState.errors)[0]?.message}
                            </p>
                          )}
                          <Button type="submit" size="sm" disabled={submittingPayment} className="self-end">
                            {submittingPayment ? 'Submitting…' : 'Submit verification'}
                          </Button>
                        </form>
                      )}
                    </div>
                  );
                })}
                {!stay.rentEntries.length && (
                  <p className="p-4 text-center text-xs font-medium text-muted">No active invoices issued yet.</p>
                )}
              </div>
            </div>

            {paymentClaims.some((claim) => claim.tenantId === stay.id) && (
              <section className="mt-5 border-t border-hairline pt-4">
                <h3 className="mb-2 text-xs font-bold text-muted">Recent payment claims</h3>
                <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-canvas">
                  {paymentClaims
                    .filter((claim) => claim.tenantId === stay.id)
                    .map((claim) => (
                      <article key={claim.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                        <div>
                          <p className="font-bold text-ink">
                            ₹{claim.amount.toLocaleString('en-IN')} · {claim.rentEntry.entryType} {claim.rentEntry.period}
                          </p>
                          <p className="mt-0.5 text-muted">
                            Ref {claim.reference} · Submitted {shortDate(claim.createdAt)}
                          </p>
                          {claim.responseNote && <p className="mt-1 font-medium text-danger">{claim.responseNote}</p>}
                        </div>
                        <StatusPill status={claim.status} />
                      </article>
                    ))}
                </div>
              </section>
            )}
          </Card>
        );
      })}
    </div>
  );
}
