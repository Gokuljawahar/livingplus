// VibeCheck as a voice conversation. First choice: a live call with Gemini
// (Gemini Live API through our server relay) where you just talk and it
// answers in its own voice. If live voice can't start, it falls back to
// tap-to-talk turns (Gemini hears each recording, the browser reads replies
// aloud). Typing works in both, and the quick questions remain for review.
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Loader2, Mic, PhoneOff, Send, Square, Volume2, VolumeX } from 'lucide-react';
import { VIBE_QUESTIONS, type VibeAnswers } from '@livingplus/shared';
import api from '../api/axios';
import VibeQuiz from './VibeQuiz';
import { blobToWav16k } from '../utils/audio';
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

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export default function VibeProfileBuilder({ answers, summary, onChange, propertyId, skipTopics }: VibeProfileBuilderProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [started, setStarted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [showQuiz, setShowQuiz] = useState(false);
  const [mode, setMode] = useState<'idle' | 'live' | 'tap'>('idle');
  const [liveDraft, setLiveDraft] = useState('');
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns, thinking]);

  useEffect(() => () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
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

  const stopRecording = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const startRecording = async () => {
    setError('');
    const history = started ? turns : [{ role: 'assistant' as const, text: OPENING }];
    if (!started) begin(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setTyping(true);
      setError('Voice is not available in this browser. Type your answer instead.');
      return;
    }
    try {
      stopSpeaking();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) return;
        try {
          const wav = await blobToWav16k(blob);
          await send({ audio: { mimeType: 'audio/wav', data: await blobToBase64(wav) } }, '', history);
        } catch {
          setError("I couldn't process that recording. Try again, or type your answer.");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      tickRef.current = window.setInterval(() => {
        setSeconds((value) => {
          if (value + 1 >= MAX_SECONDS) stopRecording();
          return value + 1;
        });
      }, 1000);
    } catch {
      setTyping(true);
      setError('Microphone access was blocked. Type your answer instead.');
    }
  };

  const submitTyped = () => {
    const text = draft.trim();
    if (!text) return;
    const history = started ? turns : [{ role: 'assistant' as const, text: OPENING }];
    if (!started) begin(false);
    setDraft('');
    void send({ text }, text, history);
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
            {live.status !== 'ended' && live.status !== 'failed' && (
              <button type="button" onClick={live.end} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-negative hover:bg-negative-bg">
                <PhoneOff className="h-4 w-4" aria-hidden="true" /> End
              </button>
            )}
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
          <p className="text-sm text-muted">Just talk, in Tamil, Hindi or English. We’ll find roommates like you.</p>
          <button type="button" onClick={() => { setMode('tap'); begin(false); setTyping(true); }} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline">
            <Keyboard className="h-4 w-4" aria-hidden="true" /> Type instead
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
                    onClick={() => (recording ? stopRecording() : void startRecording())}
                    aria-label={recording ? 'Stop and send' : 'Tap to answer'}
                    className={`flex h-14 w-14 items-center justify-center rounded-full text-white disabled:opacity-50 ${recording ? 'animate-pulse bg-negative' : 'bg-navy-900 hover:bg-navy-700'}`}
                  >
                    {recording ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6 text-amber-500" />}
                  </button>
                  <p className="w-32 text-sm text-muted">
                    {recording ? `Listening · ${seconds}s, tap to send` : thinking ? 'Thinking…' : 'Tap to answer'}
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
