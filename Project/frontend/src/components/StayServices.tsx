import { useState } from 'react';
import { FileText, History, Loader2, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export type ServiceStay = {
  id: string; status: string;
  moveInDate: string; moveOutDate?: string | null;
  checkedInAt?: string | null; checkedOutAt?: string | null;
  checkoutNote?: string | null; noticeDate?: string | null;
  depositDeductions?: number;
  depositRefundAmount?: number | null; depositRefundStatus?: string; depositRefundReference?: string | null;
  kycType?: string | null; kycDocumentUrl?: string | null; kycVerified?: boolean;
  property: { name: string; locality: string; city: string };
  bed?: { label: string; room: { roomNumber: string; roomType: string } } | null;
};

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function stayMonths(moveIn: string, moveOut?: string | null): string {
  const start = new Date(moveIn);
  const end = moveOut ? new Date(moveOut) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '';
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return months >= 12
    ? `${Math.floor(months / 12)}y${months % 12 ? ` ${months % 12}m` : ''}`
    : `${months} mo`;
}

export default function StayServices({ stays }: { stays: ServiceStay[] }) {
  const [opening, setOpening] = useState('');

  const viewDocument = async (stay: ServiceStay) => {
    if (!stay.kycDocumentUrl) return;
    const preview = window.open('about:blank', '_blank');
    setOpening(stay.id);
    try {
      const response = await api.get(`/view-image/${encodeURIComponent(stay.kycDocumentUrl)}`);
      if (preview) preview.location.href = response.data.viewUrl;
      else toast.error('Allow pop-ups to open the document');
    } catch {
      preview?.close();
      toast.error('Could not open the document');
    } finally {
      setOpening('');
    }
  };

  if (!stays.length) return <p className="border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No stays found for this number.</p>;

  return (
    <div className="space-y-4">
      {stays.map((stay) => {
        const movedIn = formatDate(stay.moveInDate);
        const checkedOut = stay.checkedOutAt || stay.moveOutDate;
        const showCheckout = checkedOut || (stay.depositRefundStatus && stay.depositRefundStatus !== 'NOT_APPLICABLE');
        return (
          <article key={stay.id} className="border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-semibold text-[#02224B]">{stay.property.name}</h2>
              <p className="text-xs font-semibold uppercase text-slate-500">{stay.status.replace('_', ' ')}{stay.bed ? ` · Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''}</p>
            </div>

            <section className="pt-4">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900"><History className="h-4 w-4 text-slate-500" />Stay timeline</h3>
              <div className="mt-2 divide-y divide-slate-100 text-sm">
                {movedIn && <div className="flex items-center justify-between gap-3 py-2"><span className="text-slate-600">Moved in{stayMonths(stay.moveInDate, stay.moveOutDate) ? ` · ${stayMonths(stay.moveInDate, stay.moveOutDate)}` : ''}</span><span className="font-medium">{movedIn}</span></div>}
                {formatDate(stay.checkedInAt) && <div className="flex items-center justify-between gap-3 py-2"><span className="text-slate-600">Checked in by the PG</span><span className="font-medium">{formatDate(stay.checkedInAt)}</span></div>}
                {formatDate(stay.noticeDate) && <div className="flex items-center justify-between gap-3 py-2"><span className="text-slate-600">Vacating notice given</span><span className="font-medium text-amber-700">{formatDate(stay.noticeDate)}</span></div>}
                {formatDate(checkedOut) && <div className="flex items-center justify-between gap-3 py-2"><span className="text-slate-600">Moved out{stay.checkoutNote ? ` · ${stay.checkoutNote}` : ''}</span><span className="font-medium">{formatDate(checkedOut)}</span></div>}
              </div>
            </section>

            <section className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900"><FileText className="h-4 w-4 text-slate-500" />Stay documents</h3>
              <div className="mt-2 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-medium text-slate-800">{stay.kycType ? stay.kycType.replace(/_/g, ' ') : 'KYC document'}</p><p className="text-xs text-slate-500">KYC {stay.kycVerified ? 'verified' : stay.kycDocumentUrl ? 'submitted, awaiting review' : 'not submitted'}</p></div>
                {stay.kycDocumentUrl && (
                  <button disabled={opening !== ''} onClick={() => void viewDocument(stay)} className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
                    {opening === stay.id && <Loader2 className="h-4 w-4 animate-spin" />}View my document
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">Rent receipts can be downloaded from the My stays tab.</p>
            </section>

            {showCheckout && (
              <section className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="flex items-center gap-2 font-semibold text-slate-900"><LogOut className="h-4 w-4 text-slate-500" />Checkout summary</h3>
                <div className="mt-2 text-sm text-slate-600">
                  {typeof stay.depositDeductions === 'number' && stay.depositDeductions > 0 && <p>Deductions: ₹{stay.depositDeductions.toLocaleString('en-IN')}</p>}
                  <p className="mt-1">Refund: {stay.depositRefundAmount ? `₹${stay.depositRefundAmount.toLocaleString('en-IN')}` : '—'} · {(stay.depositRefundStatus || 'NOT_APPLICABLE').replace('_', ' ')}{stay.depositRefundReference ? ` · Ref ${stay.depositRefundReference}` : ''}</p>
                </div>
              </section>
            )}
          </article>
        );
      })}
    </div>
  );
}
