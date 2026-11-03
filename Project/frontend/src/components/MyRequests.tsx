import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export interface GuestBooking {
  id: string;
  bookingRef: string;
  status: string;
  rejectionReason?: string | null;
  residentName?: string;
  moveInDate?: string;
  property?: { name: string; locality?: string; city?: string } | null;
  room?: { roomNumber: string } | null;
  bedLabel?: string | null;
}

interface MyRequestsProps {
  phone: string;
  refreshKey?: number;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-800 border-red-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  EXPIRED: 'bg-slate-100 text-slate-600 border-slate-200',
  CHECKED_IN: 'bg-blue-50 text-blue-800 border-blue-200',
  CHECKED_OUT: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * Booking-request status list for the signed-in guest phone.
 * Replaces the old anonymous booking-ref + phone tracker.
 */
export default function MyRequests({ phone, refreshKey = 0 }: MyRequestsProps) {
  const [bookings, setBookings] = useState<GuestBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/pg/bookings/mine', { params: { phone } });
      setBookings(response.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not load your requests');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const cancel = async (booking: GuestBooking) => {
    if (!window.confirm(`Cancel your request for ${booking.property?.name || 'this PG'}?`)) return;
    setCancelling(booking.bookingRef);
    try {
      await api.post(`/pg/bookings/${encodeURIComponent(booking.bookingRef)}/cancel`, { phone });
      toast.success('Booking request cancelled');
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not cancel request');
    } finally {
      setCancelling('');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-[#02224B]" />
      </div>
    );
  }

  if (!bookings.length) {
    return (
      <div className="py-16 text-center">
        <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 font-semibold text-slate-700">No booking requests yet</p>
        <p className="mt-1 text-sm text-slate-500">Requests you send from a listing will show up here with live status.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {bookings.map((booking) => (
        <article key={booking.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-[#02224B]">{booking.property?.name || 'PG stay'}</h3>
              <span
                className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[booking.status] || STATUS_STYLES.CANCELLED}`}
              >
                {booking.status === 'REJECTED' || booking.status === 'CANCELLED' ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {booking.status.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {booking.room ? `Room ${booking.room.roomNumber}, ${booking.bedLabel}` : 'Bed pending assignment'}
              {booking.property?.locality ? ` · ${booking.property.locality}` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ref {booking.bookingRef}
              {booking.moveInDate && !Number.isNaN(new Date(booking.moveInDate).getTime())
                ? ` · Move-in ${new Date(booking.moveInDate).toLocaleDateString()}`
                : ''}
            </p>
            {booking.status === 'REJECTED' && booking.rejectionReason && (
              <p className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Reason: {booking.rejectionReason}
              </p>
            )}
          </div>
          {booking.status === 'PENDING' && (
            <button
              onClick={() => void cancel(booking)}
              disabled={cancelling === booking.bookingRef}
              className="shrink-0 border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
            >
              {cancelling === booking.bookingRef ? 'Cancelling…' : 'Cancel request'}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
