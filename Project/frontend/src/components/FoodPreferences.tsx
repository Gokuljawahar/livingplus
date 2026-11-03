import { useState } from 'react';
import { Loader2, UtensilsCrossed } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { apiErrorMessage } from '../utils/api-error';

export type FoodStay = {
  id: string; status: string; foodOptOut?: boolean;
  property: { name: string };
  bed?: {
    label: string;
    room: { roomNumber: string; roomType: string; foodIncluded?: boolean; foodCharge?: number | null };
  } | null;
  rentEntries: { id: string; period: string; entryType: string; amount: number; paidAmount: number; status: string }[];
};

export default function FoodPreferences({ stays, onChanged }: { stays: FoodStay[]; onChanged: () => void }) {
  const [toggling, setToggling] = useState('');

  const toggle = async (stay: FoodStay) => {
    const optingOut = !stay.foodOptOut;
    if (!window.confirm(optingOut
      ? 'Opt out of the mess? Future mess invoices stop, but any current food dues stay.'
      : 'Opt back into the mess? Monthly food charges resume from the next billing cycle.')) return;
    setToggling(stay.id);
    try {
      await api.patch(`/pg/tenant/${stay.id}/profile`, { foodOptOut: optingOut });
      toast.success(optingOut ? 'Opted out of the mess' : 'Opted into the mess');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update food preference'));
    } finally {
      setToggling('');
    }
  };

  if (!stays.length) return <p className="border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No stays found for this number.</p>;

  return (
    <div className="space-y-4">
      {stays.map((stay) => {
        const foodEntries = stay.rentEntries.filter((entry) => entry.entryType === 'FOOD');
        const charge = stay.bed?.room.foodCharge || 0;
        const active = ['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status);
        return (
          <article key={stay.id} className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold text-[#02224B]"><UtensilsCrossed className="h-4 w-4 text-[#FEB109]" />{stay.property.name}</h2>
              <span className={`border px-2 py-0.5 text-xs font-semibold uppercase ${stay.foodOptOut ? 'border-slate-300 text-slate-500' : 'border-emerald-300 text-emerald-800'}`}>
                {stay.foodOptOut ? 'Mess opted out' : 'Mess opted in'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {stay.bed ? `Room ${stay.bed.room.roomNumber} · ` : ''}
              {charge > 0 ? `Mess ${stay.bed?.room.foodIncluded ? 'included' : 'available'} · ₹${charge.toLocaleString('en-IN')}/month` : 'No mess charge on this room'}
            </p>
            {active && charge > 0 && (
              <button disabled={toggling !== ''} onClick={() => void toggle(stay)} className="mt-3 inline-flex items-center gap-2 border border-[#02224B] px-3 py-2 text-sm font-semibold text-[#02224B] disabled:opacity-60">
                {toggling === stay.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {stay.foodOptOut ? 'Opt into the mess' : 'Opt out of the mess'}
              </button>
            )}
            {foodEntries.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="text-sm font-semibold text-slate-900">Mess invoices</h3>
                <div className="mt-1 divide-y divide-slate-100">
                  {foodEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-slate-600">{entry.period} · ₹{entry.paidAmount.toLocaleString('en-IN')} / ₹{entry.amount.toLocaleString('en-IN')}</span>
                      <span className={`text-xs font-semibold uppercase ${entry.status === 'PAID' ? 'text-emerald-700' : entry.status === 'OVERDUE' ? 'text-red-700' : 'text-amber-700'}`}>{entry.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
