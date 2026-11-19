import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import StatusPill from './ui/StatusPill';
import { ROUTES } from '../utils/app-areas';
import { shortDate } from '../utils/money';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { apiErrorMessage, apiErrorStatus } from '../utils/api-error';

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
  /** Proof of the verified phone: the API lists and cancels only that number's requests. */
  guestToken: string;
  refreshKey?: number;
  /** Called when the API no longer accepts the session (expired or revoked). */
  onSessionExpired?: () => void;
}


/**
 * Booking-request status list for the signed-in guest phone.
 * Replaces the old anonymous booking-ref + phone tracker.
 */
export default function MyRequests({ guestToken, refreshKey = 0, onSessionExpired }: MyRequestsProps) {
  const queryClient = useQueryClient();
  const headers = { 'X-Guest-Token': guestToken };
  const expired = (error: unknown) => {
    if (apiErrorStatus(error) !== 401) return false;
    toast.error('Please verify your phone number again');
    onSessionExpired?.();
    return true;
  };
  const { data: bookings = [], isPending: loading } = useQuery({
    queryKey: ['bookings', 'mine', guestToken, refreshKey],
    queryFn: async (): Promise<GuestBooking[]> => {
      try {
        return (await api.get('/pg/bookings/mine', { headers })).data || [];
      } catch (error) {
        if (expired(error)) return [];
        throw error;
      }
    },
    meta: { errorMessage: 'Could not load your requests' }
  });

  const cancelRequest = useMutation({
    mutationFn: (booking: GuestBooking) => api.post(`/pg/bookings/${encodeURIComponent(booking.bookingRef)}/cancel`, {}, { headers }),
    onSuccess: () => {
      toast.success('Booking request cancelled');
      return queryClient.invalidateQueries({ queryKey: ['bookings', 'mine', guestToken] });
    },
    onError: (error) => {
      if (!expired(error)) toast.error(apiErrorMessage(error, 'Could not cancel request'));
    }
  });
  const cancelling = cancelRequest.isPending ? cancelRequest.variables?.bookingRef ?? '' : '';

  const cancel = (booking: GuestBooking) => {
    if (!window.confirm(`Cancel your request for ${booking.property?.name || 'this PG'}?`)) return;
    cancelRequest.mutate(booking);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-navy-900" />
      </div>
    );
  }

  if (!bookings.length) {
    return (
      <div className="py-12 text-center">
        <p className="font-semibold text-navy-900">No requests yet</p>
        <p className="mt-1 text-muted">Requests you send from a listing appear here with their status.</p>
        <Link to={ROUTES.guestHome} className="btn-secondary mt-4">Browse PGs</Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-hairline">
      {bookings.map((booking) => (
        <li key={booking.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-sans text-[17px] font-semibold text-navy-900">{booking.property?.name || 'PG stay'}</h3>
              <StatusPill status={booking.status} />
            </div>
            <p className="mt-1 text-ink">
              {booking.room ? `Room ${booking.room.roomNumber}, ${booking.bedLabel}` : 'Bed to be assigned'}
              {booking.property?.locality ? `, ${booking.property.locality}` : ''}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {booking.moveInDate && !Number.isNaN(new Date(booking.moveInDate).getTime()) ? `Move-in ${shortDate(booking.moveInDate)} · ` : ''}
              Ref {booking.bookingRef}
            </p>
            {booking.status === 'PENDING' && <p className="mt-1 text-sm text-muted">The owner will reply here. Your bed is held while they review.</p>}
            {booking.status === 'REJECTED' && booking.rejectionReason && (
              <p className="mt-2 rounded-[10px] bg-negative-bg px-3 py-2 text-negative">Reason: {booking.rejectionReason}</p>
            )}
          </div>
          {booking.status === 'PENDING' && (
            <button
              onClick={() => void cancel(booking)}
              disabled={cancelling === booking.bookingRef}
              className="btn-secondary shrink-0 text-negative"
            >
              {cancelling === booking.bookingRef ? 'Cancelling…' : 'Cancel request'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
