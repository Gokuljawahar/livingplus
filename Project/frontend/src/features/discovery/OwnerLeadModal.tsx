import { useState } from 'react';
import { Building2, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { usePlatformCatalog } from '../../hooks/usePlatformCatalog';
import { apiErrorMessage } from '../../utils/api-error';

const fieldClass =
  'mt-1.5 block w-full rounded-[var(--radius-field)] border border-field-border bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-navy-900';
const labelClass = 'block text-sm font-medium text-navy-900';

interface LeadFormProps {
  onSuccess?: (result: { id: string; reference: string; propertyName: string }) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export function OwnerLeadForm({ onSuccess, onCancel, compact = false }: LeadFormProps) {
  const { catalog } = usePlatformCatalog();
  const leadFacilities = catalog.amenityCategories.flatMap((group) => group.options.slice(0, 3));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ reference: string; propertyName: string } | null>(null);
  const [form, setForm] = useState({
    ownerName: '',
    phone: '',
    email: '',
    propertyName: '',
    city: 'Chennai',
    locality: '',
    address: '',
    propertyType: 'PG',
    genderPolicy: 'ANY',
    propertyCount: '1',
    totalRooms: '',
    totalBeds: '',
    startingRent: '',
    notes: ''
  });
  const [amenities, setAmenities] = useState<string[]>(['Wi-Fi', 'CCTV surveillance']);

  const toggleAmenity = (item: string) => {
    setAmenities((prev) => (prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await api.post('/pg/owner-leads', {
        ...form,
        propertyCount: Number(form.propertyCount) || 1,
        totalRooms: form.totalRooms ? Number(form.totalRooms) : undefined,
        totalBeds: form.totalBeds ? Number(form.totalBeds) : undefined,
        startingRent: form.startingRent ? Number(form.startingRent) : undefined,
        amenities
      });
      const result = {
        id: response.data.id as string,
        reference: response.data.reference as string,
        propertyName: form.propertyName.trim()
      };
      setSubmitted({ reference: result.reference, propertyName: result.propertyName });
      toast.success('Onboarding request received!');
      onSuccess?.(result);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not submit your PG request'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-positive-bg text-positive">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-bold text-navy-900">We received your PG details!</h3>
        <p className="mx-auto max-w-md text-sm text-muted">
          Reference <span className="font-mono font-semibold text-navy-900">{submitted.reference}</span> for{' '}
          <span className="font-semibold text-navy-900">{submitted.propertyName}</span>. Our onboarding team will reach out to collect room photos, facilities, and publish your listing for free — zero setup work from your side.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setSubmitted(null);
              setForm({
                ownerName: '',
                phone: '',
                email: '',
                propertyName: '',
                city: 'Chennai',
                locality: '',
                address: '',
                propertyType: 'PG',
                genderPolicy: 'ANY',
                propertyCount: '1',
                totalRooms: '',
                totalBeds: '',
                startingRent: '',
                notes: ''
              });
            }}
            className="btn-secondary"
          >
            Submit another PG
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-primary">
              Back to marketplace
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-[var(--radius-card)] border border-amber-500/40 bg-amber-50/70 px-4 py-3 text-sm text-navy-900">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-amber-600" />
          Zero self-setup — our concierge team builds and publishes your PG page
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Share basic details below. We collect your room photos, sharing tariffs, and facilities over WhatsApp/call and go live within 24 hours.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Your name *
          <input
            required
            placeholder="e.g. Suresh Krishnan"
            value={form.ownerName}
            onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          WhatsApp / Mobile number *
          <input
            required
            type="tel"
            placeholder="98400 12345"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={fieldClass}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          PG / Property name *
          <input
            required
            placeholder="e.g. GreenLeaf Executive Stay"
            value={form.propertyName}
            onChange={(e) => setForm({ ...form, propertyName: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Email <span className="font-normal text-muted">(optional)</span>
          <input
            type="email"
            placeholder="owner@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={fieldClass}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Locality / Area *
          <input
            required
            placeholder="e.g. Velachery, OMR, Guindy"
            value={form.locality}
            onChange={(e) => setForm({ ...form, locality: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          City
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Accommodation type
          <select
            value={form.propertyType}
            onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
            className={fieldClass}
          >
            {(catalog.propertyTypes.length ? catalog.propertyTypes : [{ value: 'PG', label: 'Paying Guest (PG)' }]).map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </label>
      </div>

      {!compact && (
        <label className={labelClass}>
          Street address / landmark <span className="font-normal text-muted">(optional)</span>
          <input
            placeholder="Door no, street name, nearest bus stop or IT park"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={fieldClass}
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className={labelClass}>
          Residents
          <select
            value={form.genderPolicy}
            onChange={(e) => setForm({ ...form, genderPolicy: e.target.value })}
            className={fieldClass}
          >
            {(catalog.genderPolicies.length
              ? catalog.genderPolicies
              : [{ value: 'ANY', label: 'Co-living / Any' }, { value: 'MEN', label: 'Men' }, { value: 'WOMEN', label: 'Women' }]
            ).map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          No. of PGs
          <input
            type="number"
            min="1"
            max="50"
            value={form.propertyCount}
            onChange={(e) => setForm({ ...form, propertyCount: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Total rooms
          <input
            type="number"
            min="1"
            placeholder="e.g. 12"
            value={form.totalRooms}
            onChange={(e) => setForm({ ...form, totalRooms: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Starting rent (₹)
          <input
            type="number"
            min="1000"
            placeholder="e.g. 7500"
            value={form.startingRent}
            onChange={(e) => setForm({ ...form, startingRent: e.target.value })}
            className={fieldClass}
          />
        </label>
      </div>

      <div>
        <span className={labelClass}>Facilities you offer</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {leadFacilities.map((facility) => {
            const active = amenities.includes(facility);
            return (
              <button
                key={facility}
                type="button"
                aria-pressed={active}
                onClick={() => toggleAmenity(facility)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-navy-900 bg-navy-900 text-white'
                    : 'border-hairline bg-surface text-ink hover:border-field-border'
                }`}
              >
                {facility}
              </button>
            );
          })}
        </div>
      </div>

      <label className={labelClass}>
        Anything else you want us to highlight? <span className="font-normal text-muted">(optional)</span>
        <textarea
          rows={2}
          placeholder="Vacant beds ready now, food menu, multiple branches, preferred call time..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className={`${fieldClass} resize-y`}
        />
      </label>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Request free onboarding call
        </button>
      </div>
    </form>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

export default function OwnerLeadModal({ open, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-lead-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--radius-card)] bg-canvas shadow-[var(--shadow-float)] sm:rounded-[var(--radius-card)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-600">
              <Building2 className="h-4 w-4" /> For PG & Hostel Owners
            </p>
            <h2 id="owner-lead-title" className="mt-1 text-xl font-bold text-navy-900">
              List your PG on Living Plus — We handle the setup
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close list your PG form"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-surface"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          <OwnerLeadForm onCancel={onClose} />
        </div>
      </section>
    </div>
  );
}
