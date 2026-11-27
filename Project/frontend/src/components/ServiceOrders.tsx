// Resident: order meals or book housekeeping for a day, when the PG offers them.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { CLEANING_SLOTS, MEAL_SLOTS, SLOT_LABELS, type ServiceSettings } from '@livingplus/shared';
import api from '../api/axios';
import { labelFromCatalog, usePlatformCatalog } from '../hooks/usePlatformCatalog';
import StatusPill from './ui/StatusPill';
import { apiErrorMessage } from '../utils/api-error';
import { rupees, shortDate } from '../utils/money';

type Order = { id: string; type: 'MEAL' | 'HOUSEKEEPING'; forDate: string; slot: string; quantity: number; unitPrice: number; status: string; notes?: string | null };
type Data = { settings: ServiceSettings; orders: Order[]; today: string; daysAhead: number };

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export default function ServiceOrders({ tenantId }: { tenantId: string }) {
  const { catalog } = usePlatformCatalog();
  const queryClient = useQueryClient();
  const queryKey = ['resident', 'service-orders', tenantId];
  const { data, isPending } = useQuery({ queryKey, queryFn: async (): Promise<Data> => (await api.get(`/pg/tenant/${tenantId}/service-orders`)).data });
  const [type, setType] = useState<'MEAL' | 'HOUSEKEEPING' | null>(null);
  const [day, setDay] = useState('');
  const [slot, setSlot] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (isPending || !data) return <p className="text-muted">Loading…</p>;
  const meals = data.settings.mealOrders.enabled;
  const cleaning = data.settings.housekeeping.enabled;
  const activeType = type ?? (meals ? 'MEAL' : cleaning ? 'HOUSEKEEPING' : null);
  if (!activeType) {
    return (
      <section className="rounded-[14px] border border-hairline bg-white p-5">
        <h2 className="text-xl font-semibold">Meals and cleaning</h2>
        <p className="mt-1 text-muted">Your PG doesn't take meal or cleaning orders here yet. Ask your warden if you need either.</p>
      </section>
    );
  }
  const date = day || addDays(data.today, 1);
  const mealSlotItems = catalog.mealSlots.length ? catalog.mealSlots : MEAL_SLOTS.map((v) => ({ value: v, label: SLOT_LABELS[v] || v }));
  const cleaningSlotItems = catalog.cleaningSlots.length ? catalog.cleaningSlots : CLEANING_SLOTS.map((v) => ({ value: v, label: SLOT_LABELS[v] || v }));
  const slots = activeType === 'MEAL' ? mealSlotItems : cleaningSlotItems;
  const allSlotItems = [...mealSlotItems, ...cleaningSlotItems];
  const slotLabel = (val: string) => labelFromCatalog(allSlotItems, val) || SLOT_LABELS[val] || val;
  const priceOf = (value: string) => (activeType === 'MEAL' ? (data.settings.mealOrders.prices[value] ?? 0) : data.settings.housekeeping.price);

  const place = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!slot) {
      toast.error('Choose a time');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/pg/tenant/${tenantId}/service-orders`, { type: activeType, forDate: date, slot, quantity, notes });
      toast.success(activeType === 'MEAL' ? 'Meal ordered' : 'Cleaning booked');
      setSlot('');
      setNotes('');
      setQuantity(1);
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not place the order'));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (orderId: string) => {
    try {
      await api.post(`/pg/tenant/${tenantId}/service-orders/${orderId}/cancel`);
      toast.success('Order cancelled');
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not cancel the order'));
    }
  };

  const upcoming = data.orders.filter((order) => order.forDate.slice(0, 10) >= data.today);
  const past = data.orders.filter((order) => order.forDate.slice(0, 10) < data.today).slice(0, 10);

  return (
    <div className="space-y-4">
      <section className="rounded-[14px] border border-hairline bg-white p-5">
        <h2 className="text-xl font-semibold">Meals and cleaning</h2>
        {meals && cleaning && (
          <div className="mt-3 flex gap-2" role="tablist" aria-label="Service">
            {(['MEAL', 'HOUSEKEEPING'] as const).map((value) => (
              <button key={value} type="button" role="tab" aria-selected={activeType === value} onClick={() => { setType(value); setSlot(''); }}
                className={`min-h-11 rounded-full border px-4 font-medium ${activeType === value ? 'border-navy-900 bg-amber-50 text-navy-900' : 'border-hairline bg-white text-ink'}`}>
                {value === 'MEAL' ? 'Order a meal' : 'Book cleaning'}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={place} className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-navy-900">
            Day
            <input type="date" required min={data.today} max={addDays(data.today, data.daysAhead)} value={date} onChange={(event) => setDay(event.target.value)}
              className="mt-1 block w-full rounded-[6px] border border-field-border bg-white px-3 py-2.5 sm:w-60" />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-navy-900">{activeType === 'MEAL' ? 'Meal' : 'Time'}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {slots.map((item) => (
                <label key={item.value} className={`flex min-h-11 cursor-pointer items-center justify-between rounded-[10px] border px-3 ${slot === item.value ? 'border-navy-900 bg-amber-50 font-medium text-navy-900' : 'border-hairline bg-white'}`}>
                  <input type="radio" name="service-slot" className="sr-only" checked={slot === item.value} onChange={() => setSlot(item.value)} />
                  <span>{item.label}</span>
                  <span className="tabular text-sm text-muted">{priceOf(item.value) ? rupees(priceOf(item.value)) : 'Free'}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {activeType === 'MEAL' && (
            <label className="block text-sm font-medium text-navy-900">
              Plates
              <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1 block w-28 rounded-[6px] border border-field-border bg-white px-3 py-2.5">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <label className="block text-sm font-medium text-navy-900">
            Note <span className="font-normal text-muted">(optional)</span>
            <input value={notes} maxLength={300} onChange={(event) => setNotes(event.target.value)} placeholder={activeType === 'MEAL' ? 'e.g. less spicy' : 'e.g. bathroom too'}
              className="mt-1 block w-full rounded-[6px] border border-field-border bg-white px-3 py-2.5" />
          </label>
          <button disabled={saving} className="btn-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {activeType === 'MEAL' ? 'Order meal' : 'Book cleaning'}
            {slot && priceOf(slot) ? <span className="tabular">· {rupees(priceOf(slot) * (activeType === 'MEAL' ? quantity : 1))}</span> : null}
          </button>
          <p className="text-sm text-muted">Charges are added to your bill by the PG.</p>
        </form>
      </section>

      <section className="rounded-[14px] border border-hairline bg-white p-5">
        <h2 className="text-xl font-semibold">Your orders</h2>
        {upcoming.length + past.length === 0 ? (
          <p className="mt-1 text-muted">No orders yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline">
            {[...upcoming, ...past].map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-navy-900">
                    {order.type === 'MEAL' ? `${slotLabel(order.slot)}${order.quantity > 1 ? ` × ${order.quantity}` : ''}` : `Cleaning, ${slotLabel(order.slot).toLowerCase()}`}
                  </p>
                  <p className="tabular text-sm text-muted">{shortDate(order.forDate)}{order.unitPrice ? ` · ${rupees(order.unitPrice * order.quantity)}` : ''}{order.notes ? ` · ${order.notes}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={order.status} />
                  {order.status === 'REQUESTED' && <button type="button" onClick={() => void cancel(order.id)} className="btn-secondary min-h-9 px-3 py-1 text-sm">Cancel</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
