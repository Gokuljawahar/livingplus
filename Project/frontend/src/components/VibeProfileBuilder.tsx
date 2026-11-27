// VibeCheck as a voice conversation. First choice: a live call with Gemini
// (Gemini Live API through our server relay) where you just talk and it
// answers in its own voice. If live voice can't start, it falls back to
// tap-to-talk turns (Gemini hears each recording, the browser reads replies
// aloud). Typing works in both, and the quick questions remain for review.
import { useEffect, useRef, useState } from 'react';
import { Clock, Cloud, Keyboard, Loader2, Lock, Mic, PhoneOff, Send, Sparkles, Square, Volume2, VolumeX } from 'lucide-react';
import { VIBE_QUESTIONS, type VibeAnswers } from '@livingplus/shared';
import api from '../api/axios';
import { getHybridRemoteConfig } from '../ai/remote-config';
import VibeQuiz from './VibeQuiz';
import { blobToBase64, useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { apiErrorMessage } from '../utils/api-error';
import { useVibeLive } from '../hooks/useVibeLive';

interface VibeProfileBuilderProps {
  answers: VibeAnswers;
  summary: string;
  onChange: (answers: VibeAnswers, summary: string) => void;
  /** The PG being matched, so the conversation only covers what applies there. */
  propertyId?: string;
  /** Topics to leave out of the quick questions (vibeTopicsFor(place).skip). */
  skipTopics?: string[];
}

type Turn = { role: 'assistant' | 'user'; text: string };
type InterviewReply = { heard: string; answers: VibeAnswers; summary: string | null; reply: string; done: boolean };

const OPENING = "Hey! I'm your PG buddy. Studying or working these days?";
const MAX_SECONDS = 20;

/** Speaks a line in the voice that matches its script (Tamil, Hindi or English). */
function speak(text: string, enabled: boolean) {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[஀-௿]/.test(text) ? 'ta-IN' : /[ऀ-ॿ]/.test(text) ? 'hi-IN' : 'en-IN';
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is a bonus; the text is always on screen.
  }
}

function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

export default function VibeProfileBuilder({ answers, summary, onChange, propertyId, skipTopics }: VibeProfileBuilderProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [started, setStarted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [showQuiz, setShowQuiz] = useState(false);
  const [mode, setMode] = useState<'idle' | 'live' | 'tap'>('idle');
  const [liveDraft, setLiveDraft] = useState('');
  const [showPrivateText, setShowPrivateText] = useState(false);
  const [privateText, setPrivateText] = useState('');
  const [extractingPrivate, setExtractingPrivate] = useState(false);
  const [privateStatus, setPrivateStatus] = useState<{ source: 'on-device' | 'cloud'; latencyMs?: number; notice?: string } | null>(null);
  const live = useVibeLive(({ answers: learned, summary: learnedSummary, done: finished }) => {
    onChange({ ...answers, ...learned }, learnedSummary ?? summary);
    if (finished) setDone(true);
  });

  // Plain groups, not forms: this builder sits inside the bed-request form, and a
  // nested form submits the whole page (a reload that closes the sheet mid-call).
  const sendLiveDraft = () => { if (live.sendText(liveDraft)) setLiveDraft(''); };

  const startVoice = async () => {
    setError('');
    setMode('live');
    if (await live.start(propertyId)) return;
    // Live voice unavailable: fall back to tap-to-talk turns.
    setMode('tap');
    setError('Live voice is busy right now, so tap the mic for each answer instead.');
    begin(true);
  };
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns, thinking]);

  useEffect(() => () => {
    stopSpeaking();
  }, []);

  const begin = (spoken: boolean) => {
    setStarted(true);
    setTurns([{ role: 'assistant', text: OPENING }]);
    if (spoken) speak(OPENING, voiceOn);
  };

  const send = async (input: { text?: string; audio?: { mimeType: string; data: string } }, shown: string, history: Turn[]) => {
    setError('');
    setThinking(true);
    if (shown) setTurns([...history, { role: 'user', text: shown }]);
    try {
      const result = (await api.post('/pg/vibecheck/interview', { history, answers, ...(propertyId ? { propertyId } : {}), ...input })).data as InterviewReply;
      const heard = result.heard || shown;
      setTurns([...history, ...(heard ? [{ role: 'user' as const, text: heard }] : []), { role: 'assistant', text: result.reply }]);
      onChange(result.answers, result.summary ?? summary);
      setDone(result.done);
      speak(result.reply, voiceOn);
    } catch (failure) {
      setTurns(history);
      setError(apiErrorMessage(failure, "I didn't catch that. Try again, or type your answer."));
    } finally {
      setThinking(false);
    }
  };

  const tapRecorder = useVoiceRecorder({
    maxSeconds: MAX_SECONDS,
    onRecorded: async (blob) => {
      const history = turns.length ? turns : [{ role: 'assistant' as const, text: OPENING }];
      try {
        const mimeType = (blob.type || 'audio/webm').split(';')[0] || 'audio/webm';
        await send({ audio: { mimeType, data: await blobToBase64(blob) } }, '', history);
      } catch {
        setError("I couldn't process that recording. Try again, or type your answer.");
      }
    },
    onError: (reason) => {
      setTyping(true);
      setError(
        reason === 'unsupported'
          ? 'Voice is not available in this browser. Type your answer instead.'
          : 'Microphone access was blocked. Type your answer instead.'
      );
    }
  });

  const startRecording = async () => {
    setError('');
    if (!started) begin(false);
    stopSpeaking();
    await tapRecorder.start();
  };

  const submitTyped = () => {
    const text = draft.trim();
    if (!text) return;
    const history = started ? turns : [{ role: 'assistant' as const, text: OPENING }];
    if (!started) begin(false);
    setDraft('');
    void send({ text }, text, history);
  };

  const extractFromOwnWords = async () => {
    const text = privateText.trim();
    if (text.length < 10) {
      setError('Write at least a couple of sentences about your sleep, study/work schedule, and tidiness.');
      return;
    }
    setError('');
    setExtractingPrivate(true);
    setPrivateStatus(null);

    const rc = getHybridRemoteConfig();
    if (rc.vibe_on_device_enabled) {
      try {
        const { extractVibeHabitsOnDevice } = await import('../ai/ai');
        const res = await extractVibeHabitsOnDevice(text);
        const merged: VibeAnswers = { ...answers };
        for (const [k, v] of Object.entries(res.data.answers)) {
          if (v === 0 || v === 1 || v === 2) {
            merged[k as keyof VibeAnswers] = v;
          }
        }
        onChange(merged, res.data.summary || summary);
        setDone(true);
        setPrivateStatus({
          source: 'on-device',
          latencyMs: res.latencyMs
        });
        setExtractingPrivate(false);
        return;
      } catch {
        // On-device model unavailable: explain plainly and fall back to server/cloud VibeCheck profile builder.
      }
    }

    try {
      const result = (await api.post('/pg/vibecheck/profile', { text, answers })).data as {
        answers?: VibeAnswers;
        summary?: string;
      };
      onChange({ ...answers, ...(result.answers || {}) }, result.summary ?? summary);
      setDone(true);
      setPrivateStatus({
        source: 'cloud',
        notice: "On-device Gemini Nano isn't available in this browser — used cloud Gemini fallback."
      });
    } catch (failure) {
      setError(apiErrorMessage(failure, 'Could not analyse your routine right now. Try the quick questions below.'));
    } finally {
      setExtractingPrivate(false);
    }
  };

  const learned = VIBE_QUESTIONS.filter((question) => answers[question.id] !== undefined)
    .map((question) => ({ id: question.id, label: question.phrase[answers[question.id]!] ?? question.id }));

  return (
    <div className="space-y-4">
      {mode === 'live' ? (
        <div className="rounded-[14px] border border-hairline bg-white">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-navy-900">
              <span className={`h-2.5 w-2.5 rounded-full ${live.status === 'speaking' ? 'animate-pulse bg-amber-500' : live.status === 'listening' ? 'animate-pulse bg-positive' : 'bg-hairline'}`} aria-hidden="true" />
              {live.status === 'connecting' ? 'Connecting…' : live.status === 'speaking' ? 'Your PG buddy is talking' : live.status === 'listening' ? 'Listening, just talk' : 'Chat ended'}
            </p>
            <div className="flex items-center gap-2">
              {live.latencyMs !== null && (
                <span data-testid="vibe-latency" aria-label="Voice response latency" className="tabular inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-navy-900">
                  <Clock className="h-3 w-3 text-muted" aria-hidden="true" /> {live.latencyMs < 1000 ? `${live.latencyMs} ms` : `${(live.latencyMs / 1000).toFixed(1)} s`}
                </span>
              )}
              {live.status !== 'ended' && live.status !== 'failed' && (
                <button type="button" onClick={live.end} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-negative hover:bg-negative-bg">
                  <PhoneOff className="h-4 w-4" aria-hidden="true" /> End
                </button>
              )}
            </div>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
            {live.status === 'connecting' && (
              <p className="inline-flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Calling your PG buddy…</p>
            )}
            {live.turns.map((turn, index) => (
              <p key={index} className={`w-fit max-w-[85%] rounded-[14px] px-3 py-2 text-[15px] ${turn.role === 'assistant' ? 'bg-surface text-ink' : 'ml-auto bg-navy-900 text-white'}`}>
                {turn.text}
              </p>
            ))}
          </div>
          {(live.status === 'listening' || live.status === 'speaking') && (
            <div role="group" aria-label="Typed answer during the call" className="flex gap-2 border-t border-hairline px-4 py-3">
              <label htmlFor="vibe-live-typed" className="sr-only">Type an answer</label>
              <input id="vibe-live-typed" value={liveDraft} onChange={(event) => setLiveDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); sendLiveDraft(); } }} placeholder="Or type here" maxLength={1000} className="min-w-0 flex-1 rounded-full border border-field-border bg-white px-4 py-2" />
              <button type="button" onClick={sendLiveDraft} disabled={!liveDraft.trim()} aria-label="Send typed answer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white disabled:opacity-50"><Send className="h-4 w-4" /></button>
            </div>
          )}
          {live.error && <p role="alert" className="px-4 pb-3 text-sm text-attention">{live.error}</p>}
        </div>
      ) : !started ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] bg-surface px-4 py-6 text-center">
          <button
            type="button"
            onClick={() => void startVoice()}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-navy-900 text-white shadow-[var(--shadow-float)] hover:bg-navy-700"
            aria-label="Start voice VibeCheck"
          >
            <Mic className="h-7 w-7 text-amber-500" aria-hidden="true" />
          </button>
          <p className="font-medium text-navy-900">Chat with your PG buddy</p>
          <p className="text-sm text-muted">Just talk in Tamil, Hindi, Tanglish or English. Share your routine so the owner can allot the right room.</p>
          <button type="button" onClick={() => { setMode('tap'); begin(false); setTyping(true); }} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline">
            <Keyboard className="h-4 w-4" aria-hidden="true" /> Type instead
          </button>
          <button
            type="button"
            onClick={() => setShowPrivateText((open) => !open)}
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:underline"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            In your own words (private on-device)
          </button>
        </div>
      ) : (
        <div className="rounded-[14px] border border-hairline bg-white">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
            <p className="text-sm font-medium text-navy-900">VibeCheck</p>
            <button
              type="button"
              onClick={() => { setVoiceOn(!voiceOn); stopSpeaking(); }}
              aria-pressed={voiceOn}
              aria-label={voiceOn ? 'Mute VibeCheck voice' : 'Unmute VibeCheck voice'}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface"
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
            {turns.map((turn, index) => (
              <p
                key={index}
                className={`w-fit max-w-[85%] rounded-[14px] px-3 py-2 text-[15px] ${turn.role === 'assistant' ? 'bg-surface text-ink' : 'ml-auto bg-navy-900 text-white'}`}
              >
                {turn.text}
              </p>
            ))}
            {thinking && (
              <p className="inline-flex items-center gap-2 rounded-[14px] bg-surface px-3 py-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Thinking…
              </p>
            )}
            <div ref={endRef} />
          </div>

          {!done && (
            <div className="border-t border-hairline px-4 py-3">
              {typing ? (
                <div role="group" aria-label="Answer by typing" className="flex gap-2">
                  <label htmlFor="vibe-typed" className="sr-only">Your answer</label>
                  <input
                    id="vibe-typed"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (!thinking) submitTyped(); } }}
                    placeholder="Type your answer"
                    maxLength={1000}
                    className="min-w-0 flex-1 rounded-full border border-field-border bg-white px-4 py-2"
                  />
                  <button type="button" onClick={() => submitTyped()} disabled={thinking || !draft.trim()} aria-label="Send answer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setTyping(false)} aria-label="Answer by voice" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline text-navy-900">
                    <Mic className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={thinking}
                    onClick={() => (tapRecorder.recording ? tapRecorder.stop() : void startRecording())}
                    aria-label={tapRecorder.recording ? 'Stop and send' : 'Tap to answer'}
                    className={`flex h-14 w-14 items-center justify-center rounded-full text-white disabled:opacity-50 ${tapRecorder.recording ? 'animate-pulse bg-negative' : 'bg-navy-900 hover:bg-navy-700'}`}
                  >
                    {tapRecorder.recording ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6 text-amber-500" />}
                  </button>
                  <p className="w-32 text-sm text-muted">
                    {tapRecorder.recording ? `Listening · ${tapRecorder.seconds}s, tap to send` : thinking ? 'Thinking…' : 'Tap to answer'}
                  </p>
                  <button type="button" onClick={() => setTyping(true)} aria-label="Type instead" className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline text-navy-900">
                    <Keyboard className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showPrivateText && (
        <div className="space-y-2.5 rounded-[14px] border border-emerald-700/20 bg-emerald-50/40 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-navy-900">
                <Lock className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                Describe your routine in your own words
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Your words stay on this device. Only your habits are shared for matching.
              </p>
            </div>
          </div>
          <label htmlFor="vibe-private-text" className="sr-only">Describe your daily routine</label>
          <textarea
            id="vibe-private-text"
            rows={3}
            maxLength={800}
            value={privateText}
            onChange={(e) => setPrivateText(e.target.value)}
            placeholder="e.g. I study till 1 am, keep my desk neat, headphones on after 10 pm, cook tea occasionally, prefer AC at night..."
            className="w-full resize-y rounded-[var(--radius-field)] border border-hairline bg-canvas px-3 py-2 text-xs text-ink outline-none focus:border-navy-900"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={extractingPrivate || privateText.trim().length < 10}
              onClick={() => void extractFromOwnWords()}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
            >
              {extractingPrivate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-400" />}
              Build habits privately
            </button>
            {privateStatus && (
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-canvas px-2.5 py-0.5 text-[11px] font-bold text-navy-900">
                {privateStatus.source === 'on-device' ? (
                  <>
                    <Lock className="h-3 w-3 text-emerald-700" />
                    Analysed on your device 🔒{privateStatus.latencyMs ? ` · ${privateStatus.latencyMs} ms` : ''}
                  </>
                ) : (
                  <>
                    <Cloud className="h-3 w-3 text-sky-700" />
                    Analysed in the cloud ☁️
                  </>
                )}
              </span>
            )}
          </div>
          {privateStatus?.notice && (
            <p className="text-[11px] text-muted">{privateStatus.notice}</p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-attention">{error}</p>}

      {learned.length > 0 && (
        <div>
          <p className="text-sm font-medium text-navy-900">{done ? 'Your vibe' : 'Picking up on'}</p>
          {summary && <p className="mt-0.5 text-sm text-muted">{summary}</p>}
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {learned.map((item) => (
              <li key={item.id} className="rounded-full bg-amber-50 px-3 py-1 text-sm text-navy-900">{item.label}</li>
            ))}
          </ul>
        </div>
      )}

      {showQuiz ? (
        <div>
          <p className="mb-2 text-sm text-muted">{learned.length ? 'Fix anything I got wrong.' : 'Pick what fits you.'}</p>
          <VibeQuiz value={answers} skip={skipTopics} onChange={(next) => onChange(next, summary)} />
        </div>
      ) : (
        <button type="button" onClick={() => setShowQuiz(true)} className="min-h-11 text-sm font-medium text-navy-700 underline-offset-2 hover:underline">
          {learned.length ? 'Review my answers' : 'Answer quick questions instead'}
        </button>
      )}
    </div>
  );
}
