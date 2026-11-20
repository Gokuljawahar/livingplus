import { useState } from 'react';
import { Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { Button, Card, EmptyState, StatusPill } from '../../components/ui';
import { apiErrorMessage } from '../../utils/api-error';
import { shortDate } from '../../utils/money';
import { ownerInputClass, type Booking, type Property, type RoomChangeRow } from './types';

interface BookingsProps {
  bookings: Booking[];
  properties: Property[];
  onCheckIn: (tenantId: string) => Promise<void>;
  onChanged: () => void;
}

export function BookingsView({ bookings, properties, onCheckIn, onChanged }: BookingsProps) {
  const [reassignBed, setReassignBed] = useState<Record<string, string>>({});
  const [rejectingBookingId, setRejectingBookingId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const updateBooking = async (bookingId: string, status: 'APPROVED' | 'REJECTED', newBedId?: string) => {
    if (status === 'REJECTED' && !rejectionReason.trim()) {
      toast.error('Add a reason for declining');
      return;
    }
    try {
      await api.patch(`/pg/owner/bookings/${bookingId}/status`, {
        status,
        ...(status === 'REJECTED' ? { rejectionReason: rejectionReason.trim() } : {}),
        ...(status === 'APPROVED' && newBedId ? { newBedId } : {})
      });
      toast.success(status === 'APPROVED' ? 'Booking approved; tenant and rent entry created' : 'Booking declined');
      setRejectingBookingId('');
      setRejectionReason('');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update booking'));
    }
  };

  return (
    <section className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">Booking requests</h2>
        <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-muted">{bookings.length} requests</span>
      </div>
      <div className="space-y-3">
        {bookings.map((booking) => (
          <Card key={booking.id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-ink">{booking.residentName}</h3>
                <StatusPill status={booking.status} />
              </div>
              <p className="text-xs font-medium text-muted">{booking.property.name} · {booking.property.locality}</p>
              <p className="text-xs text-muted">
                {booking.phone} · Move-in {shortDate(booking.moveInDate)}
                {booking.bed ? ` · Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : ''}
              </p>
              <p className="text-xs text-muted">Ref {booking.bookingRef}</p>
              {booking.vibe && (
                <p className="mt-1 text-sm text-ink">
                  {booking.vibe.score !== null ? (
                    <>
                      VibeCheck <span className="tabular font-semibold text-navy-900">{booking.vibe.score}%</span> with{' '}
                      {booking.vibe.compared === 1 ? 'the current resident' : `${booking.vibe.compared} current residents`}
                      {booking.vibe.reasons[0] ? `. ${booking.vibe.reasons[0]}` : ''}
                      {booking.vibe.differences[0] ? `. ${booking.vibe.differences[0]}` : ''}.
                    </>
                  ) : (
                    'Took VibeCheck. Nobody in this room has answered yet.'
                  )}
                </p>
              )}
              {booking.status === 'REJECTED' && booking.rejectionReason && (
                <p className="mt-1 rounded-[var(--radius-field)] border border-negative/30 bg-negative-bg px-3 py-1.5 text-xs font-semibold text-negative">
                  Declined: {booking.rejectionReason}
                </p>
              )}
              {rejectingBookingId === booking.id && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void updateBooking(booking.id, 'REJECTED');
                  }}
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    required
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Reason for declining (guest will see this)"
                    className={`${ownerInputClass} sm:w-80`}
                  />
                  <Button type="submit" variant="danger" size="sm">Confirm decline</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => { setRejectingBookingId(''); setRejectionReason(''); }}>
                    Cancel
                  </Button>
                </form>
              )}
            </div>
            {booking.status === 'PENDING' && rejectingBookingId !== booking.id && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Reassign bed"
                  value={reassignBed[booking.id] || ''}
                  onChange={(event) => setReassignBed({ ...reassignBed, [booking.id]: event.target.value })}
                  className="rounded-[var(--radius-field)] border border-hairline bg-surface px-3 py-2 text-xs font-medium text-ink outline-none focus:border-navy-900"
                >
                  <option value="">Keep {booking.bed ? `Room ${booking.bed.room.roomNumber}, ${booking.bed.label}` : 'bed'}</option>
                  {properties
                    .filter((property) => property.name === booking.property.name)
                    .flatMap((property) =>
                      property.rooms.flatMap((room) =>
                        room.beds
                          .filter((bed) => bed.status === 'AVAILABLE')
                          .map((bed) => (
                            <option key={bed.id} value={bed.id}>Move to Room {room.roomNumber}, {bed.label}</option>
                          ))
                      )
                    )}
                </select>
                <Button variant="danger" size="sm" onClick={() => { setRejectingBookingId(booking.id); setRejectionReason(''); }}>
                  <X className="h-4 w-4" /> Decline
                </Button>
                <Button
                  size="sm"
                  disabled={!booking.bedId && !reassignBed[booking.id]}
                  onClick={() => void updateBooking(booking.id, 'APPROVED', reassignBed[booking.id] || undefined)}
                >
                  <Check className="h-4 w-4" /> Approve
                </Button>
              </div>
            )}
            {booking.status === 'APPROVED' && booking.tenant?.status === 'RESERVED' && (
              <Button size="sm" onClick={() => void onCheckIn(booking.tenant!.id)}>Check in</Button>
            )}
          </Card>
        ))}
        {!bookings.length && <EmptyState title="No booking requests yet." />}
      </div>
    </section>
  );
}

interface RoomChangesProps {
  roomChanges: RoomChangeRow[];
  onChanged: () => void;
}

export function RoomChangesView({ roomChanges, onChanged }: RoomChangesProps) {
  const [decliningChangeId, setDecliningChangeId] = useState('');
  const [changeDecisionNote, setChangeDecisionNote] = useState('');

  const decideRoomChange = async (requestId: string, decision: 'APPROVE_AND_MOVE' | 'DECLINE') => {
    if (decision === 'APPROVE_AND_MOVE' && !window.confirm('Move the resident(s) to the new bed(s) now? This updates the stay records.')) return;
    try {
      await api.post(`/pg/owner/room-changes/${requestId}/decision`, {
        decision,
        ...(decision === 'DECLINE' && changeDecisionNote.trim() ? { note: changeDecisionNote.trim() } : {})
      });
      toast.success(decision === 'APPROVE_AND_MOVE' ? 'Rooms updated' : 'Request declined');
      setDecliningChangeId('');
      setChangeDecisionNote('');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not decide room change'));
    }
  };

  return (
    <section className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">Room swap and move requests</h2>
        <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-muted">{roomChanges.length} requests</span>
      </div>
      <div className="space-y-3">
        {roomChanges.map((row) => (
          <Card key={row.request_id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-ink">
                  {row.request_type === 'MOVE' ? 'Move' : 'Swap'} · {row.requester}{row.partner ? ` ↔ ${row.partner}` : ''}
                </h3>
                <StatusPill status={row.status} />
              </div>
              <p className="text-xs font-medium text-muted">
                {row.property}
                {row.from_bed ? ` · from Room ${row.from_bed.room_number || '?'}, ${row.from_bed.label}` : ''}
                {row.to_bed ? ` → Room ${row.to_bed.room_number || '?'}, ${row.to_bed.label}` : ''}
              </p>
              {row.reason && <p className="text-xs italic text-muted">“{row.reason}”</p>}
              {decliningChangeId === row.request_id && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void decideRoomChange(row.request_id, 'DECLINE');
                  }}
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    value={changeDecisionNote}
                    onChange={(event) => setChangeDecisionNote(event.target.value)}
                    maxLength={200}
                    placeholder="Note for the residents (optional)"
                    className={`${ownerInputClass} sm:w-80`}
                  />
                  <Button type="submit" variant="danger" size="sm">Confirm decline</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => { setDecliningChangeId(''); setChangeDecisionNote(''); }}>
                    Cancel
                  </Button>
                </form>
              )}
            </div>
            {(row.status === 'ACCEPTED' || (row.status === 'PENDING_MATCH' && row.request_type === 'MOVE' && row.to_bed)) && decliningChangeId !== row.request_id && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="danger" size="sm" onClick={() => { setDecliningChangeId(row.request_id); setChangeDecisionNote(''); }}>
                  <X className="h-4 w-4" /> Decline
                </Button>
                <Button size="sm" onClick={() => void decideRoomChange(row.request_id, 'APPROVE_AND_MOVE')}>
                  <Check className="h-4 w-4" /> Approve and move
                </Button>
              </div>
            )}
            {row.status === 'PROPOSED' && <p className="text-xs font-medium text-muted">Waiting on the other resident.</p>}
          </Card>
        ))}
        {!roomChanges.length && <EmptyState title="No room change requests yet." />}
      </div>
    </section>
  );
}
