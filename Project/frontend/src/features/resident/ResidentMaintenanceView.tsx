import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2, Plus, Send, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { Button, Card, EmptyState, StatusPill } from '../../components/ui';
import { apiErrorMessage } from '../../utils/api-error';
import { shortDate } from '../../utils/money';
import { residentTicketSchema, type ResidentTicketForm } from '../../validation/forms';
import type { MaintenanceTicket, Stay } from './types';

const EMPTY_TICKET: ResidentTicketForm = { tenantId: '', title: '', description: '', category: 'OTHER' };

interface Props {
  stays: Stay[];
  tickets: MaintenanceTicket[];
  onChanged: () => Promise<unknown>;
}

export default function ResidentMaintenanceView({ stays, tickets, onChanged }: Props) {
  const [ticketFormFor, setTicketFormFor] = useState('');
  const ticketFormApi = useForm<ResidentTicketForm>({
    resolver: zodResolver(residentTicketSchema),
    defaultValues: EMPTY_TICKET
  });
  const submittingTicket = ticketFormApi.formState.isSubmitting;

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
      await onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not send maintenance request'));
    }
  });

  return (
    <div className="space-y-6">
      {!stays.length && <EmptyState title="No stays found for this number." />}
      {stays.map((stay) => (
        <Card key={stay.id} className="p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-4">
            <h2 className="text-lg font-bold text-navy-900">{stay.property.name}</h2>
            <div className="flex items-center gap-2">
              <StatusPill status={stay.status} />
              {stay.bed && <span className="text-xs font-semibold text-muted">Room {stay.bed.room.roomNumber}, {stay.bed.label}</span>}
            </div>
          </div>

          <section className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-bold text-ink">
                <Wrench className="h-4 w-4 text-navy-900" /> Your requests
              </h3>
              {['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && ticketFormFor !== stay.id && (
                <Button size="sm" onClick={() => openTicketForm(stay.id)}>
                  <Plus className="h-3.5 w-3.5" /> Report an issue
                </Button>
              )}
            </div>

            <div className="mt-4 divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-canvas">
              {tickets
                .filter((ticket) => ticket.tenantId === stay.id)
                .map((ticket) => (
                  <article key={ticket.id} className="p-4 transition-colors hover:bg-surface/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-ink">{ticket.title}</p>
                      <StatusPill status={ticket.status} />
                    </div>
                    <p className="mt-1 text-xs font-medium text-muted">
                      {ticket.category.charAt(0) + ticket.category.slice(1).toLowerCase()} · Reported {shortDate(ticket.createdAt)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap rounded-[var(--radius-chip)] border border-hairline bg-surface p-2.5 text-xs leading-relaxed text-ink">
                      {ticket.description}
                    </p>
                  </article>
                ))}
              {!tickets.some((ticket) => ticket.tenantId === stay.id) && (
                <p className="p-6 text-center text-xs font-medium text-muted">No maintenance requests submitted yet. Everything running smoothly!</p>
              )}
            </div>

            {ticketFormFor === stay.id && (
              <form onSubmit={submitTicket} className="mt-5 space-y-3.5 rounded-[var(--radius-card)] border border-hairline bg-surface p-5">
                <h4 className="text-xs font-bold text-ink">New issue details</h4>
                <label className="block text-xs font-semibold text-ink">Issue category
                  <select {...ticketFormApi.register('category')} className="mt-1 block w-full rounded-[var(--radius-input)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-navy-900">
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
                  <input required maxLength={120} {...ticketFormApi.register('title')} placeholder="e.g. Geyser not heating in 2nd floor bathroom" className="mt-1 block w-full rounded-[var(--radius-input)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-navy-900" />
                </label>
                <label className="block text-sm font-medium text-navy-900">Where is it, and what's wrong?
                  <textarea required maxLength={2000} rows={3} {...ticketFormApi.register('description')} placeholder="Please describe the problem and exact location so staff can fix it quickly…" className="mt-1 block w-full resize-y rounded-[var(--radius-input)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-navy-900" />
                </label>
                {Object.values(ticketFormApi.formState.errors)[0]?.message && (
                  <p role="alert" className="text-xs font-medium text-danger">{Object.values(ticketFormApi.formState.errors)[0]?.message}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={submittingTicket}>
                    {submittingTicket ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send report
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setTicketFormFor('')}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {!['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                Maintenance requests are enabled during an active stay.
              </p>
            )}
          </section>
        </Card>
      ))}
    </div>
  );
}
