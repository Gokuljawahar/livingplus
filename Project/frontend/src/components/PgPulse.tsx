// PG pulse: a Gemini-written weekly brief with one next step, this week's
// numbers, and a readable timeline that marks everything the assistant did and
// who confirmed it.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Loader2, Mic, PhoneOff, RefreshCw, Send } from 'lucide-react';
import { useVibeLive } from '../hooks/useVibeLive';
import { apiErrorMessage } from '../utils/api-error';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
import { rupees } from '../utils/money';

type Stats = {
  beds: number; occupied: number; newResidents: number; pendingRequests: number;
  overdueCount: number | null; overdueAmount: number | null;
  ticketsOpen: number; ticketsOpened: number; ticketsResolved: number; avgFixHours: number | null;
  mealOrders: number; aiActions: number;
};
type Brief = { headline: string; points: string[]; suggestion: { text: string; action: 'SEND_RENT_REMINDERS' | 'REVIEW_BED_REQUESTS' | 'OPEN_MAINTENANCE' | 'NONE' }; ai: boolean };
type Entry = { id: string; at: string; who: string; what: string; viaAssistant: boolean; detail: string | null; pg: string | null };

export type PulseTarget = 'rent' | 'bookings' | 'maintenance';
const TARGET: Record<Brief['suggestion']['action'], PulseTarget | null> = {
  SEND_RENT_REMINDERS: 'rent', REVIEW_BED_REQUESTS: 'bookings', OPEN_MAINTENANCE: 'maintenance', NONE: null
};

function when(value: string): string {
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (days < 1 && new Date().getDate() === date.getDate()) return `Today, ${time}`;
  if (days < 2) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export default function PgPulse({ onGo }: { onGo: (target: PulseTarget) => void }) {
  const [filter, setFilter] = useState<'all' | 'ai'>('all');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [followUp, setFollowUp] = useState('');
  const voice = useVibeLive(() => {});
  const startBriefing = async () => {
    setVoiceError('');
    setVoiceOpen(true);
    try {
      const { pass } = (await api.post('/pg/owner/briefing/pass')).data as { pass: string };
      const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/pg/owner/briefing/live?pass=${encodeURIComponent(pass)}`;
      if (!(await voice.start(undefined, url))) setVoiceError('Voice briefing is not available right now. The written brief is above.');
    } catch (failure) {
      setVoiceError(apiErrorMessage(failure, 'Voice briefing is not available right now. The written brief is above.'));
    }
  };
  const endBriefing = () => {
    voice.end();
    setVoiceError('');
    setFollowUp('');
  };
  const sendFollowUp = (event: React.FormEvent) => {
    event.preventDefault();
    if (!followUp.trim()) return;
    if (voice.sendText(followUp)) setFollowUp('');
  };
  const pulse = useQuery({ queryKey: queryKeys.owner.pulse(), queryFn: async () => (await api.get('/pg/owner/pulse')).data as { timeline: Entry[]; stats: Stats | null } });
  const brief = useQuery({
    queryKey: queryKeys.owner.pulseBrief(),
    queryFn: async () => (await api.post('/pg/owner/pulse/brief', {})).data as { brief: Brief },
    staleTime: 10 * 60 * 1000,
    retry: false
  });
  const stats = pulse.data?.stats;
  const entries = (pulse.data?.timeline ?? []).filter((entry) => filter === 'all' || entry.viaAssistant);
  const target = brief.data ? TARGET[brief.data.brief.suggestion.action] : null;

  return (
    <div className="space-y-5">
      <section aria-labelledby="brief-heading" className="rounded-[14px] bg-navy-900 p-5 text-white sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p id="brief-heading" className="inline-flex items-center gap-2 text-sm font-medium text-white/80">
            This week
          </p>
          <button type="button" onClick={() => void brief.refetch()} disabled={brief.isFetching} aria-label="Rewrite the brief" className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${brief.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {brief.isPending ? (
          <p className="mt-3 inline-flex items-center gap-2 text-white/80"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Putting your week together…</p>
        ) : brief.data ? (
          <>
            <h2 className="mt-2 font-display text-xl font-bold text-white sm:text-2xl">{brief.data.brief.headline}</h2>
            <ul className="mt-3 space-y-1.5 text-white/90">
              {brief.data.brief.points.map((point) => <li key={point} className="flex gap-2"><span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{point}</li>)}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="font-medium">{brief.data.brief.suggestion.text}</p>
              {target && <button type="button" onClick={() => onGo(target)} className="inline-flex min-h-10 items-center rounded-full bg-amber-500 px-4 font-semibold text-navy-900 hover:bg-amber-600">Do it</button>}
            </div>
          </>
        ) : (
          <p className="mt-3 text-white/80">The brief isn't available right now. Your numbers are below.</p>
        )}
      </section>

      <section aria-labelledby="voice-heading" className="rounded-[14px] border border-hairline bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="voice-heading" className="text-base font-semibold">Brief me by voice</h2>
            <p className="text-sm text-muted">Hear today's priorities and ask questions hands-free, in Tamil, Hindi or English.</p>
          </div>
          {!voiceOpen || voice.status === 'ended' || voice.status === 'failed' ? (
            <button type="button" onClick={() => void startBriefing()} className="btn-secondary inline-flex items-center gap-1.5"><Mic className="h-4 w-4" aria-hidden="true" /> Brief me</button>
          ) : (
            <button type="button" onClick={endBriefing} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 font-medium text-negative hover:bg-negative-bg"><PhoneOff className="h-4 w-4" aria-hidden="true" /> End</button>
          )}
        </div>
        {voiceOpen && (
          <div className="mt-3 space-y-2" aria-live="polite">
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              {voice.status === 'connecting' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {voice.status === 'connecting' ? 'Getting your briefing ready…' : voice.status === 'speaking' ? 'Speaking' : voice.status === 'listening' ? 'Listening, ask anything about your PGs' : voice.status === 'ended' ? 'Briefing ended' : ''}
            </p>
            {voice.turns.map((turn, index) => (
              <p key={index} className={`w-fit max-w-[90%] rounded-[12px] px-3 py-2 text-[15px] ${turn.role === 'assistant' ? 'bg-surface text-ink' : 'ml-auto bg-navy-900 text-white'}`}>{turn.text}</p>
            ))}
            {(voice.status === 'listening' || voice.status === 'speaking') && (
              <form onSubmit={sendFollowUp} className="flex gap-2 pt-1">
                <input
                  type="text"
                  aria-label="Ask a follow-up"
                  value={followUp}
                  onChange={(event) => setFollowUp(event.target.value)}
                  placeholder="Or type a follow-up question…"
                  className="min-h-10 flex-1 rounded-full border border-hairline bg-surface px-4 text-sm text-ink outline-none focus:border-navy-900"
                />
                <button type="submit" disabled={!followUp.trim()} aria-label="Send follow-up" className="btn-secondary inline-flex min-h-10 items-center gap-1.5 disabled:opacity-50">
                  <Send className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            )}
            {(voice.error || voiceError) && <p role="alert" className="text-sm text-attention">{voice.error || voiceError}</p>}
          </div>
        )}
      </section>

      {stats && (
        <section aria-label="This week" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [`${stats.occupied}/${stats.beds}`, 'beds occupied'],
            [String(stats.ticketsResolved), stats.avgFixHours !== null ? `issues fixed, ${stats.avgFixHours} h avg` : 'issues fixed'],
            [String(stats.mealOrders), 'extra meals ordered'],
            [String(stats.aiActions), 'done by the assistant']
          ].map(([value, label]) => (
            <div key={label} className="rounded-[14px] border border-hairline bg-white p-4">
              <p className="tabular font-display text-2xl font-bold text-navy-900">{value}</p>
              <p className="text-sm text-muted">{label}</p>
            </div>
          ))}
          {stats.overdueCount !== null && stats.overdueCount > 0 && (
            <p className="col-span-2 rounded-[10px] bg-negative-bg px-3 py-2 text-sm text-negative sm:col-span-4">{stats.overdueCount} overdue rent {stats.overdueCount === 1 ? 'bill' : 'bills'} · {rupees(stats.overdueAmount ?? 0)}</p>
          )}
        </section>
      )}

      <section aria-labelledby="timeline-heading" className="rounded-[14px] border border-hairline bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h2 id="timeline-heading" className="text-lg font-semibold">What happened</h2>
          <div className="flex gap-1 rounded-full bg-surface p-1" role="group" aria-label="Filter">
            {([['all', 'All'], ['ai', 'Done by the assistant']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${filter === value ? 'bg-white text-navy-900 shadow-xs' : 'text-muted hover:text-navy-900'}`}>{label}</button>
            ))}
          </div>
        </div>
        {pulse.isPending ? (
          <p className="px-5 py-6 text-muted">Loading…</p>
        ) : entries.length ? (
          <ol className="mt-2 divide-y divide-hairline">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3 px-5 py-3">
                <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${entry.viaAssistant ? 'bg-amber-50 text-navy-900' : 'bg-surface text-muted'}`} aria-hidden="true">
                  {entry.viaAssistant ? <Bot className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <div className="min-w-0">
                  <p className="text-ink"><span className="font-medium text-navy-900">{entry.who}</span> {entry.what}{entry.viaAssistant && <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-navy-900">via assistant</span>}</p>
                  {entry.detail && <p className="text-sm text-muted">{entry.detail}</p>}
                  <p className="text-xs text-muted">{when(entry.at)}{entry.pg ? ` · ${entry.pg}` : ''}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-5 py-6 text-muted">{filter === 'ai' ? 'The assistant has not done anything for you yet.' : 'Nothing has happened in the last two weeks.'}</p>
        )}
      </section>
    </div>
  );
}
