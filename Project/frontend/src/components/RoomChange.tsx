import { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { apiErrorMessage } from '../utils/api-error';

type BedView = {
  bed_id: string; label: string; room_number: string | null; floor: number | null;
  room_type: string | null; monthly_rent: number | null;
};

type SwapRequest = {
  request_id: string; mine: boolean; request_type: 'SWAP' | 'MOVE'; status: string;
  reason: string | null; preferences: Record<string, string>;
  counterparty: { display_name: string; current_room: string | null; floor: number | null; room_type: string | null } | null;
  offered_bed: BedView | null; created_at: string; updated_at: string;
};

type Candidate = {
  their_request_id: string;
  partner: { display_name: string; current_room: string | null; floor: number | null; room_type: string | null };
  offered_bed: BedView | null;
  compatibility: 'MATCH' | 'OPEN';
};

type Matches = { request_id: string; request_type: string; candidates?: Candidate[]; vacant_beds?: BedView[] };

const ACTIVE = ['PENDING_MATCH', 'PROPOSED', 'ACCEPTED'];

async function fetchRoomChangeData(): Promise<{ rows: SwapRequest[]; matchData: Matches | null }> {
  const response = await api.get('/pg/tenant/room-changes');
  const rows: SwapRequest[] = response.data || [];
  const open = rows.find((row) => row.mine && ACTIVE.includes(row.status) && row.request_type === 'SWAP');
  let matchData: Matches | null = null;
  if (open) {
    try {
      matchData = (await api.get('/pg/tenant/room-change-matches')).data;
    } catch { matchData = null; }
  }
  return { rows, matchData };
}

function statusStyle(status: string): string {
  if (status === 'ACCEPTED') return 'border-emerald-300 text-emerald-800';
  if (status === 'PROPOSED') return 'border-blue-300 text-blue-800';
  if (status === 'COMPLETED') return 'border-slate-400 text-slate-600';
  if (status === 'PENDING_MATCH') return 'border-amber-300 text-amber-800';
  return 'border-slate-300 text-slate-500';
}

function bedLabel(bed: BedView | null): string {
  if (!bed) return '';
  return `Room ${bed.room_number || '?'} · ${bed.label}${bed.room_type ? ` · ${bed.room_type}` : ''}`;
}

export default function RoomChange() {
  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [matches, setMatches] = useState<Matches | null>(null);
  const [vacantBeds, setVacantBeds] = useState<BedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState({ type: 'SWAP', bedId: '', floor: '', note: '', reason: '' });

  useEffect(() => {
    let live = true;
    fetchRoomChangeData()
      .then(({ rows, matchData }) => {
        if (!live) return;
        setRequests(rows);
        setMatches(matchData);
      })
      .catch((error: unknown) => {
        if (live) toast.error(apiErrorMessage(error, 'Could not load room changes'));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [refreshKey]);

  const pickType = (type: 'SWAP' | 'MOVE') => {
    setForm((current) => ({ ...current, type }));
    if (type === 'MOVE' && !vacantBeds.length) {
      api.get('/pg/tenant/vacant-beds')
        .then((response) => setVacantBeds(response.data || []))
        .catch((error) => toast.error(apiErrorMessage(error, 'Could not load vacant beds')));
    }
  };

  const openRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setActing('new');
    try {
      const preferences: Record<string, string> = {};
      if (form.floor.trim()) preferences.floor = form.floor.trim();
      if (form.note.trim()) preferences.note = form.note.trim();
      await api.post('/pg/tenant/room-changes', {
        request_type: form.type,
        ...(form.type === 'MOVE' ? { to_bed_id: form.bedId } : {}),
        ...(Object.keys(preferences).length ? { preferences } : {}),
        ...(form.reason.trim() ? { reason: form.reason.trim() } : {})
      });
      toast.success(form.type === 'MOVE' ? 'Move request opened' : 'Swap request opened');
      setForm({ type: 'SWAP', bedId: '', floor: '', note: '', reason: '' });
      setVacantBeds([]);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not open request'));
    } finally {
      setActing('');
    }
  };

  const act = async (key: string, call: () => Promise<unknown>, success: string) => {
    setActing(key);
    try {
      await call();
      toast.success(success);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed'));
    } finally {
      setActing('');
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#02224B]" /></div>;

  const openMine = requests.filter((row) => row.mine && ACTIVE.includes(row.status));
  const incoming = requests.filter((row) => !row.mine && row.status === 'PROPOSED');
  const past = requests.filter((row) => !ACTIVE.includes(row.status));

  return (
    <div className="space-y-4">
      {incoming.map((row) => (
        <article key={row.request_id} className="border border-blue-300 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-[#02224B]">{row.counterparty?.display_name || 'A resident'} wants to swap with you</h2>
            <span className={`border px-2 py-0.5 text-xs font-semibold uppercase ${statusStyle(row.status)}`}>{row.status.replace('_', ' ')}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">They are in {row.counterparty?.current_room ? `room ${row.counterparty.current_room}` : 'another room'}{row.reason ? ` · “${row.reason}”` : ''}</p>
          <p className="mt-1 text-sm text-slate-600">Your warden confirms the move only if you accept.</p>
          <div className="mt-3 flex gap-2">
            <button
              disabled={acting !== ''}
              onClick={() => void act(`accept-${row.request_id}`, () => api.post(`/pg/tenant/room-changes/${row.request_id}/response`, { decision: 'ACCEPT' }), 'Swap accepted — waiting for staff confirmation')}
              className="inline-flex items-center gap-1.5 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {acting === `accept-${row.request_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Accept swap
            </button>
            <button
              disabled={acting !== ''}
              onClick={() => void act(`decline-${row.request_id}`, () => api.post(`/pg/tenant/room-changes/${row.request_id}/response`, { decision: 'DECLINE' }), 'Proposal declined')}
              className="inline-flex items-center gap-1.5 border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {acting === `decline-${row.request_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}Decline
            </button>
          </div>
        </article>
      ))}

      {openMine.map((row) => (
        <article key={row.request_id} className="border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-[#02224B]">Your {row.request_type === 'MOVE' ? 'move' : 'swap'} request</h2>
            <span className={`border px-2 py-0.5 text-xs font-semibold uppercase ${statusStyle(row.status)}`}>{row.status.replace('_', ' ')}</span>
          </div>
          {row.request_type === 'MOVE' && row.offered_bed && <p className="mt-1 text-sm text-slate-600">To {bedLabel(row.offered_bed)}</p>}
          {row.reason && <p className="mt-1 text-sm text-slate-600">“{row.reason}”</p>}
          {row.status === 'PROPOSED' && row.counterparty && (
            <p className="mt-1 text-sm text-slate-600">Proposed to {row.counterparty.display_name}{row.offered_bed ? ` · ${bedLabel(row.offered_bed)}` : ''} — waiting for their answer.</p>
          )}
          {row.status === 'ACCEPTED' && <p className="mt-1 text-sm text-slate-600">Both sides agreed — your warden or owner confirms the move next.</p>}
          {row.request_type === 'SWAP' && row.status === 'PENDING_MATCH' && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <h3 className="text-sm font-semibold text-[#02224B]">Possible swap partners</h3>
              {!matches?.candidates?.length && <p className="mt-1 text-sm text-slate-500">No other swap requests yet. Check back later.</p>}
              {matches?.candidates?.map((candidate) => (
                <div key={candidate.their_request_id} className="mt-2 flex flex-col gap-2 border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{candidate.partner.display_name}
                      <span className={`ml-2 border px-1.5 py-0.5 text-[11px] font-semibold uppercase ${candidate.compatibility === 'MATCH' ? 'border-emerald-300 text-emerald-800' : 'border-slate-300 text-slate-500'}`}>
                        {candidate.compatibility === 'MATCH' ? 'Good match' : 'Open'}
                      </span>
                    </p>
                    <p className="text-sm text-slate-600">{candidate.offered_bed ? bedLabel(candidate.offered_bed) : 'No bed listed'}</p>
                  </div>
                  <button
                    disabled={acting !== ''}
                    onClick={() => void act(`propose-${candidate.their_request_id}`, () => api.post(`/pg/tenant/room-changes/${row.request_id}/proposals`, { their_request_id: candidate.their_request_id }), 'Swap proposed')}
                    className="inline-flex items-center gap-1.5 bg-[#02224B] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {acting === `propose-${candidate.their_request_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}Propose swap
                  </button>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}

      {!openMine.length && (
        <form onSubmit={openRequest} className="border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-[#02224B]">Request a room change</h2>
          <p className="mt-1 text-sm text-slate-600">Swap with another resident, or move to a vacant bed. The other side and your warden confirm before anything moves.</p>
          <div className="mt-3 flex gap-2">
            {(['SWAP', 'MOVE'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => pickType(type)}
                className={`border px-3 py-2 text-sm font-semibold ${form.type === type ? 'border-[#02224B] bg-[#02224B] text-white' : 'border-slate-300 text-slate-700'}`}
              >
                {type === 'SWAP' ? 'Swap rooms' : 'Move rooms'}
              </button>
            ))}
          </div>
          {form.type === 'MOVE' && (
            <label className="mt-3 block text-sm text-slate-700">Choose a vacant bed
              <select required value={form.bedId} onChange={(event) => setForm((current) => ({ ...current, bedId: event.target.value }))} className="mt-1 block w-full border border-slate-300 px-3 py-2">
                <option value="">Select a bed…</option>
                {vacantBeds.map((bed) => <option key={bed.bed_id} value={bed.bed_id}>{bedLabel(bed)}{bed.monthly_rent ? ` · ₹${bed.monthly_rent.toLocaleString('en-IN')}` : ''}</option>)}
              </select>
            </label>
          )}
          {form.type === 'SWAP' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-slate-700">Preferred floor (optional)
                <input value={form.floor} onChange={(event) => setForm((current) => ({ ...current, floor: event.target.value }))} placeholder="e.g. low" className="mt-1 block w-full border border-slate-300 px-3 py-2" />
              </label>
              <label className="block text-sm text-slate-700">Anything else (optional)
                <input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="e.g. quiet, early riser" className="mt-1 block w-full border border-slate-300 px-3 py-2" />
              </label>
            </div>
          )}
          <label className="mt-3 block text-sm text-slate-700">Reason (optional)
            <input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} maxLength={500} placeholder="Why do you want to change rooms?" className="mt-1 block w-full border border-slate-300 px-3 py-2" />
          </label>
          <button disabled={acting !== ''} className="mt-3 inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {acting === 'new' && <Loader2 className="h-4 w-4 animate-spin" />}Open request
          </button>
        </form>
      )}

      {past.length > 0 && (
        <div className="border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-[#02224B]">Earlier requests</h2>
          <div className="mt-2 divide-y divide-slate-100">
            {past.map((row) => (
              <div key={row.request_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-slate-600">{row.request_type === 'MOVE' ? 'Move' : 'Swap'}{row.offered_bed ? ` · ${bedLabel(row.offered_bed)}` : ''}</span>
                <span className={`border px-2 py-0.5 text-xs font-semibold uppercase ${statusStyle(row.status)}`}>{row.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
