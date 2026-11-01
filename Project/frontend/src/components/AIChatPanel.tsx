import { useRef, useState } from 'react';
import { ImagePlus, Loader2, MessageCircle, Mic, Send, Square, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

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

export default function AIChatPanel() {
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);

  const send = async (confirmationId?: string) => {
    const text = input.trim();
    if ((!text && !confirmationId) || busy) return;
    setBusy(true);
    if (text) setMessages((current) => [...current, { from: 'user', text: photo ? `${text} [photo attached]` : text }]);
    const imageDataUrl = photo;
    setInput('');
    setPhoto(null);
    try {
      const response = await api.post('/pg/ai/chat', { message: text, sessionId: sessionId || undefined, confirmationId, imageDataUrl: imageDataUrl || undefined });
      if (response.data.sessionId) setSessionId(response.data.sessionId);
      setPending(response.data.needsConfirmation || null);
      setMessages((current) => [...current, { from: 'assistant', text: response.data.reply }]);
    } catch (error: unknown) {
      const failure = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
      if (failure?.status === 503) {
        setUnavailable(true);
        setMessages((current) => [...current, { from: 'assistant', text: 'The AI assistant is not connected yet. The owner can enable it with a Meta Model API key.' }]);
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

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open PG assistant" className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#02224B] text-white shadow-lg hover:bg-[#0A3B75]">
        <MessageCircle className="h-5 w-5" />
      </button>
    );
  }

  return (
    <section aria-label="PG assistant" className="fixed bottom-5 right-5 z-50 flex h-[480px] w-[min(92vw,380px)] flex-col border border-slate-200 bg-white shadow-xl">
      <header className="flex items-center justify-between bg-[#02224B] px-4 py-3 text-white">
        <div><p className="text-sm font-semibold">PG Assistant</p><p className="text-[11px] text-blue-200">Answers come from live property data</p></div>
        <button onClick={() => setOpen(false)} aria-label="Close assistant" className="p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {!messages.length && <p className="text-slate-500">Ask about PGs, availability, your booking, or — for owners — occupancy and dues. Example: “men’s PG near Sholinganallur under ₹9000 with food”. Attach a photo for maintenance issues, or tap the mic for a voice note.</p>}
        {messages.map((msg, i) => (
          <p key={i} className={`max-w-[85%] px-3 py-2 ${msg.from === 'user' ? 'ml-auto bg-[#02224B] text-white' : 'bg-slate-100 text-slate-800'}`}>{msg.text}</p>
        ))}
        {(busy || transcribing) && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>
      {photo && (
        <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <img src={photo} alt="Attached issue" className="h-10 w-10 object-cover" />
          <span>Photo will be sent with your message</span>
          <button onClick={() => setPhoto(null)} aria-label="Remove photo" className="ml-auto p-1 hover:bg-slate-200"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {recording && (
        <div className="flex items-center gap-2 border-t border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
          <span>Recording… tap stop to transcribe (max {MAX_RECORD_SECONDS}s)</span>
        </div>
      )}
      {pending && !unavailable && (
        <div className="border-t border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="text-amber-900">{pending.preview}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => { setPending(null); void send(pending.confirmationId); }} className="bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Confirm</button>
            <button onClick={() => setPending(null)} className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Cancel</button>
          </div>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t border-slate-200 p-3">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void attachPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a photo" className="px-2 text-slate-500 hover:text-slate-800"><ImagePlus className="h-4 w-4" /></button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about PGs…" className="w-full border border-slate-300 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void toggleRecording()} aria-label={recording ? 'Stop recording' : 'Record a voice note'} className={`px-2 ${recording ? 'text-red-600' : 'text-slate-500 hover:text-slate-800'}`}>
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button disabled={busy} aria-label="Send" className="bg-[#02224B] px-3 text-white disabled:opacity-60"><Send className="h-4 w-4" /></button>
      </form>
    </section>
  );
}
