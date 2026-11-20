// VibeCheck input: describe your routine in your own words (any language) and
// Gemini (one structured call) fills in the habits; review and correct them in the
// quiz below. If the AI is unavailable, the quiz alone still works.
import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { type VibeAnswers } from '@livingplus/shared';
import api from '../api/axios';
import VibeQuiz from './VibeQuiz';
import { apiErrorMessage, apiErrorStatus } from '../utils/api-error';

interface VibeProfileBuilderProps {
  answers: VibeAnswers;
  summary: string;
  onChange: (answers: VibeAnswers, summary: string) => void;
}

export default function VibeProfileBuilder({ answers, summary, onChange }: VibeProfileBuilderProps) {
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState('');
  const [showQuiz, setShowQuiz] = useState(Object.keys(answers).length > 0);

  const read = async () => {
    setReading(true);
    setError('');
    try {
      const profile = (await api.post('/pg/vibecheck/profile', { text, answers })).data as { answers: VibeAnswers; summary: string | null; followUp: string | null };
      onChange(profile.answers, profile.summary ?? '');
      setFollowUp(profile.followUp ?? '');
      setShowQuiz(true);
    } catch (failure) {
      setError(apiErrorStatus(failure) === 503 || apiErrorStatus(failure) === 502
        ? apiErrorMessage(failure, 'Answer the quick questions instead.')
        : apiErrorMessage(failure, 'Could not read that. Try again or answer the quick questions.'));
      setShowQuiz(true);
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-navy-900">
        Describe your usual day
        <span className="block font-normal text-muted">When you sleep and wake, how tidy you are, noise, visitors, cooking. Any language is fine.</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="e.g. I study till 1 am, keep my desk neat, play guitar on weekends and rarely have visitors"
          className="mt-2 block w-full rounded-[6px] border border-field-border bg-white px-3 py-2"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={reading || text.trim().length < 10} onClick={() => void read()} className="btn-secondary">
          {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} Read my routine
        </button>
        {!showQuiz && (
          <button type="button" onClick={() => setShowQuiz(true)} className="min-h-11 font-medium text-navy-700 underline-offset-2 hover:underline">
            Answer quick questions instead
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-attention">{error}</p>}

      {summary && (
        <div className="rounded-[10px] bg-surface px-3 py-2" aria-live="polite">
          <p className="text-sm font-medium text-navy-900">Here's what we understood</p>
          <p className="text-ink">{summary}</p>
        </div>
      )}
      {followUp && <p className="text-sm text-attention">{followUp}</p>}

      {showQuiz && (
        <div>
          <p className="mb-2 text-sm text-muted">{summary ? 'Check these and fix anything we got wrong.' : 'Pick what fits you best.'}</p>
          <VibeQuiz value={answers} onChange={(next) => onChange(next, summary)} />
        </div>
      )}
    </div>
  );
}
