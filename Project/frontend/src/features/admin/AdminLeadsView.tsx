import { useState } from 'react';
import { ArrowRight, Building2, Check, Loader2, MapPin, MessageCircle, Phone, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, PROPERTY_TYPE_SHORT_LABELS, type LeadStatus, type PropertyType } from '@livingplus/shared';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/api-error';
import { rupees } from '../../utils/money';
import type { AdminOverview, OwnerLead } from './types';

interface Props {
  overview?: AdminOverview;
  leads: OwnerLead[];
  loading: boolean;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  search: string;
  setSearch: (search: string) => void;
  onStartOnboard: (lead: OwnerLead) => void;
  onChanged: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-amber-50 text-navy-900 border-amber-500/40',
  CONTACTED: 'bg-info-bg text-info border-info/20',
  IN_PROGRESS: 'bg-attention-bg text-attention border-attention/20',
  PUBLISHED: 'bg-positive-bg text-positive border-positive/20',
  ARCHIVED: 'bg-closed-bg text-muted border-hairline'
};

export default function AdminLeadsView({
  overview,
  leads,
  loading,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  onStartOnboard,
  onChanged
}: Props) {
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const updateLead = async (leadId: string, patch: { status?: string; internalNotes?: string }) => {
    setSavingId(leadId);
    try {
      await api.patch(`/admin/leads/${leadId}`, patch);
      toast.success('Lead updated');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update lead'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="stat-card">
            <span className="text-xs font-semibold text-muted">New Owner Leads</span>
            <span className="tabular text-2xl font-bold text-navy-900">{overview.leadCounts.NEW ?? 0}</span>
            <span className="text-xs text-muted">{overview.leadCounts.IN_PROGRESS ?? 0} currently onboarding</span>
          </div>
          <div className="stat-card">
            <span className="text-xs font-semibold text-muted">Live Marketplace PGs</span>
            <span className="tabular text-2xl font-bold text-positive">{overview.activeProperties}</span>
            <span className="text-xs text-muted">{overview.draftProperties} unpublished drafts</span>
          </div>
          <div className="stat-card">
            <span className="text-xs font-semibold text-muted">Partner Owners</span>
            <span className="tabular text-2xl font-bold text-navy-900">{overview.ownersCount}</span>
            <span className="text-xs text-muted">Active workspace owners</span>
          </div>
          <div className="stat-card">
            <span className="text-xs font-semibold text-muted">Bed Inventory</span>
            <span className="tabular text-2xl font-bold text-navy-900">{overview.availableBeds}</span>
            <span className="text-xs text-muted">available of {overview.totalBeds} total beds</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-hairline bg-canvas p-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter leads by status">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              !statusFilter ? 'bg-navy-900 text-white' : 'bg-surface text-ink hover:bg-hairline'
            }`}
          >
            All ({overview?.totalLeads ?? leads.length})
          </button>
          {LEAD_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                statusFilter === status ? 'bg-navy-900 text-white' : 'bg-surface text-ink hover:bg-hairline'
              }`}
            >
              {LEAD_STATUS_LABELS[status]} ({overview?.leadCounts[status] ?? 0})
            </button>
          ))}
        </div>

        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search owner, PG, locality, phone..."
            aria-label="Search owner leads"
            className="w-full rounded-[var(--radius-field)] border border-hairline bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-navy-900 focus:bg-canvas"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-navy-900" />
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-10 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted" />
          <h2 className="mt-3 text-lg font-bold text-navy-900">No owner inquiries match this filter</h2>
          <p className="mt-1 text-sm text-muted">
            When PG owners click “List Your PG” on the marketplace landing page, their inquiry appears right here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => {
            const noteValue = notesDraft[lead.id] ?? lead.internalNotes ?? '';
            const typeLabel = PROPERTY_TYPE_SHORT_LABELS[lead.propertyType as PropertyType] || lead.propertyType;
            const waDigits = lead.phone.replace(/\D/g, '');
            return (
              <article key={lead.id} className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_COLORS[lead.status] || STATUS_COLORS.NEW}`}>
                        {LEAD_STATUS_LABELS[lead.status as LeadStatus] || lead.status}
                      </span>
                      <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-navy-900">
                        {typeLabel} · {lead.genderPolicy}
                      </span>
                      {lead.propertyCount > 1 && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-navy-900">
                          {lead.propertyCount} properties
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        Received {new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-navy-900">{lead.propertyName}</h3>
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink">
                      <span className="font-semibold">{lead.ownerName}</span>
                      <span className="inline-flex items-center gap-1 text-muted">
                        <Phone className="h-3.5 w-3.5" /> +{waDigits}
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted">
                        <MapPin className="h-3.5 w-3.5" /> {lead.locality}, {lead.city}
                      </span>
                    </p>
                    {lead.address && <p className="text-xs text-muted">{lead.address}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`Hi ${lead.ownerName}, this is the Living Plus onboarding team following up on ${lead.propertyName} in ${lead.locality}.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary px-3 py-2 text-xs"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => onStartOnboard(lead)}
                      className="btn-primary px-4 py-2 text-xs"
                    >
                      {lead.onboardedPropertyId ? 'Onboard another PG' : 'Start Onboarding'} <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 border-t border-hairline pt-3 text-xs text-muted">
                  {lead.totalRooms && <span>Rooms: <strong className="text-navy-900">{lead.totalRooms}</strong></span>}
                  {lead.totalBeds && <span>Beds: <strong className="text-navy-900">{lead.totalBeds}</strong></span>}
                  {lead.startingRent && <span>Starting rent: <strong className="text-navy-900">{rupees(lead.startingRent)}/mo</strong></span>}
                  {lead.email && <span>Email: <strong className="text-navy-900">{lead.email}</strong></span>}
                </div>

                {Array.isArray(lead.amenities) && lead.amenities.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {lead.amenities.map((amenity) => (
                      <span key={amenity} className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-ink">
                        {amenity}
                      </span>
                    ))}
                  </div>
                )}

                {lead.notes && (
                  <p className="mt-3 rounded-[var(--radius-field)] bg-surface px-3 py-2 text-sm text-ink">
                    “{lead.notes}”
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                  <select
                    aria-label={`Status for ${lead.propertyName}`}
                    value={lead.status}
                    disabled={savingId === lead.id}
                    onChange={(e) => void updateLead(lead.id, { status: e.target.value })}
                    className="rounded-[var(--radius-field)] border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-navy-900 outline-none"
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <input
                    value={noteValue}
                    onChange={(e) => setNotesDraft((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                    placeholder="Add internal concierge note (photo shoot scheduled, owner preferences...)"
                    className="min-w-[240px] flex-1 rounded-[var(--radius-field)] border border-hairline bg-surface px-3 py-1.5 text-xs text-ink outline-none focus:border-navy-900 focus:bg-canvas"
                  />
                  <button
                    type="button"
                    disabled={savingId === lead.id || noteValue === (lead.internalNotes ?? '')}
                    onClick={() => void updateLead(lead.id, { internalNotes: noteValue })}
                    className="btn-secondary min-h-8 px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" /> Save note
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
