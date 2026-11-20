// Inside the check-out form: compare the move-in and move-out condition photos,
// tick what to charge, and fill in the deductions with an itemised note the
// resident will see. Normal wear is listed but never charged. The owner
// can still edit the amount and note before confirming.
import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../api/axios';
import { apiErrorMessage } from '../utils/api-error';
import { rupees } from '../utils/money';

type Change = { item: string; change: string; kind: 'DAMAGE' | 'MISSING' | 'CLEANING' | 'WEAR'; suggested: number };
type Review = { changes: Change[]; summary: string; suggestedTotal: number; photos: { moveIn: number; moveOut: number } };

export default function DepositCompare({ tenantId }: { tenantId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);

  const compare = async () => {
    setLoading(true);
    setError('');
    setApplied(false);
    try {
      const result = (await api.post(`/pg/owner/tenants/${tenantId}/deposit-review`)).data as Review;
      setReview(result);
      setChosen(new Set(result.changes.map((change, index) => (change.suggested > 0 ? index : -1)).filter((index) => index >= 0)));
    } catch (failure) {
      setError(apiErrorMessage(failure, 'Could not compare the photos just now. Enter deductions yourself.'));
    } finally {
      setLoading(false);
    }
  };

  const picked = review ? review.changes.filter((_, index) => chosen.has(index)) : [];
  const total = picked.reduce((sum, change) => sum + change.suggested, 0);

  const apply = () => {
    const form = wrapper.current?.closest('form');
    if (!form) return;
    const amount = form.elements.namedItem('depositDeductions') as HTMLInputElement | null;
    const note = form.elements.namedItem('checkoutNote') as HTMLInputElement | null;
    if (amount) amount.value = String(total);
    if (note) note.value = picked.length ? picked.map((change) => `${change.item}: ${change.change} (${rupees(change.suggested)})`).join('; ') : 'Room returned in the same condition';
    setApplied(true);
  };

  return (
    <div ref={wrapper} className="rounded-[10px] bg-white p-3 sm:col-span-4">
      {!review ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void compare()} disabled={loading} className="btn-secondary min-h-9 px-3 py-1.5 text-sm">
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Compare move-in and move-out photos
          </button>
          <p className="text-sm text-muted">Lists what changed in the room, so deductions match the evidence.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ink">{review.summary}</p>
          {review.changes.length === 0 ? (
            <p className="text-sm font-medium text-positive">No differences found. Refund the full deposit.</p>
          ) : (
            <ul className="divide-y divide-hairline rounded-[10px] border border-hairline">
              {review.changes.map((change, index) => (
                <li key={`${change.item}-${index}`} className="flex items-start gap-3 px-3 py-2">
                  <input
                    id={`deduct-${tenantId}-${index}`}
                    type="checkbox"
                    className="mt-1"
                    disabled={change.kind === 'WEAR'}
                    checked={chosen.has(index)}
                    onChange={() => setChosen((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}
                  />
                  <label htmlFor={`deduct-${tenantId}-${index}`} className="min-w-0 flex-1 text-sm">
                    <span className="font-medium text-navy-900">{change.item}</span> <span className="text-ink">· {change.change}</span>
                  </label>
                  <span className="tabular shrink-0 text-sm font-medium text-navy-900">{change.kind === 'WEAR' ? 'Normal wear · ₹0' : rupees(change.suggested)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={apply} className="btn-secondary min-h-9 px-3 py-1.5 text-sm">Use selected ({rupees(total)})</button>
            {applied && <p className="text-sm text-positive">Filled in below. Adjust if needed, then confirm.</p>}
            <p className="text-xs text-muted">From {review.photos.moveIn} move-in and {review.photos.moveOut} move-out photos. You decide what to charge.</p>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-attention">{error}</p>}
    </div>
  );
}
