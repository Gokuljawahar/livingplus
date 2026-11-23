import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { Button, Card, EmptyState, StatusPill } from '../../components/ui';
import { apiErrorMessage } from '../../utils/api-error';
import { billName, shortDate } from '../../utils/money';
import { downloadXlsx } from '../../utils/xlsx';
import {
  electricityBillSchema,
  expenseSchema,
  rentEntrySchema,
  type ElectricityBillForm,
  type ExpenseForm,
  type RentEntryForm
} from '../../validation/forms';
import RecordPaymentForm, { type RecordPaymentValues } from './RecordPaymentForm';
import {
  localDate,
  localMonth,
  ownerInputClass,
  ownerLabelClass,
  showFirstError,
  type ElecBill,
  type Expense,
  type OwnerReport,
  type PaymentClaim,
  type Property,
  type RentEntry,
  type Tenant
} from './types';

const emptyRentForm = (): RentEntryForm => ({ tenantId: '', period: localMonth(), amount: '', dueDate: '' });
const emptyExpenseForm = (): ExpenseForm => ({ category: 'FOOD', amount: '', spentOn: localDate(), note: '' });
const emptyBillForm = (): ElectricityBillForm => ({ period: localMonth(), totalAmount: '' });

export function PaymentsView({ paymentClaims, onChanged }: { paymentClaims: PaymentClaim[]; onChanged: () => void }) {
  const [rejectingClaimId, setRejectingClaimId] = useState('');
  const [claimRejectionReason, setClaimRejectionReason] = useState('');

  const reviewPaymentClaim = async (claim: PaymentClaim, status: 'APPROVED' | 'REJECTED') => {
    const responseNote = status === 'REJECTED' ? claimRejectionReason.trim() : '';
    if (status === 'REJECTED' && !responseNote) return;
    try {
      await api.patch(`/pg/owner/payment-claims/${claim.id}`, { status, responseNote });
      toast.success(status === 'APPROVED' ? 'Payment verified and ledger updated' : 'Payment claim rejected');
      setRejectingClaimId('');
      setClaimRejectionReason('');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not review payment claim'));
    }
  };

  return (
    <section className="space-y-4 pt-2">
      <h2 className="text-base font-bold text-ink">Resident payment claims</h2>
      <div className="space-y-3">
        {paymentClaims.map((claim) => (
          <Card key={claim.id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-base font-bold text-ink">{claim.tenant.name}</h3>
                <StatusPill status={claim.status} />
              </div>
              <p className="mt-1 text-xs font-medium text-muted">
                {claim.property.name} · {claim.rentEntry.entryType} {claim.rentEntry.period} · ₹{claim.amount.toLocaleString('en-IN')}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                UPI reference: {claim.reference} · Submitted {new Date(claim.createdAt).toLocaleString()}
              </p>
              {claim.responseNote && <p className="mt-1 text-xs font-semibold text-negative">{claim.responseNote}</p>}
            </div>
            {claim.status === 'PENDING' && rejectingClaimId !== claim.id && (
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={() => { setRejectingClaimId(claim.id); setClaimRejectionReason(''); }}>
                  Reject
                </Button>
                <Button size="sm" onClick={() => void reviewPaymentClaim(claim, 'APPROVED')}>
                  Verify and credit
                </Button>
              </div>
            )}
            {claim.status === 'PENDING' && rejectingClaimId === claim.id && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void reviewPaymentClaim(claim, 'REJECTED');
                }}
                className="flex min-w-0 flex-col gap-2 md:w-80"
              >
                <label className="text-xs font-bold text-ink">Reason for rejecting payment
                  <input
                    required
                    maxLength={300}
                    value={claimRejectionReason}
                    onChange={(event) => setClaimRejectionReason(event.target.value)}
                    className={`mt-1 block ${ownerInputClass}`}
                  />
                </label>
                <div className="flex gap-2">
                  <Button type="submit" variant="danger" size="sm">Confirm rejection</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setRejectingClaimId('')}>Cancel</Button>
                </div>
              </form>
            )}
          </Card>
        ))}
        {!paymentClaims.length && <EmptyState title="No resident payment claims awaiting verification." />}
      </div>
    </section>
  );
}

export function RentView({ rentEntries, tenants, onChanged }: { rentEntries: RentEntry[]; tenants: Tenant[]; onChanged: () => void }) {
  const [reminding, setReminding] = useState(false);
  const rentFormApi = useForm<RentEntryForm>({ resolver: zodResolver(rentEntrySchema), defaultValues: emptyRentForm() });

  const addRentEntry = rentFormApi.handleSubmit(async (rentForm) => {
    try {
      await api.post('/pg/owner/rent', rentForm);
      rentFormApi.reset(emptyRentForm());
      toast.success('Ledger entry created');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create ledger entry'));
    }
  }, showFirstError);

  const recordPayment = async (entryId: string, values: RecordPaymentValues) => {
    try {
      await api.patch(`/pg/owner/rent/${entryId}/payment`, {
        amount: values.amount,
        method: values.method,
        reference: values.reference
      });
      toast.success('Payment recorded');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not record payment'));
    }
  };

  const sendReminders = async () => {
    setReminding(true);
    try {
      const response = await api.post('/pg/owner/rent/reminders', {});
      toast.success(`Reminders sent to ${response.data.sent} of ${response.data.total} open dues`);
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not send reminders'));
    } finally {
      setReminding(false);
    }
  };

  return (
    <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">Rent and deposit ledger</h2>
          <Button variant="secondary" size="sm" onClick={() => void sendReminders()} disabled={reminding}>
            {reminding ? 'Sending…' : 'Send due reminders'}
          </Button>
        </div>
        <div className="space-y-3">
          {rentEntries.map((entry) => (
            <Card key={entry.id} className="space-y-3 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-ink">{entry.tenant.name}</h3>
                    <span className="text-xs font-medium text-muted first-letter:uppercase">{billName(entry.period, entry.entryType)}</span>
                    <StatusPill status={entry.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {entry.tenant.property.name}
                    {entry.tenant.bed ? ` · Room ${entry.tenant.bed.room.roomNumber}, ${entry.tenant.bed.label}` : ''} · Due {shortDate(entry.dueDate)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-ink">
                    ₹{entry.paidAmount.toLocaleString('en-IN')} paid of ₹{entry.amount.toLocaleString('en-IN')}
                    {entry.method ? ` · ${entry.method}` : ''}
                    {entry.reference ? ` · Ref ${entry.reference}` : ''}
                  </p>
                </div>
              </div>
              {entry.status !== 'PAID' && (
                <RecordPaymentForm remaining={entry.amount - entry.paidAmount} onSubmit={(values) => recordPayment(entry.id, values)} />
              )}
            </Card>
          ))}
          {!rentEntries.length && <EmptyState title="No rent entries yet." />}
        </div>
      </div>

      <Card className="h-fit p-6">
        <form onSubmit={addRentEntry}>
          <h2 className="border-b border-hairline pb-3 text-sm font-bold text-ink">Add ledger charge</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className={ownerLabelClass}>Resident</label>
              <select required {...rentFormApi.register('tenantId')} className={ownerInputClass}>
                <option value="">Select resident</option>
                {tenants.filter((tenant) => tenant.status === 'ACTIVE').map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.property.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>Period</label>
              <select {...rentFormApi.register('period')} className={ownerInputClass}>
                <option value={new Date().toISOString().slice(0, 7)}>{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>
                <option value="DEPOSIT">Security deposit</option>
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>Amount</label>
              <input required type="number" min="1" placeholder="Amount" {...rentFormApi.register('amount')} className={ownerInputClass} />
            </div>
            <div>
              <label className={ownerLabelClass}>Due date</label>
              <input required type="date" {...rentFormApi.register('dueDate')} className={ownerInputClass} />
            </div>
          </div>
          <Button type="submit" disabled={rentFormApi.formState.isSubmitting || !tenants.some((tenant) => tenant.status === 'ACTIVE')} className="mt-5 w-full">
            <Plus className="h-4 w-4" /> Add charge
          </Button>
        </form>
      </Card>
    </section>
  );
}

export function ExpensesView({
  expenses,
  expenseTotal,
  properties,
  selectedPropertyId,
  setSelectedPropertyId,
  onChanged
}: {
  expenses: Expense[];
  expenseTotal: number;
  properties: Property[];
  selectedPropertyId: string;
  setSelectedPropertyId: (id: string) => void;
  onChanged: () => void;
}) {
  const expenseFormApi = useForm<ExpenseForm>({ resolver: zodResolver(expenseSchema), defaultValues: emptyExpenseForm() });

  const submitExpense = expenseFormApi.handleSubmit(async (expenseForm) => {
    try {
      await api.post('/pg/owner/expenses', { ...expenseForm, propertyId: selectedPropertyId });
      toast.success('Expense recorded');
      expenseFormApi.reset(emptyExpenseForm());
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not record expense'));
    }
  }, showFirstError);

  const removeExpense = async (expenseId: string) => {
    if (!window.confirm('Remove this expense from the ledger?')) return;
    try {
      await api.delete(`/pg/owner/expenses/${expenseId}`);
      toast.success('Expense removed');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not remove expense'));
    }
  };

  return (
    <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">Property expenses</h2>
          <span className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-bold text-navy-900">
            ₹{expenseTotal.toLocaleString('en-IN')} total
          </span>
        </div>
        <div className="space-y-3">
          {expenses.map((entry) => (
            <Card key={entry.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-ink">₹{entry.amount.toLocaleString('en-IN')}</p>
                  <span className="rounded-[var(--radius-field)] bg-surface px-2 py-0.5 text-xs font-semibold text-muted">{entry.category}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.property.name} · {shortDate(entry.spentOn)}
                  {entry.note ? ` · ${entry.note}` : ''}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => void removeExpense(entry.id)} className="self-start sm:self-auto">
                Remove
              </Button>
            </Card>
          ))}
          {!expenses.length && <EmptyState title="No expenses logged yet." />}
        </div>
      </div>

      <Card className="h-fit p-6">
        <form onSubmit={submitExpense}>
          <h2 className="border-b border-hairline pb-3 text-sm font-bold text-ink">Log expense</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className={ownerLabelClass}>Property</label>
              <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} className={ownerInputClass}>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>Category</label>
              <select {...expenseFormApi.register('category')} className={ownerInputClass}>
                {['FOOD', 'STAFF', 'MAINTENANCE', 'UTILITIES', 'OTHER'].map((category) => (
                  <option key={category} value={category}>{category.charAt(0) + category.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>Amount</label>
              <input required type="number" min="1" placeholder="Amount" {...expenseFormApi.register('amount')} className={ownerInputClass} />
            </div>
            <div>
              <label className={ownerLabelClass}>Date</label>
              <input required type="date" {...expenseFormApi.register('spentOn')} className={ownerInputClass} />
            </div>
            <div>
              <label className={ownerLabelClass}>Note (optional)</label>
              <input placeholder="Note (optional)" {...expenseFormApi.register('note')} className={ownerInputClass} />
            </div>
          </div>
          <Button type="submit" disabled={expenseFormApi.formState.isSubmitting || !selectedPropertyId} className="mt-5 w-full">
            <Plus className="h-4 w-4" /> Log expense
          </Button>
        </form>
      </Card>
    </section>
  );
}

export function UtilitiesView({
  bills,
  properties,
  selectedPropertyId,
  setSelectedPropertyId,
  onChanged
}: {
  bills: ElecBill[];
  properties: Property[];
  selectedPropertyId: string;
  setSelectedPropertyId: (id: string) => void;
  onChanged: () => void;
}) {
  const billFormApi = useForm<ElectricityBillForm>({ resolver: zodResolver(electricityBillSchema), defaultValues: emptyBillForm() });

  const proposeBill = billFormApi.handleSubmit(async (billForm) => {
    try {
      await api.post('/pg/owner/electricity/bills', { ...billForm, propertyId: selectedPropertyId });
      toast.success('Bill split proposed — review and approve below');
      billFormApi.reset(emptyBillForm());
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not propose bill'));
    }
  }, showFirstError);

  const approveBill = async (billId: string) => {
    if (!window.confirm('Approve this split and bill every tenant for this period?')) return;
    try {
      const response = await api.post(`/pg/owner/electricity/bills/${billId}/approve`, {});
      toast.success(`Approved — ${response.data.entries} tenant bills created`);
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not approve bill'));
    }
  };

  return (
    <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <h2 className="mb-4 text-base font-bold text-ink">Electricity bills</h2>
        <div className="space-y-3">
          {bills.map((bill) => (
            <Card key={bill.id} className="space-y-3 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-ink">₹{bill.totalAmount.toLocaleString('en-IN')}</p>
                    <span className="rounded-[var(--radius-field)] bg-surface px-2 py-0.5 text-xs font-semibold text-muted">{bill.period}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {bill.property.name} · <span className="font-bold text-amber-600">{bill.status}</span>
                  </p>
                </div>
                {bill.status === 'DRAFT' && (
                  <Button size="sm" onClick={() => void approveBill(bill.id)}>Review & approve</Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-hairline pt-2">
                {JSON.parse(bill.splitJson || '[]').map((row: { tenantName: string; roomNumber: string; share: number }) => (
                  <span key={row.tenantName} className="rounded-[var(--radius-field)] border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-muted">
                    {row.tenantName} · Room {row.roomNumber} · ₹{row.share.toLocaleString('en-IN')}
                  </span>
                ))}
              </div>
            </Card>
          ))}
          {!bills.length && <EmptyState title="No electricity bills yet." />}
        </div>
      </div>

      <Card className="h-fit p-6">
        <form onSubmit={proposeBill}>
          <h2 className="border-b border-hairline pb-3 text-sm font-bold text-ink">Propose split</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className={ownerLabelClass}>Property</label>
              <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} className={ownerInputClass}>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>Billing month</label>
              <input required type="month" {...billFormApi.register('period')} className={ownerInputClass} />
            </div>
            <div>
              <label className={ownerLabelClass}>Bill total (₹)</label>
              <input required type="number" min="1" placeholder="Bill total" {...billFormApi.register('totalAmount')} className={ownerInputClass} />
            </div>
          </div>
          <Button type="submit" disabled={billFormApi.formState.isSubmitting || !selectedPropertyId} className="mt-5 w-full">
            <Plus className="h-4 w-4" /> Propose split
          </Button>
        </form>
      </Card>
    </section>
  );
}

export function ReportsView({ report }: { report: OwnerReport }) {
  const exportReport = () => {
    const rows = [
      ['Period', 'Property', 'Resident', 'Entry Type', 'Amount', 'Paid', 'Status', 'Due Date'],
      ...report.entries.map((entry) => [
        entry.period,
        entry.tenant.property.name,
        entry.tenant.name,
        entry.entryType,
        entry.amount,
        entry.paidAmount,
        entry.status,
        shortDate(entry.dueDate)
      ])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pg-report-${report.period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportReportExcel = () => {
    downloadXlsx(`pg-report-${report.period}.xlsx`, 'PG Report', [
      ['PG Report', report.period],
      ['Properties', report.properties],
      ['Total beds', report.totalBeds],
      ['Occupied beds', report.occupiedBeds],
      ['Available beds', report.availableBeds],
      ['Occupancy %', report.occupancyRate],
      ['Active tenants', report.activeTenants],
      ['New booking requests', report.newBookings],
      ['Rent charged', report.rentCharged],
      ['Rent collected', report.rentCollected],
      ['Outstanding', report.outstanding],
      [],
      ['Period', 'Property', 'Resident', 'Entry Type', 'Amount', 'Paid', 'Status', 'Due Date'],
      ...report.entries.map((entry) => [
        entry.period,
        entry.tenant.property.name,
        entry.tenant.name,
        entry.entryType,
        entry.amount,
        entry.paidAmount,
        entry.status,
        shortDate(entry.dueDate)
      ])
    ]);
  };

  return (
    <section className="space-y-6 pt-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold text-amber-600">Monthly operations</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-navy-900">Report · {report.period}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportReport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={exportReportExcel}>
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ['Occupancy', `${report.occupancyRate}%`, 'Capacity utilized across properties'],
          ['Available beds', report.availableBeds, 'Beds ready for new move-ins'],
          ['Rent charged', `₹${report.rentCharged.toLocaleString('en-IN')}`, 'Total invoiced this period'],
          ['Rent collected', `₹${report.rentCollected.toLocaleString('en-IN')}`, 'Actual payments received'],
          ['Outstanding', `₹${report.outstanding.toLocaleString('en-IN')}`, 'Unpaid rent balance'],
          ['New booking requests', report.newBookings, 'Applications during period']
        ].map(([label, value, subtext]) => (
          <Card key={String(label)} className="flex flex-col justify-between p-5">
            <p className="text-xs font-bold text-muted">{label}</p>
            <div className="mt-3">
              <p className="text-2xl font-bold text-navy-900">{value}</p>
              <p className="mt-1 text-xs font-medium text-muted">{subtext}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
