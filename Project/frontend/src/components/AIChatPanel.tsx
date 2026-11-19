import { useEffect, useRef, useState } from 'react';
import { areaOf } from '../utils/app-areas';
import { ImagePlus, Loader2, MessageCircle, Mic, Send, Square, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/auth';
import { OWNER_USER_KEY, RESIDENT_USER_KEY } from '../utils/session';

function readStoredRole(key: string): string | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return typeof parsed?.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

type ChatMsg = { from: 'user' | 'assistant'; text: string };

const MAX_RECORD_SECONDS = 60;

function fileToPhotoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1024;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

async function blobToWav16k(blob: Blob): Promise<Blob> {
  const raw = await blob.arrayBuffer();
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  try {
    const audio = await ctx.decodeAudioData(raw);
    const targetRate = 16000;
    const channels: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c += 1) channels.push(audio.getChannelData(c));
    const ratio = audio.sampleRate / targetRate;
    const len = Math.floor(audio.length / ratio);
    const pcm = new Int16Array(len);
    for (let i = 0; i < len; i += 1) {
      let sample = 0;
      for (const channel of channels) sample += channel[Math.floor(i * ratio)] || 0;
      sample /= channels.length || 1;
      const clamped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const writeAscii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, pcm.byteLength, true);
    return new Blob([header, pcm.buffer as ArrayBuffer], { type: 'audio/wav' });
  } finally {
    void ctx.close();
  }
}

type AssistantPersona = 'guest' | 'resident' | 'warden' | 'owner';

// Welcome text and input hint stay in one place per persona so the panel
// always describes what that role's agent can actually see and do.
const PERSONA_COPY: Record<AssistantPersona, { welcome: string; placeholder: string }> = {
  guest: {
    welcome: 'Looking for a PG? Ask me to search by area, budget, or room type, compare stays, or start a booking request. Already applied? Track it under My requests.',
    placeholder: 'Search PGs by area, budget, or room type…'
  },
  resident: {
    welcome: 'Ask about your own stay, rent balance or maintenance requests on your PG. You can also report an issue or change your meal preference. I can only ever see your stay — never other residents or owner finances.',
    placeholder: 'Ask about your stay, rent, or maintenance…'
  },
  warden: {
    welcome: 'Ask about occupancy, bookings, maintenance or expenses on your assigned properties. The assistant will ask before any action. Dues detail lives in the owner rent ledger, which I cannot see.',
    placeholder: 'Ask about occupancy, bookings, or maintenance…'
  },
  owner: {
    welcome: 'Ask about occupancy, outstanding rent, expenses or operations across your properties. The assistant will ask before any action.',
    placeholder: 'Ask about occupancy, rent, or expenses…'
  }
};

interface AIChatPanelProps {
  /** Text-only assistant: hides photo reports and voice notes until onboarding. */
  limited?: boolean;
  /** Hides the floating bubble; the parent opens the panel via openRequest. */
  hideLauncher?: boolean;
  /** Open the panel (and prefill the box) with a search query. */
  openRequest?: { query: string; nonce: number } | null;
}

export default function AIChatPanel({ limited = false, hideLauncher = false, openRequest = null }: AIChatPanelProps) {
  const { user } = useAuth();
  // The global auth context only loads on full page load, so after SPA
  // navigation it can still hold a previous session (e.g. an owner account
  // while viewing the resident portal). Resolve the persona from the stored
  // session for this page instead, so residents never see owner wording.
  const path = window.location.pathname;
  const isResidentPage = areaOf(path) === 'resident';
  const residentRole = user?.role === 'PG_TENANT' ? user.role : readStoredRole(RESIDENT_USER_KEY);
  const ownerRole = user?.role && user.role !== 'PG_TENANT' ? user.role : readStoredRole(OWNER_USER_KEY);

  const staffPersona: AssistantPersona | null =
    ownerRole === 'PG_OWNER' ? 'owner'
    : ownerRole === 'PG_WARDEN' ? 'warden'
    : null;

  let persona: AssistantPersona = 'guest';
  if (isResidentPage) {
    persona = residentRole === 'PG_TENANT' ? 'resident' : 'guest';
  } else if (residentRole === 'PG_TENANT' && !ownerRole) {
    persona = 'resident';
  } else if (staffPersona) {
    persona = staffPersona;
  } else if (residentRole === 'PG_TENANT') {
    persona = 'resident';
  }
  const copy = PERSONA_COPY[persona];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pending, setPending] = useState<{ confirmationId: string; tool: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  const send = async (confirmationId?: string, cancelConfirmationId?: string) => {
    const text = input.trim();
    if ((!text && !confirmationId && !cancelConfirmationId) || busy) return;
    setBusy(true);
    if (text) setMessages((current) => [...current, { from: 'user', text: photo ? `${text} [photo attached]` : text }]);
    const imageDataUrl = photo;
    setInput('');
    setPhoto(null);
    try {
      const response = await api.post('/pg/ai/chat', { message: text, sessionId: sessionId || undefined, confirmationId, cancelConfirmationId, imageDataUrl: imageDataUrl || undefined });
      if (response.data.sessionId) setSessionId(response.data.sessionId);
      setPending(response.data.needsConfirmation || null);
      setMessages((current) => cancelConfirmationId
        ? [{ from: 'assistant', text: response.data.reply }]
        : [...current, { from: 'assistant', text: response.data.reply }]);
    } catch (error: unknown) {
      const failure = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
      if (failure?.status === 503) {
        setUnavailable(true);
        setMessages((current) => [...current, { from: 'assistant', text: 'The AI assistant is not connected yet. The owner can enable it by configuring an AI model.' }]);
      } else {
        toast.error(failure?.data?.message || 'Assistant failed to answer');
      }
    } finally {
      setBusy(false);
    }
  };

  const attachPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a JPEG, PNG or WebP photo');
      return;
    }
    try {
      setPhoto(await fileToPhotoDataUrl(file));
    } catch {
      toast.error('Could not read that image');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const toggleRecording = async () => {
    if (recording) {
      stopRecording();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice recording is not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
        void transcribeNote(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      stopTimerRef.current = window.setTimeout(stopRecording, MAX_RECORD_SECONDS * 1000);
    } catch {
      toast.error('Microphone access was denied');
    }
  };

  const transcribeNote = async (blob: Blob) => {
    if (!blob.size) return;
    setTranscribing(true);
    try {
      const wav = await blobToWav16k(blob);
      const form = new FormData();
      form.append('audio', wav, 'note.wav');
      const response = await api.post('/pg/ai/transcribe', form);
      const transcript = String(response.data?.transcript || '').trim();
      if (transcript) {
        setInput((current) => (current ? `${current} ${transcript}` : transcript));
      } else {
        toast.error('No speech was recognized');
      }
    } catch {
      toast.error('Voice note could not be transcribed');
    } finally {
      setTranscribing(false);
    }
  };

  // Opening from the global search is derived state, applied during render
  // (the documented alternative to a setState-in-effect).
  const [lastNonce, setLastNonce] = useState(0);
  if (openRequest && openRequest.nonce !== lastNonce) {
    setLastNonce(openRequest.nonce);
    setOpen(true);
    if (openRequest.query.trim()) setInput(openRequest.query.trim());
  }

  useEffect(() => {
    if (lastNonce > 0 && open) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(timer);
    }
  }, [lastNonce, open]);

  if (!open) {
    if (hideLauncher) return null;
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open PG assistant"
        className={`fixed ${isResidentPage ? 'bottom-20 lg:bottom-6' : 'bottom-6'} right-6 z-50 flex items-center gap-2 rounded-full bg-navy-900 text-white px-4 py-3 shadow-xl transition-all duration-200 group border border-white/20`}
      >
        <div className="relative">
          <MessageCircle className="h-5 w-5 text-amber-500" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <span className="text-xs font-bold pr-1">PG Concierge</span>
      </button>
    );
  }

  const SUGGESTED_PROMPTS: Record<AssistantPersona, string[]> = {
    guest: ['Single rooms under ₹8,000', 'PGs with food included', 'How does deposit refund work?'],
    resident: ['When is my rent due?', 'How to request room swap?', 'Report WiFi / maintenance'],
    warden: ['Pending booking requests', 'Open maintenance tickets'],
    owner: ['Occupancy summary', 'Rent collection status', 'Draft vacancy update']
  };

  return (
    <section
      aria-label="PG assistant"
      className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[min(94vw,400px)] flex-col rounded-3xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      <header className="flex items-center justify-between bg-navy-900 px-5 py-3.5 text-white shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-amber-500 text-navy-900 flex items-center justify-center font-bold shadow-xs">
            <MessageCircle className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold tracking-tight">LivingPlus Assistant</p>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </div>
            <p className="text-[11px] text-blue-200/80">Context-aware · Verifies property records</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="rounded-full p-1.5 text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs sm:text-sm bg-slate-50/40">
        {!messages.length && (
          <div className="space-y-3 pt-2">
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-xs">
              <p className="text-slate-700 leading-relaxed font-medium">{copy.welcome}</p>
              {limited && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-900 font-medium leading-relaxed">
                  🔒 <strong>Guest mode:</strong> Onboard as a resident on your PG's site to unlock voice notes and photo-based maintenance reporting.
                </div>
              )}
            </div>

            {/* Quick Suggestion Chips */}
            <div className="pt-2">
              <p className="text-[11px] font-bold text-slate-400 px-1 mb-2">Try asking</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS[persona].map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => {
                      setInput(promptText);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 hover:border-amber-500 hover:bg-amber-50/50 transition-all shadow-xs text-left"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[88%] px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
              msg.from === 'user'
                ? 'ml-auto rounded-2xl rounded-tr-xs bg-navy-900 text-white shadow-xs font-medium'
                : 'rounded-2xl rounded-tl-xs bg-white text-slate-800 border border-slate-200/80 shadow-xs'
            }`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                h1: ({ children }) => <h3 className="mb-2 text-base font-bold">{children}</h3>,
                h2: ({ children }) => <h3 className="mb-2 text-sm font-bold">{children}</h3>,
                h3: ({ children }) => <h3 className="mb-1 font-bold">{children}</h3>,
                ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
                li: ({ children }) => <li className="pl-0.5">{children}</li>,
                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                code: ({ children }) => <code className="rounded bg-black/5 px-1 py-0.5 text-[0.92em] font-mono">{children}</code>
              }}
            >
              {msg.text}
            </ReactMarkdown>
          </div>
        ))}

        {(busy || transcribing) && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-white px-3 py-2 rounded-2xl w-fit border border-slate-100 shadow-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-navy-900" />
            <span>Thinking…</span>
          </div>
        )}
      </div>

      {photo && (
        <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <img src={photo} alt="Attached issue" className="h-10 w-10 object-cover rounded-lg border border-slate-200" />
          <span className="font-medium">Photo attached to message</span>
          <button onClick={() => setPhoto(null)} aria-label="Remove photo" className="ml-auto p-1 hover:bg-slate-200 rounded-full transition-colors"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {recording && (
        <div className="flex items-center gap-2 border-t border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700 animate-pulse">
          <span className="h-2 w-2 rounded-full bg-red-600" />
          <span>Recording voice note… tap stop to transcribe (max {MAX_RECORD_SECONDS}s)</span>
        </div>
      )}

      {pending && !unavailable && (
        <div className="border-t border-amber-200 bg-amber-50 p-3.5 text-xs">
          <p className="text-amber-900 font-medium leading-relaxed">{pending.preview}</p>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => { setPending(null); void send(pending.confirmationId); }} className="rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors">Confirm action</button>
            <button onClick={() => void send(undefined, pending.confirmationId)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void attachPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        {!limited && (
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a photo" className="p-2 text-slate-400 hover:text-navy-900 hover:bg-slate-100 rounded-xl transition-colors" title="Attach issue photo">
            <ImagePlus className="h-4.5 w-4.5" />
          </button>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs sm:text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-navy-900/15 focus:border-navy-900 transition-all"
        />
        {!limited && (
          <button
            type="button"
            onClick={() => void toggleRecording()}
            aria-label={recording ? 'Stop recording' : 'Record a voice note'}
            className={`p-2 rounded-xl transition-colors ${recording ? 'text-red-600 bg-red-50' : 'text-slate-400 hover:text-navy-900 hover:bg-slate-100'}`}
            title={recording ? 'Stop voice note' : 'Record voice note'}
          >
            {recording ? <Square className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
          </button>
        )}
        <button
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="btn-primary p-2.5 rounded-xl shadow-xs disabled:opacity-40 transition-all"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
