// Live voice VibeCheck: streams the microphone to our server's Gemini Live
// relay and plays Gemini's spoken replies. The mic is paused while Gemini is
// speaking (half duplex), so it never hears and answers itself.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VibeAnswers } from '@livingplus/shared';

export type LiveStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended' | 'failed';
export interface LiveTurn { role: 'assistant' | 'user'; text: string }
export interface LiveHabits { answers: VibeAnswers; summary: string | null; done: boolean }

const IN_RATE = 16000;
const OUT_RATE = 24000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Float samples at `rate` -> 16 kHz little-endian PCM16. */
function downsample(input: Float32Array, rate: number): Uint8Array {
  const ratio = rate / IN_RATE;
  const length = Math.floor(input.length / ratio);
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] ?? 0));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return new Uint8Array(pcm.buffer);
}

export function liveUrl(): string {
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/pg/vibecheck/live`;
}

export function useVibeLive(onHabits: (habits: LiveHabits) => void) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [error, setError] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const micRef = useRef<{ stream: MediaStream; ctx: AudioContext; node: ScriptProcessorNode } | null>(null);
  const playRef = useRef<{ ctx: AudioContext; next: number; sources: AudioBufferSourceNode[] } | null>(null);
  const habitsRef = useRef(onHabits);
  useEffect(() => { habitsRef.current = onHabits; }, [onHabits]);
  const doneRef = useRef(false);

  const appendText = (role: LiveTurn['role'], text: string) => {
    setTurns((current) => {
      const last = current[current.length - 1];
      if (last && last.role === role) return [...current.slice(0, -1), { role, text: `${last.text}${text}` }];
      return [...current, { role, text: text.trimStart() }];
    });
  };

  const stopPlayback = () => {
    const play = playRef.current;
    if (!play) return;
    play.sources.forEach((source) => { try { source.stop(); } catch { /* already stopped */ } });
    play.sources = [];
    play.next = play.ctx.currentTime;
  };

  const speakingNow = () => {
    const play = playRef.current;
    return Boolean(play && play.next > play.ctx.currentTime + 0.05);
  };

  const playChunk = (base64: string) => {
    const play = playRef.current;
    if (!play) return;
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const buffer = play.ctx.createBuffer(1, samples.length, OUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) channel[i] = (samples[i] ?? 0) / 0x8000;
    const source = play.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(play.ctx.destination);
    const start = Math.max(play.ctx.currentTime + 0.02, play.next);
    source.start(start);
    play.next = start + buffer.duration;
    play.sources.push(source);
    source.onended = () => { if (playRef.current) playRef.current.sources = playRef.current.sources.filter((item) => item !== source); };
  };

  const stop = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    const mic = micRef.current;
    if (mic) {
      mic.node.disconnect();
      mic.stream.getTracks().forEach((track) => track.stop());
      void mic.ctx.close();
      micRef.current = null;
    }
    const play = playRef.current;
    if (play) {
      // Let a closing line finish before releasing the speaker.
      const wait = Math.max(0, (play.next - play.ctx.currentTime) * 1000);
      window.setTimeout(() => { void play.ctx.close(); }, wait + 200);
      playRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  /** Opens the live session. Resolves false if it could not start (caller falls back). */
  const start = useCallback(async (): Promise<boolean> => {
    setError('');
    setTurns([]);
    doneRef.current = false;
    if (typeof WebSocket === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    setStatus('connecting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      setStatus('failed');
      setError('Microphone access was blocked. Type your answers instead.');
      return false;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const playCtx = new Ctor();
    playRef.current = { ctx: playCtx, next: 0, sources: [] };
    const micCtx = new Ctor();
    const source = micCtx.createMediaStreamSource(stream);
    const node = micCtx.createScriptProcessor(4096, 1, 1);
    const mute = micCtx.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(micCtx.destination);
    micRef.current = { stream, ctx: micCtx, node };

    const opened = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(liveUrl());
      socketRef.current = socket;
      const timeout = window.setTimeout(() => resolve(false), 12000);
      socket.onmessage = (event) => {
        let message: Record<string, unknown>;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        switch (message.type) {
          case 'ready':
            window.clearTimeout(timeout);
            setStatus('listening');
            resolve(true);
            break;
          case 'audio':
            playChunk(String(message.data));
            setStatus('speaking');
            break;
          case 'said':
            appendText('assistant', String(message.text));
            break;
          case 'heard':
            appendText('user', String(message.text));
            break;
          case 'interrupted':
            stopPlayback();
            break;
          case 'turn': {
            const wait = playRef.current ? Math.max(0, (playRef.current.next - playRef.current.ctx.currentTime) * 1000) : 0;
            window.setTimeout(() => {
              if (doneRef.current) { setStatus('ended'); stop(); } else if (socketRef.current) setStatus('listening');
            }, wait + 150);
            break;
          }
          case 'habits':
            if (message.done) doneRef.current = true;
            habitsRef.current({ answers: (message.answers as VibeAnswers) ?? {}, summary: (message.summary as string | null) ?? null, done: Boolean(message.done) });
            break;
          case 'error':
            setError(String(message.message || 'The live voice connection dropped.'));
            break;
          case 'end':
            setStatus('ended');
            break;
          default:
            break;
        }
      };
      socket.onerror = () => { window.clearTimeout(timeout); resolve(false); };
      socket.onclose = () => {
        window.clearTimeout(timeout);
        resolve(false);
        setStatus((current) => (current === 'connecting' ? 'failed' : current === 'failed' ? current : 'ended'));
      };
    });
    if (!opened) {
      stop();
      setStatus('failed');
      return false;
    }
    node.onaudioprocess = (event) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || speakingNow()) return;
      socket.send(JSON.stringify({ type: 'audio', data: toBase64(downsample(event.inputBuffer.getChannelData(0), micCtx.sampleRate)) }));
    };
    return true;
  }, [stop]);

  const sendText = useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !text.trim()) return false;
    stopPlayback();
    appendText('user', text.trim());
    socket.send(JSON.stringify({ type: 'text', text: text.trim() }));
    return true;
  }, []);

  const end = useCallback(() => { stop(); setStatus('ended'); }, [stop]);

  return { status, turns, error, start, sendText, end };
}
