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

  if (!stays.length) return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-white py-12 text-center text-sm text-muted">
      No stays found for this number.
    </div>
  );

  return (
    <div className="space-y-6">
      {stays.map((stay) => {
        const foodEntries = stay.rentEntries.filter((entry) => entry.entryType === 'FOOD');
        const charge = stay.bed?.room.foodCharge || 0;
        const active = ['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status);
        return (
          <article key={stay.id} className="rounded-[var(--radius-card)] border border-hairline/90 bg-white p-6 transition-shadow">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-[var(--radius-button)] bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200/70">
                  <UtensilsCrossed className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h2 className="font-bold text-ink text-base">{stay.property.name}</h2>
                  <p className="text-xs text-muted">
                    {stay.bed ? `Room ${stay.bed.room.roomNumber} · ` : ''}
                    {charge > 0 ? `Mess ${stay.bed?.room.foodIncluded ? 'included' : 'available'} · ₹${charge.toLocaleString('en-IN')}/month` : 'No mess charge on this room'}
                  </p>
                </div>
              </div>
              <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
                stay.foodOptOut
                  ? 'border-hairline bg-surface text-muted'
                  : 'border-positive/30 bg-positive-bg text-positive'
              }`}>
                {stay.foodOptOut ? 'Mess opted out' : 'Mess opted in'}
              </span>
            </div>

            {/* Reassurance Note */}
            <div className="mt-4 rounded-[var(--radius-button)] bg-surface border border-hairline p-3.5 text-xs text-muted leading-relaxed">
              💡 <strong>Flexible Dining Policy:</strong> You can opt in or out of the monthly meal plan at any time. Preference updates take effect from your upcoming billing cycle with zero cancellation fees.
            </div>

            {active && charge > 0 && (
              <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between">
                <p className="text-xs text-muted">Switch your meal status for the next billing cycle</p>
                <button
                  disabled={toggling !== ''}
                  onClick={() => void toggle(stay)}
                  className="rounded-[var(--radius-button)] border border-navy-900 bg-white hover:bg-surface px-4 py-2 text-xs font-bold text-navy-900 disabled:opacity-60 transition-all inline-flex items-center gap-2 "
                >
                  {toggling === stay.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {stay.foodOptOut ? 'Opt into the mess' : 'Opt out of the mess'}
                </button>
              </div>
            )}

            {foodEntries.length > 0 && (
              <div className="mt-5 border-t border-hairline pt-4">
                <h3 className="text-xs font-bold text-muted mb-2">Past Mess Invoices</h3>
                <div className="divide-y divide-hairline rounded-[var(--radius-button)] border border-hairline overflow-hidden">
                  {foodEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 p-3 bg-white text-xs">
                      <span className="font-semibold text-ink">
                        {entry.period} · ₹{entry.paidAmount.toLocaleString('en-IN')} / ₹{entry.amount.toLocaleString('en-IN')}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        entry.status === 'PAID'
                          ? 'border-positive/30 bg-positive-bg text-positive'
                          : entry.status === 'OVERDUE'
                          ? 'border-negative/30 bg-negative-bg text-negative'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}>
                        {entry.status}
                      </span>
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
