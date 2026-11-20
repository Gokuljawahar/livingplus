// Owner and warden: the day's meal and cleaning orders (with kitchen head-counts),
// and, for owners, which services each PG offers (the modular console).
import { useState, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { MEAL_SLOTS, SLOT_LABELS, type ServiceSettings } from '@livingplus/shared';
import api from '../api/axios';
import StatusPill from './ui/StatusPill';
import { apiErrorMessage } from '../utils/api-error';
import { rupees } from '../utils/money';

type Order = { id: string; type: 'MEAL' | 'HOUSEKEEPING'; slot: keyof typeof SLOT_LABELS; quantity: number; unitPrice: number; status: string; notes?: string | null;
  tenant: { name: string; bed?: { label: string; room: { roomNumber: string } } | null }; property: { name: string } };
type Data = { date: string; orders: Order[]; mealCounts: Record<string, number>; properties: { id: string; name: string; settings: ServiceSettings }[] };

function SettingsCard({ property, onSaved }: { property: Data['properties'][number]; onSaved: () => void }) {
  const [draft, setDraft] = useState<ServiceSettings>(property.settings);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/pg/owner/properties/${property.id}/services`, { settings: draft });
      toast.success('Services saved');
      onSaved();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save services'));
    } finally {
      setSaving(false);
    }
  };
  const toggle = (label: string, checked: boolean, onChange: (value: boolean) => void, hint: string) => (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 accent-navy-900" />
      <span><span className="block font-medium text-navy-900">{label}</span><span className="block text-sm text-muted">{hint}</span></span>
    </label>
  );
  const priceInput = (label: string, value: number, onChange: (value: number) => void) => (
    <label className="block text-sm font-medium text-navy-900">
      {label}
      <span className="mt-1 flex items-center rounded-[6px] border border-field-border bg-white px-2">
        <span className="text-muted">₹</span>
        <input type="number" min={0} max={10000} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} className="tabular w-full px-1 py-2 outline-none" />
      </span>
    </label>
  );
  return (
    <article className="rounded-[14px] border border-hairline bg-white p-5">
      <h3 className="font-sans text-base font-semibold text-navy-900">{property.name}</h3>
      <div className="mt-2 divide-y divide-hairline">
        <div>
          {toggle('Meal orders', draft.mealOrders.enabled, (enabled) => setDraft({ ...draft, mealOrders: { ...draft.mealOrders, enabled } }), 'Residents order breakfast, lunch or dinner for a day.')}
          {draft.mealOrders.enabled && (
            <div className="grid grid-cols-3 gap-2 pb-3 pl-8">
              {MEAL_SLOTS.map((slot) => <Fragment key={slot}>{priceInput(SLOT_LABELS[slot], draft.mealOrders.prices[slot], (price) => setDraft({ ...draft, mealOrders: { ...draft.mealOrders, prices: { ...draft.mealOrders.prices, [slot]: price } } }))}</Fragment>)}
            </div>
          )}
        </div>
        <div>
          {toggle('Housekeeping', draft.housekeeping.enabled, (enabled) => setDraft({ ...draft, housekeeping: { ...draft.housekeeping, enabled } }), 'Residents book a room clean for a morning, afternoon or evening.')}
          {draft.housekeeping.enabled && <div className="w-40 pb-3 pl-8">{priceInput('Price per clean', draft.housekeeping.price, (price) => setDraft({ ...draft, housekeeping: { ...draft.housekeeping, price } }))}</div>}
        </div>
        {toggle('VibeCheck', draft.vibeCheck, (vibeCheck) => setDraft({ ...draft, vibeCheck }), 'Guests compare lifestyle habits with residents before requesting a bed.')}
        {toggle('AI ID checks', draft.kycAi, (kycAi) => setDraft({ ...draft, kycAi }), 'Uploaded IDs are read by AI to flag problems. You still verify.')}
      </div>
      <button type="button" disabled={saving} onClick={() => void save()} className="btn-secondary mt-3">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save services</button>
    </article>
  );
}

export default function OwnerServices({ canEditSettings }: { canEditSettings: boolean }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState('');
  const queryKey = ['owner', 'service-orders', date];
  const { data, isPending } = useQuery({ queryKey, queryFn: async (): Promise<Data> => (await api.get('/pg/owner/service-orders', { params: date ? { date } : {} })).data });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['owner', 'service-orders'] });

  const setStatus = async (orderId: string, status: 'CONFIRMED' | 'DONE' | 'CANCELLED') => {
    try {
      await api.patch(`/pg/owner/service-orders/${orderId}`, { status });
      toast.success(status === 'CONFIRMED' ? 'Order confirmed' : status === 'DONE' ? 'Marked done' : 'Order cancelled');
      await refresh();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update the order'));
    }
  };

  if (isPending || !data) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-navy-900" /></div>;
  const anyOn = data.properties.some((property) => property.settings.mealOrders.enabled || property.settings.housekeeping.enabled);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <label className="block text-sm font-medium text-navy-900">
          Day
          <input type="date" value={date || data.date} onChange={(event) => setDate(event.target.value)} className="mt-1 block rounded-[6px] border border-field-border bg-white px-3 py-2" />
        </label>
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {MEAL_SLOTS.map((slot) => (
            <div key={slot} className="rounded-[14px] border border-hairline bg-white p-3">
              <span className="tabular block font-display text-2xl font-bold text-navy-900">{data.mealCounts[slot] ?? 0}</span>
              <span className="text-sm text-muted">{SLOT_LABELS[slot].toLowerCase()} plates</span>
            </div>
          ))}
        </div>
        <div className="rounded-[14px] border border-hairline bg-white">
          {data.orders.length === 0 ? (
            <p className="px-5 py-6 text-muted">{anyOn ? 'No orders for this day.' : 'Meal and cleaning orders are off. Switch them on below.'}</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {data.orders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-medium text-navy-900">
                      {order.type === 'MEAL' ? `${SLOT_LABELS[order.slot]} × ${order.quantity}` : `Cleaning, ${SLOT_LABELS[order.slot].toLowerCase()}`} · {order.tenant.name}
                    </p>
                    <p className="tabular text-sm text-muted">
                      {order.property.name}{order.tenant.bed ? `, Room ${order.tenant.bed.room.roomNumber}, ${order.tenant.bed.label}` : ''}
                      {order.unitPrice ? ` · ${rupees(order.unitPrice * order.quantity)}` : ''}{order.notes ? ` · ${order.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={order.status} />
                    {order.status === 'REQUESTED' && <button type="button" onClick={() => void setStatus(order.id, 'CONFIRMED')} className="btn-secondary min-h-9 px-3 py-1 text-sm">Confirm</button>}
                    {['REQUESTED', 'CONFIRMED'].includes(order.status) && <button type="button" onClick={() => void setStatus(order.id, 'DONE')} className="btn-secondary min-h-9 px-3 py-1 text-sm">Done</button>}
                    {['REQUESTED', 'CONFIRMED'].includes(order.status) && <button type="button" onClick={() => void setStatus(order.id, 'CANCELLED')} className="min-h-9 px-2 text-sm font-medium text-negative">Cancel</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {canEditSettings && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Services each PG offers</h2>
          <p className="text-muted">Switch on only what you run. Residents and guests see only what's on.</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.properties.map((property) => <SettingsCard key={property.id} property={property} onSaved={() => void refresh()} />)}
          </div>
        </section>
      )}
    </div>
  );
}
