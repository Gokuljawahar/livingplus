import { useEffect, useRef, useState } from 'react';
import { areaOf } from '../utils/app-areas';
import { ImagePlus, Loader2, MessageCircle, Mic, Send, Square, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import api from '../api/axios';
import A2uiSurface, { type A2uiAction, type A2uiMessage } from './a2ui/A2uiSurface';
import { useAuth } from '../context/auth';
import { OWNER_USER_KEY, RESIDENT_USER_KEY } from '../utils/session';
import { usePreferencesStore } from '../utils/preferences-store';
import { transcribeVoiceBlob, useVoiceRecorder } from '../hooks/useVoiceRecorder';

function readStoredRole(key: string): string | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return typeof parsed?.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

type ChatMsg = { from: 'user' | 'assistant'; text: string; ui?: A2uiMessage[] };

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
  // Reply language (Tamil, Hindi or English), remembered on this device via Zustand persist.
  const language = usePreferencesStore((s) => s.assistantLanguage);
  const setLanguage = usePreferencesStore((s) => s.setAssistantLanguage);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [pending, setPending] = useState<{ confirmationId: string; tool: string; preview: string; ui?: A2uiMessage[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const applyResponse = (data: { sessionId?: string; reply: string; needsConfirmation?: { confirmationId: string; tool: string; preview: string }; ui?: A2uiMessage[] }, cancelConfirmationId?: string) => {
    if (data.sessionId) setSessionId(data.sessionId);
    setPending(data.needsConfirmation ? { ...data.needsConfirmation, ...(data.ui ? { ui: data.ui } : {}) } : null);
    const message: ChatMsg = { from: 'assistant', text: data.reply, ...(data.ui && !data.needsConfirmation ? { ui: data.ui } : {}) };
    setMessages((current) => cancelConfirmationId ? [message] : [...current, message]);
  };

  const handleFailure = (error: unknown) => {
    const failure = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
    if (failure?.status === 503) {
      setUnavailable(true);
      setMessages((current) => [...current, { from: 'assistant', text: 'The assistant isn\'t available right now. Everything else works as usual.' }]);
    } else {
      toast.error(failure?.data?.message || 'Assistant failed to answer');
    }
  };

  const dispatch = async (body: { message: string; confirmationId?: string; cancelConfirmationId?: string; imageDataUrl?: string | null }) => {
    try {
      const response = await api.post('/pg/ai/chat', { ...body, sessionId: sessionId || undefined, language });
      applyResponse(response.data, body.cancelConfirmationId);
    } catch (error: unknown) {
      handleFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const send = async (confirmationId?: string, cancelConfirmationId?: string) => {
    const text = input.trim();
    if ((!text && !confirmationId && !cancelConfirmationId) || busy) return;
    setBusy(true);
    if (text) setMessages((current) => [...current, { from: 'user', text: photo ? `${text} [photo attached]` : text }]);
    const imageDataUrl = photo;
    setInput('');
    setPhoto(null);
    await dispatch({ message: text, confirmationId, cancelConfirmationId, imageDataUrl: imageDataUrl || undefined });
  };

  /** A2UI button events come back as agent actions (renderer-to-agent over the chat POST). */
  const handleUiAction = (action: A2uiAction) => {
    const confirmationId = typeof action.context.confirmationId === 'string' ? action.context.confirmationId : pending?.confirmationId;
    if (action.name === 'confirm_action' && confirmationId) {
      setPending(null);
      void send(confirmationId);
      return;
    }
    if (action.name === 'cancel_action' && confirmationId) {
      setPending(null);
      void send(undefined, confirmationId);
      return;
    }
    if (action.name === 'book_property') {
      const name = typeof action.context.name === 'string' ? action.context.name : 'this PG';
      if (busy) return;
      setBusy(true);
      setMessages((current) => [...current, { from: 'user', text: `I'd like to book a bed at ${name}` }]);
      void dispatch({ message: `I'd like to book a bed at ${name}` });
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

  const transcribeNote = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const transcript = await transcribeVoiceBlob(blob);
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

  const voice = useVoiceRecorder({
    maxSeconds: MAX_RECORD_SECONDS,
    onRecorded: transcribeNote,
    onError: (reason) => {
      toast.error(reason === 'unsupported' ? 'Voice recording is not supported in this browser' : 'Microphone access was denied');
    }
  });

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
        className={`fixed ${isResidentPage ? 'bottom-20 lg:bottom-6' : 'bottom-5 sm:bottom-6'} right-4 sm:right-6 z-50 flex h-14 w-14 items-center justify-center gap-2 rounded-full border border-white/20 bg-navy-900 text-white shadow-[var(--shadow-float)] transition-colors hover:bg-navy-700 sm:h-auto sm:w-auto sm:px-4 sm:py-3`}
      >
        <MessageCircle className="h-6 w-6 text-amber-500 sm:h-5 sm:w-5" aria-hidden="true" />
        <span className="hidden pr-1 text-sm font-semibold sm:inline">Ask the assistant</span>
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
      className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[min(94vw,400px)] flex-col rounded-3xl border border-hairline bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      <header className="flex items-center justify-between bg-navy-900 px-5 py-3.5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-[var(--radius-button)] bg-amber-500 text-navy-900 flex items-center justify-center font-bold">
            <MessageCircle className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold tracking-tight">LivingPlus Assistant</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-positive bg-positive/40 px-2 py-0.5 rounded-full border border-positive/20">
                <span className="h-1.5 w-1.5 rounded-full bg-positive-bg animate-pulse" /> Live
              </span>
            </div>
            <p className="text-[13px] text-white/75">Answers from your PG's live records</p>
          </div>
        </div>
        <label className="ml-auto mr-1">
          <span className="sr-only">Reply language</span>
          <select
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value);
            }}
            className="rounded-[6px] border border-white/30 bg-navy-900 px-2 py-1 text-[13px] text-white"
          >
            <option value="en">English</option>
            <option value="ta">தமிழ்</option>
            <option value="hi">हिन्दी</option>
          </select>
        </label>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          className="rounded-full p-1.5 text-info hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs sm:text-sm bg-surface">
        {!messages.length && (
          <div className="space-y-3 pt-2">
            <div className="rounded-[var(--radius-card)] border border-info/30 bg-white p-4">
              <p className="text-ink leading-relaxed font-medium">{copy.welcome}</p>
              {limited && (
                <div className="mt-3 rounded-[var(--radius-button)] border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900 font-medium leading-relaxed">
                  🔒 <strong>Guest mode:</strong> Onboard as a resident on your PG's site to unlock voice notes and photo-based maintenance reporting.
                </div>
              )}
            </div>

            {/* Quick Suggestion Chips */}
            <div className="pt-2">
              <p className="text-xs font-bold text-muted px-1 mb-2">Try asking</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS[persona].map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => {
                      setInput(promptText);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 hover:border-amber-500 hover:bg-amber-50/50 transition-all text-left"
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
                ? 'ml-auto rounded-[var(--radius-card)] rounded-tr-xs bg-navy-900 text-white font-medium'
                : 'rounded-[var(--radius-card)] rounded-tl-xs bg-white text-ink border border-hairline'
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
            {msg.ui && <A2uiSurface messages={msg.ui} onAction={handleUiAction} />}
          </div>
        ))}

        {(busy || transcribing) && (
          <div className="flex items-center gap-2 text-xs text-muted bg-white px-3 py-2 rounded-[var(--radius-card)] w-fit border border-hairline">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-navy-900" />
            <span>Thinking…</span>
          </div>
        )}
      </div>

      {photo && (
        <div className="flex items-center gap-2 border-t border-hairline bg-surface p-2 text-xs text-muted">
          <img src={photo} alt="Attached issue" className="h-10 w-10 object-cover rounded-[var(--radius-field)] border border-hairline" />
          <span className="font-medium">Photo attached to message</span>
          <button onClick={() => setPhoto(null)} aria-label="Remove photo" className="ml-auto p-1 hover:bg-hairline rounded-full transition-colors"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {voice.recording && (
        <div className="flex items-center gap-2 border-t border-negative/30 bg-negative-bg p-2.5 text-xs font-semibold text-negative animate-pulse">
          <span className="h-2 w-2 rounded-full bg-negative" />
          <span>Recording voice note… tap stop to transcribe (max {MAX_RECORD_SECONDS}s)</span>
        </div>
      )}

      {pending && !unavailable && (
        pending.ui ? (
          <div className="border-t border-amber-200 bg-amber-50/60 p-3">
            <A2uiSurface messages={pending.ui} onAction={handleUiAction} />
          </div>
        ) : (
          <div className="border-t border-amber-200 bg-amber-50 p-3.5 text-xs">
            <p className="text-amber-900 font-medium leading-relaxed">{pending.preview}</p>
            <div className="mt-2.5 flex gap-2">
              <button onClick={() => { setPending(null); void send(pending.confirmationId); }} className="btn-primary">Confirm action</button>
              <button onClick={() => void send(undefined, pending.confirmationId)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )
      )}

      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-center gap-2 border-t border-hairline bg-white p-3">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void attachPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        {!limited && (
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a photo" className="p-2 text-muted hover:text-navy-900 hover:bg-surface rounded-[var(--radius-button)] transition-colors" title="Attach issue photo">
            <ImagePlus className="h-4.5 w-4.5" />
          </button>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          className="w-full rounded-[var(--radius-button)] border border-field-border bg-surface px-3.5 py-2 text-xs sm:text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-navy-900/15 focus:border-navy-900 transition-all"
        />
        {!limited && (
          <button
            type="button"
            onClick={() => void voice.toggle()}
            aria-label={voice.recording ? 'Stop recording' : 'Record a voice note'}
            className={`p-2 rounded-[var(--radius-button)] transition-colors ${voice.recording ? 'text-negative bg-negative-bg' : 'text-muted hover:text-navy-900 hover:bg-surface'}`}
            title={voice.recording ? 'Stop voice note' : 'Record voice note'}
          >
            {voice.recording ? <Square className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
          </button>
        )}
        <button
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="btn-primary p-2.5 rounded-[var(--radius-button)] disabled:opacity-40 transition-all"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
