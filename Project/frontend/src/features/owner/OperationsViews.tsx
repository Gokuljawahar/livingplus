import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Cloud, Loader2, Plus, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { STAFF_ROLES, STAFF_ROLE_HINTS, STAFF_ROLE_LABELS } from '@livingplus/shared';
import api from '../../api/axios';
import type { OwnerOpenTicketsDigest } from '../../ai/ai';
import { Button, Card, EmptyState, StatusPill } from '../../components/ui';
import { apiErrorMessage } from '../../utils/api-error';
import { ownerTicketSchema, staffSchema, type OwnerTicketForm, type StaffForm } from '../../validation/forms';
import { ownerInputClass, ownerLabelClass, showFirstError, type Property, type Staff, type Ticket } from './types';

const EMPTY_STAFF_FORM: StaffForm = { name: '', phone: '', email: '', password: '', propertyId: '', role: 'WARDEN' };
const EMPTY_TICKET_FORM: OwnerTicketForm = { title: '', description: '', category: 'PLUMBING', priority: 'NORMAL', assignedTo: '' };

export function StaffView({ staff, properties, onChanged }: { staff: Staff[]; properties: Property[]; onChanged: () => void }) {
  const staffFormApi = useForm<StaffForm>({ resolver: zodResolver(staffSchema), defaultValues: EMPTY_STAFF_FORM });

  const addStaff = staffFormApi.handleSubmit(async (staffForm) => {
    try {
      await api.post('/pg/owner/staff', staffForm);
      staffFormApi.reset(EMPTY_STAFF_FORM);
      toast.success('Warden account created');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create staff account'));
    }
  }, showFirstError);

  const removeStaff = async (member: Staff) => {
    try {
      await api.delete(`/pg/owner/staff/${member.property.id}/${member.id}`);
      toast.success('Staff access removed');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not remove staff access'));
    }
  };

  return (
    <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <h2 className="mb-4 text-base font-bold text-ink">Your team</h2>
        <div className="space-y-3">
          {staff.map((member) => (
            <Card key={`${member.property.id}-${member.id}`} className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-bold text-ink">
                  {member.name}{' '}
                  <span className="ml-1 rounded-full bg-info-bg px-2 py-0.5 text-[13px] font-medium text-info">
                    {STAFF_ROLE_LABELS[member.role as keyof typeof STAFF_ROLE_LABELS] ?? member.role}
                  </span>
                </p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {member.property.name} · {member.phone}
                  {member.email ? ` · ${member.email}` : ''}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => void removeStaff(member)}>
                Remove access
              </Button>
            </Card>
          ))}
          {!staff.length && <EmptyState title="No staff added yet." />}
        </div>
      </div>

      <Card className="h-fit p-6">
        <form onSubmit={addStaff}>
          <h2 className="border-b border-hairline pb-3 text-sm font-bold text-ink">Add staff</h2>
          <div className="mt-4 space-y-3">
            <fieldset>
              <legend className="mb-1 block text-[13px] font-medium text-navy-900">Role</legend>
              <div className="space-y-1.5">
                {STAFF_ROLES.map((role) => (
                  <label key={role} className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-button)] border border-hairline p-2 has-[:checked]:border-navy-900 has-[:checked]:bg-amber-50">
                    <input type="radio" value={role} {...staffFormApi.register('role')} className="mt-1 accent-navy-900" />
                    <span>
                      <span className="block text-sm font-medium text-navy-900">{STAFF_ROLE_LABELS[role]}</span>
                      <span className="block text-[13px] text-muted">{STAFF_ROLE_HINTS[role]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className={ownerLabelClass}>Property</label>
              <select required {...staffFormApi.register('propertyId')} className={ownerInputClass}>
                <option value="">Assign property</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>Full name</label>
              <input required placeholder="Full name" {...staffFormApi.register('name')} className={ownerInputClass} />
            </div>
            <div>
              <label className={ownerLabelClass}>Phone number</label>
              <input required type="tel" placeholder="Phone number" {...staffFormApi.register('phone')} className={ownerInputClass} />
            </div>
            <div>
              <label className={ownerLabelClass}>Email (optional)</label>
              <input type="email" placeholder="Email (optional)" {...staffFormApi.register('email')} className={ownerInputClass} />
            </div>
            <div>
              <label className={ownerLabelClass}>Temporary password</label>
              <input required type="password" minLength={8} placeholder="Temporary password" {...staffFormApi.register('password')} className={ownerInputClass} />
            </div>
          </div>
          <Button type="submit" disabled={staffFormApi.formState.isSubmitting} className="mt-5 w-full">
            Create warden account
          </Button>
        </form>
      </Card>
    </section>
  );
}

export function MaintenanceView({
  tickets,
  properties,
  staff,
  selectedPropertyId,
  setSelectedPropertyId,
  onChanged
}: {
  tickets: Ticket[];
  properties: Property[];
  staff: Staff[];
  selectedPropertyId: string;
  setSelectedPropertyId: (id: string) => void;
  onChanged: () => void;
}) {
  const [ticketImage, setTicketImage] = useState<File | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestState, setDigestState] = useState<{
    data: OwnerOpenTicketsDigest;
    latencyMs?: number;
    fallback?: boolean;
  } | null>(null);
  const ticketFormApi = useForm<OwnerTicketForm>({ resolver: zodResolver(ownerTicketSchema), defaultValues: EMPTY_TICKET_FORM });

  const summarizeOpenTickets = async () => {
    const open = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS');
    if (open.length === 0) {
      toast('No open tickets to summarise right now.');
      return;
    }
    setDigestLoading(true);
    try {
      const { summarizeOwnerOpenTickets } = await import('../../ai/ai');
      const res = await summarizeOwnerOpenTickets(
        open.map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          priority: t.priority,
          status: t.status,
          description: t.description,
          tenantName: t.tenant?.name
        }))
      );
      setDigestState({ data: res.data, latencyMs: res.latencyMs, fallback: false });
    } catch {
      const urgentCount = open.filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH').length;
      const byCat = open.reduce<Record<string, number>>((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + 1;
        return acc;
      }, {});
      const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
      setDigestState({
        fallback: true,
        data: {
          bullets: [
            `${open.length} open or active ticket${open.length === 1 ? '' : 's'} across your PGs (${urgentCount} high/urgent priority).`,
            topCat ? `Most frequent category right now: ${topCat[0]} (${topCat[1]} ticket${topCat[1] === 1 ? '' : 's'}).` : 'Tickets span mixed categories.',
            'Configure VITE_FIREBASE_* keys to enable live Cloud Gemini cross-ticket reasoning.'
          ],
          repeatedPatterns: topCat && topCat[1] >= 2 ? [`Multiple ${topCat[0]} issues open simultaneously (${topCat[1]})`] : []
        }
      });
    } finally {
      setDigestLoading(false);
    }
  };

  const createTicket = ticketFormApi.handleSubmit(async (ticketForm) => {
    if (!selectedPropertyId) return;
    try {
      let imageUrl: string | undefined;
      if (ticketImage) {
        const upload = new FormData();
        upload.append('image', ticketImage);
        const uploadResponse = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
        imageUrl = uploadResponse.data.fileKey;
      }
      await api.post('/pg/owner/maintenance', { ...ticketForm, propertyId: selectedPropertyId, imageUrl });
      ticketFormApi.reset(EMPTY_TICKET_FORM);
      setTicketImage(null);
      toast.success('Maintenance ticket created');
      setShowForm(false);
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create ticket'));
    }
  }, showFirstError);

  const updateTicket = async (ticketId: string, status: string) => {
    try {
      await api.patch(`/pg/owner/maintenance/${ticketId}/status`, { status });
      toast.success('Ticket status updated');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update ticket'));
    }
  };

  const waiting = (value: string) => {
    const hours = Math.max(0, Math.round((openedAt - new Date(value).getTime()) / 3_600_000));
    return hours < 1 ? 'just now' : hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
  };
  const columns: { title: string; hint: string; items: Ticket[]; action?: { label: string; next: string } }[] = [
    { title: 'New', hint: 'Reported, not started', items: tickets.filter((ticket) => ticket.status === 'OPEN'), action: { label: 'Start fixing', next: 'IN_PROGRESS' } },
    { title: 'Being fixed', hint: 'Someone is on it', items: tickets.filter((ticket) => ticket.status === 'IN_PROGRESS'), action: { label: 'Mark fixed', next: 'RESOLVED' } },
    { title: 'Done', hint: 'Most recent first', items: tickets.filter((ticket) => ticket.status === 'RESOLVED' || ticket.status === 'CLOSED').slice(0, 6) }
  ];

  return (
    <section className="space-y-5 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">{columns[0]!.items.length} new · {columns[1]!.items.length} being fixed</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={digestLoading}
            onClick={() => void summarizeOpenTickets()}
          >
            {digestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-600" />}
            Summarise today&apos;s open tickets
          </Button>
          <Button onClick={() => setShowForm((open) => !open)}>{showForm ? 'Close' : 'Report an issue'}</Button>
        </div>
      </div>

      {digestState && (
        <Card className="border-navy-900/20 bg-surface/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-navy-900">Today&apos;s open tickets digest</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-canvas px-2.5 py-0.5 text-[11px] font-bold text-navy-900">
                <Cloud className="h-3 w-3 text-sky-700" />
                {digestState.fallback
                  ? 'Local summary fallback (Cloud Gemini unconfigured)'
                  : `Analysed in the cloud ☁️${digestState.latencyMs ? ` · ${digestState.latencyMs} ms` : ''}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDigestState(null)}
              aria-label="Close ticket digest"
              className="rounded p-1 text-muted hover:bg-canvas hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink">
            {digestState.data.bullets.map((bullet, idx) => (
              <li key={idx}>{bullet}</li>
            ))}
          </ul>
          {digestState.data.repeatedPatterns.length > 0 && (
            <div className="mt-3 rounded-[var(--radius-field)] border border-amber-500/30 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
              <span className="font-bold">Repeated patterns: </span>
              {digestState.data.repeatedPatterns.join(' · ')}
            </div>
          )}
        </Card>
      )}
      {showForm && (
      <Card className="h-fit p-6">
        <form onSubmit={createTicket}>
          <h2 className="border-b border-hairline pb-3 text-sm font-bold text-ink">Report an issue</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className={ownerLabelClass}>Property</label>
              <select
                required
                value={selectedPropertyId}
                onChange={(event) => {
                  setSelectedPropertyId(event.target.value);
                  ticketFormApi.setValue('assignedTo', '');
                }}
                className={ownerInputClass}
              >
                <option value="">Select property</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>Assign to</label>
              <select {...ticketFormApi.register('assignedTo')} className={ownerInputClass}>
                <option value="">Unassigned</option>
                {staff.filter((member) => member.property.id === selectedPropertyId).map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>What's wrong</label>
              <input required placeholder="Issue title" {...ticketFormApi.register('title')} className={ownerInputClass} />
            </div>
            <div>
              <label className={ownerLabelClass}>Description</label>
              <textarea required rows={3} placeholder="Describe the issue" {...ticketFormApi.register('description')} className={`${ownerInputClass} resize-y`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select {...ticketFormApi.register('category')} className={`min-w-0 ${ownerInputClass}`}>
                <option value="PLUMBING">Plumbing</option>
                <option value="ELECTRICAL">Electrical</option>
                <option value="APPLIANCE">Appliance</option>
                <option value="CLEANING">Cleaning</option>
                <option value="OTHER">Other</option>
              </select>
              <select {...ticketFormApi.register('priority')} className={`min-w-0 ${ownerInputClass}`}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label className={ownerLabelClass}>Photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setTicketImage(event.target.files?.[0] || null)}
                className="block w-full text-xs text-muted file:mr-3 file:rounded-[var(--radius-button)] file:border-0 file:bg-surface file:px-3 file:py-2 file:text-xs file:font-semibold"
              />
            </div>
          </div>
          <Button type="submit" disabled={ticketFormApi.formState.isSubmitting || !properties.length} className="mt-5 w-full">
            <Plus className="h-4 w-4" /> Create ticket
          </Button>
        </form>
      </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((column) => (
          <div key={column.title} className="min-w-0 rounded-[var(--radius-card)] bg-surface p-3">
            <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-base font-semibold text-ink">{column.title} <span className="tabular text-muted">({column.items.length})</span></h2>
              <span className="text-xs text-muted">{column.hint}</span>
            </div>
            <div className="space-y-3">
              {column.items.map((ticket) => (
                <Card key={ticket.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{ticket.title}</h3>
                    {(ticket.priority === 'URGENT' || ticket.priority === 'HIGH') && <StatusPill status={ticket.priority} />}
                  </div>
                  <p className="text-xs text-muted">
                    {ticket.property.name}{ticket.tenant ? ` · ${ticket.tenant.name}` : ''} · {waiting(ticket.createdAt)}
                    {ticket.assignedName ? ` · ${ticket.assignedName}` : ''}
                  </p>
                  <p className="text-sm text-ink">{ticket.description}</p>
                  {ticket.imageUrl && <p className="text-xs font-medium text-muted">Photo attached</p>}
                  {column.action && (
                    <Button variant="secondary" size="sm" onClick={() => void updateTicket(ticket.id, column.action!.next)}>{column.action.label}</Button>
                  )}
                </Card>
              ))}
              {!column.items.length && <p className="px-1 py-4 text-sm text-muted">Nothing here.</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
