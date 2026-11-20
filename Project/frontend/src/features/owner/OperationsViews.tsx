import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { STAFF_ROLES, STAFF_ROLE_HINTS, STAFF_ROLE_LABELS } from '@livingplus/shared';
import api from '../../api/axios';
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
  const ticketFormApi = useForm<OwnerTicketForm>({ resolver: zodResolver(ownerTicketSchema), defaultValues: EMPTY_TICKET_FORM });

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

  return (
    <section className="grid gap-8 pt-2 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <h2 className="mb-4 text-base font-bold text-ink">Maintenance tickets</h2>
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-ink">{ticket.title}</h3>
                  <StatusPill status={ticket.priority} />
                  <StatusPill status={ticket.status} />
                </div>
                <p className="text-xs text-muted">
                  {ticket.property.name} · {ticket.category.charAt(0) + ticket.category.slice(1).toLowerCase()}
                  {ticket.tenant ? ` · ${ticket.tenant.name}` : ''}
                  {ticket.assignedName ? ` · Assigned to ${ticket.assignedName}` : ''}
                </p>
                <p className="pt-1 text-xs text-ink">{ticket.description}</p>
                {ticket.imageUrl && <p className="text-xs font-medium text-muted">Photo attached</p>}
              </div>
              {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
                <Button variant="secondary" size="sm" onClick={() => void updateTicket(ticket.id, 'RESOLVED')} className="shrink-0">
                  Mark resolved
                </Button>
              )}
            </Card>
          ))}
          {!tickets.length && <EmptyState title="No maintenance tickets yet." />}
        </div>
      </div>

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
    </section>
  );
}
