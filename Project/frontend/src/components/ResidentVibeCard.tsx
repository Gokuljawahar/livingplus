// Resident VibeCheck: answer once so new roommates can match with you, see how
// you match your current roommates, and ask for a room change within the
// rematch window if it isn't working out.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Loader2 } from 'lucide-react';
import { type VibeAnswers, type VibeMatch } from '@livingplus/shared';
import api from '../api/axios';
import VibeProfileBuilder from './VibeProfileBuilder';
import { hasKeyHabits } from '../utils/vibe-storage';
import { apiErrorMessage } from '../utils/api-error';
import { shortDate } from '../utils/money';

type VibeState = { answers: VibeAnswers | null; summary?: string | null; match: VibeMatch | null; rematchOpen: boolean; rematchUntil: string };

const POOR_MATCH = 60;

export default function ResidentVibeCard({ tenantId, onRoomChange }: { tenantId: string; onRoomChange: () => void }) {
  const queryClient = useQueryClient();
  const queryKey = ['resident', 'vibe', tenantId];
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: async (): Promise<VibeState> => (await api.get(`/pg/tenant/${tenantId}/vibe-match`)).data
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<VibeAnswers>({});
  const [draftSummary, setDraftSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const complete = hasKeyHabits(draft);

  const startEditing = () => {
    setDraft(data?.answers ?? {});
    setDraftSummary(data?.summary ?? '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/pg/tenant/${tenantId}/vibe`, { answers: draft, summary: draftSummary || undefined });
      toast.success('VibeCheck saved');
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save your answers'));
    } finally {
      setSaving(false);
    }
  };

  if (isPending || !data) return null;
  const match = data.match;

  return (
    <section aria-labelledby="vibe-heading" className="rounded-[14px] border border-hairline bg-white p-5">
      <h2 id="vibe-heading" className="text-xl font-semibold">VibeCheck</h2>
      {editing ? (
        <>
          <p className="mt-1 text-muted">Your answers help new residents find a room that suits them. Others only ever see habits, never your name.</p>
          <div className="mt-4"><VibeProfileBuilder answers={draft} summary={draftSummary} onChange={(answers, summary) => { setDraft(answers); setDraftSummary(summary); }} /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!complete || saving} onClick={() => void save()} className="btn-secondary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save answers
            </button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-3 font-medium text-muted hover:text-navy-900">Cancel</button>
          </div>
        </>
      ) : !data.answers ? (
        <>
          <p className="mt-1 text-muted">Answer 8 quick questions about sleep, tidiness and noise, so people joining your room can see if they'd fit in.</p>
          <button type="button" onClick={startEditing} className="btn-secondary mt-3">Take VibeCheck</button>
        </>
      ) : (
        <>
          {match && match.score !== null ? (
            <>
              <p className="mt-1 text-ink">
                <span className="tabular font-semibold text-navy-900">{match.score}%</span> match with your {match.compared === 1 ? 'roommate' : `${match.compared} roommates`}
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink">
                {match.reasons.map((reason) => <li key={reason} className="flex gap-1.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden="true" />{reason}</li>)}
                {match.differences.map((difference) => <li key={difference} className="text-muted">{difference}</li>)}
              </ul>
              {data.rematchOpen && match.score < POOR_MATCH && (
                <div className="mt-3 rounded-[10px] bg-attention-bg px-3 py-2 text-attention">
                  Not a great fit? You can ask for a room change until {shortDate(data.rematchUntil)}.
                  <button type="button" onClick={onRoomChange} className="ml-1 font-semibold underline underline-offset-2">Request a room change</button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-1 text-muted">Your answers are saved. None of your roommates have taken VibeCheck yet.</p>
          )}
          <button type="button" onClick={startEditing} className="mt-3 min-h-11 font-medium text-navy-700 underline-offset-2 hover:underline">Change my answers</button>
        </>
      )}
    </section>
  );
}
