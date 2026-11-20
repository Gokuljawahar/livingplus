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
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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

  if (!stays.length) return (
    <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500 shadow-sm">
      No stays found for this number.
    </div>
  );

  return (
    <div className="space-y-6">
      {stays.map((stay) => {
        const movedIn = formatDate(stay.moveInDate);
        const checkedOut = stay.checkedOutAt || stay.moveOutDate;
        const showCheckout = checkedOut || (stay.depositRefundStatus && stay.depositRefundStatus !== 'NOT_APPLICABLE');
        return (
          <article key={stay.id} className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm transition-shadow">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-navy-900">{stay.property.name}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{stay.property.locality}, {stay.property.city}</p>
              </div>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                {stay.status.replace('_', ' ')}{stay.bed ? ` · Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''}
              </span>
            </div>

            <section className="pt-5">
              <h3 className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <History className="h-4 w-4 text-navy-900" /> Stay Timeline & Verification
              </h3>
              <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-150 bg-slate-50/50 p-1 text-xs">
                {movedIn && (
                  <div className="flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-600 font-medium">Moved in {stayMonths(stay.moveInDate, stay.moveOutDate) ? `(${stayMonths(stay.moveInDate, stay.moveOutDate)})` : ''}</span>
                    <span className="font-bold text-slate-800">{movedIn}</span>
                  </div>
                )}
                {formatDate(stay.checkedInAt) && (
                  <div className="flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-600 font-medium">Official Check-In Confirmed by PG</span>
                    <span className="font-bold text-emerald-700">{formatDate(stay.checkedInAt)}</span>
                  </div>
                )}
                {formatDate(stay.noticeDate) && (
                  <div className="flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-600 font-medium">Vacating Notice Submitted</span>
                    <span className="font-bold text-amber-700">{formatDate(stay.noticeDate)}</span>
                  </div>
                )}
                {formatDate(checkedOut) && (
                  <div className="flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-600 font-medium">Moved out {stay.checkoutNote ? ` · Note: ${stay.checkoutNote}` : ''}</span>
                    <span className="font-bold text-slate-800">{formatDate(checkedOut)}</span>
                  </div>
                )}
              </div>
            </section>

            <section className="mt-5 border-t border-slate-100 pt-5">
              <h3 className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <FileText className="h-4 w-4 text-navy-900" /> Identity & Stay Documents
              </h3>
              <div className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-150 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-800">
                    {stay.kycType ? stay.kycType.replace(/_/g, ' ') : 'KYC Document'}
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Status: <span className={`font-semibold ${stay.kycVerified ? 'text-emerald-700' : 'text-slate-600'}`}>{stay.kycVerified ? 'Verified by PG Owner' : stay.kycDocumentUrl ? 'Awaiting Owner Verification' : 'Not uploaded'}</span>
                  </p>
                </div>
                {stay.kycDocumentUrl && (
                  <button
                    disabled={opening !== ''}
                    onClick={() => void viewDocument(stay)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-60"
                  >
                    {opening === stay.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    View my document
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400 font-medium">Official payment receipts can be downloaded directly from the My stays tab.</p>
            </section>

            {showCheckout && (
              <section className="mt-5 border-t border-slate-100 pt-5">
                <h3 className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <LogOut className="h-4 w-4 text-navy-900" /> Documented Move-Out Record
                </h3>
                <div className="mt-3 rounded-xl border border-slate-150 bg-slate-50/50 p-4 text-xs text-slate-700 space-y-1">
                  {typeof stay.depositDeductions === 'number' && stay.depositDeductions > 0 && (
                    <p>Agreed room deductions: <span className="font-bold">₹{stay.depositDeductions.toLocaleString('en-IN')}</span></p>
                  )}
                  <p>
                    Refund status: <span className="font-bold text-emerald-800">{stay.depositRefundAmount ? `₹${stay.depositRefundAmount.toLocaleString('en-IN')}` : '—'}</span> · {(stay.depositRefundStatus || 'NOT_APPLICABLE').replace('_', ' ')}
                    {stay.depositRefundReference ? ` · Ref ${stay.depositRefundReference}` : ''}
                  </p>
                </div>
              </section>
            )}
          </article>
        );
      })}
    </div>
  );
}
