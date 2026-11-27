// Live voice relay hook: requests native 16 kHz AudioContext + WebRTC AEC/NS/AGC,
// streams full-duplex binary 16 kHz PCM16 frames to the @google/adk Gemini Live
// relay so native server-side VAD handles barge-in cleanly, and plays 24 kHz
// spoken replies with a 40 ms jitter buffer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { createLiveProtocol, type LiveClientMessage, type VibeAnswers } from '@livingplus/shared';

const { parseLiveServerMessage } = createLiveProtocol(z);

export type LiveStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended' | 'failed';
export interface LiveTurn { role: 'assistant' | 'user'; text: string }
export interface LiveHabits { answers: VibeAnswers; summary: string | null; done: boolean }
export interface LiveAction { phase: 'proposed' | 'done' | 'cancelled' | 'failed'; summary: string }
export interface LiveHandoff { target: 'rent' | 'bookings' | 'maintenance'; reason: string }
export interface UseVibeLiveOptions { onActionDone?: (action: LiveAction) => void }

const IN_RATE = 16000;
const OUT_RATE = 24000;
const JITTER_BUFFER_SEC = 0.04;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Float samples at `rate` -> anti-aliased box-averaged 16 kHz little-endian PCM16. */
export function downsample(input: Float32Array, rate: number): Uint8Array {
  if (rate <= IN_RATE || Math.abs(rate / IN_RATE - 1) < 0.01) {
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return new Uint8Array(pcm.buffer);
  }
  const ratio = rate / IN_RATE;
  const length = Math.floor(input.length / ratio);
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j] ?? 0;
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return new Uint8Array(pcm.buffer);
}

function withBinaryParam(url: string): string {
  if (/[?&]binary=1\b/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}binary=1`;
}

export function liveUrl(propertyId?: string): string {
  const params = new URLSearchParams({ binary: '1' });
  if (propertyId) params.set('propertyId', propertyId);
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/pg/vibecheck/live?${params.toString()}`;
}

export function useVibeLive(onHabits: (habits: LiveHabits) => void, options?: UseVibeLiveOptions) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [error, setError] = useState('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [actions, setActions] = useState<LiveAction[]>([]);
  const [handoff, setHandoff] = useState<LiveHandoff | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const micRef = useRef<{ stream: MediaStream; ctx: AudioContext; node: AudioWorkletNode } | null>(null);
  const playRef = useRef<{ ctx: AudioContext; next: number; sources: AudioBufferSourceNode[] } | null>(null);
  const habitsRef = useRef(onHabits);
  const optionsRef = useRef(options);
  useEffect(() => { habitsRef.current = onHabits; }, [onHabits]);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const doneRef = useRef(false);

  const appendText = (role: LiveTurn['role'], text: string) => {
    setTurns((current) => {
      const last = current[current.length - 1];
      if (last && last.role === role) return [...current.slice(0, -1), { role, text: `${last.text}${text}` }];
      return [...current, { role, text: text.trimStart() }];
    });
  };

  const stopPlayback = useCallback(() => {
    const play = playRef.current;
    if (!play) return;
    play.sources.forEach((source) => { try { source.stop(); } catch { /* already stopped */ } });
    play.sources = [];
    play.next = play.ctx.currentTime;
  }, []);

  const playPcm16 = (pcmBuffer: ArrayBuffer) => {
    const play = playRef.current;
    if (!play) return;
    if (play.ctx.state === 'suspended') void play.ctx.resume();
    const samples = new Int16Array(pcmBuffer, 0, Math.floor(pcmBuffer.byteLength / 2));
    if (!samples.length) return;
    const buffer = play.ctx.createBuffer(1, samples.length, OUT_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) channel[i] = (samples[i] ?? 0) / 0x8000;
    const source = play.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(play.ctx.destination);
    const startAt = Math.max(play.ctx.currentTime + JITTER_BUFFER_SEC, play.next);
    source.start(startAt);
    play.next = startAt + buffer.duration;
    play.sources.push(source);
    source.onended = () => { if (playRef.current) playRef.current.sources = playRef.current.sources.filter((item) => item !== source); };
  };

  const stop = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    const mic = micRef.current;
    if (mic) {
      mic.node.port.onmessage = null;
      mic.node.port.close();
      mic.node.disconnect();
      mic.stream.getTracks().forEach((track) => track.stop());
      void mic.ctx.close();
      micRef.current = null;
    }
    const play = playRef.current;
    if (play) {
      const wait = Math.max(0, (play.next - play.ctx.currentTime) * 1000);
      window.setTimeout(() => { void play.ctx.close(); }, wait + 200);
      playRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  /** Opens the live session. Resolves false if it could not start (caller falls back). */
  const start = useCallback(async (propertyId?: string, url?: string): Promise<boolean> => {
    setError('');
    setTurns([]);
    setLatencyMs(null);
    setActions([]);
    setHandoff(null);
    doneRef.current = false;
    if (typeof WebSocket === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    setStatus('connecting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
    } catch {
      setStatus('failed');
      setError('Microphone access was blocked. Allow microphone access in your browser and try again.');
      return false;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const playCtx = new Ctor();
    void playCtx.resume();
    playRef.current = { ctx: playCtx, next: 0, sources: [] };
    let micCtx: AudioContext;
    try {
      micCtx = new Ctor({ sampleRate: IN_RATE });
    } catch {
      micCtx = new Ctor();
    }
    if (micCtx.state === 'suspended') void micCtx.resume();
    if (!micCtx.audioWorklet) {
      stream.getTracks().forEach((track) => track.stop());
      void micCtx.close();
      void playCtx.close();
      playRef.current = null;
      setStatus('failed');
      return false;
    }
    let node: AudioWorkletNode;
    try {
      await micCtx.audioWorklet.addModule('/pcm-capture-worklet.js');
      const source = micCtx.createMediaStreamSource(stream);
      node = new AudioWorkletNode(micCtx, 'pcm-capture-processor', {
        processorOptions: { targetSampleRate: IN_RATE }
      });
      source.connect(node);
      micRef.current = { stream, ctx: micCtx, node };
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      void micCtx.close();
      void playCtx.close();
      playRef.current = null;
      setStatus('failed');
      return false;
    }

    const opened = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(withBinaryParam(url ?? liveUrl(propertyId)));
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;
      const timeout = window.setTimeout(() => resolve(false), 12000);
      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playPcm16(event.data);
          setStatus('speaking');
          return;
        }
        if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buf) => {
            playPcm16(buf);
            setStatus('speaking');
          });
          return;
        }
        const message = parseLiveServerMessage(String(event.data));
        if (!message) return;
        switch (message.type) {
          case 'ready':
            window.clearTimeout(timeout);
            setStatus('listening');
            resolve(true);
            break;
          case 'audio': {
            const bytes = Uint8Array.from(atob(message.data), (char) => char.charCodeAt(0));
            playPcm16(bytes.buffer);
            setStatus('speaking');
            break;
          }
          case 'said':
            appendText('assistant', message.text);
            break;
          case 'heard':
            appendText('user', message.text);
            break;
          case 'interrupted':
            stopPlayback();
            setStatus('listening');
            break;
          case 'latency':
            setLatencyMs(Math.round(message.ms));
            break;
          case 'action': {
            const nextAction: LiveAction = { phase: message.phase, summary: message.summary };
            setActions((current) => [...current, nextAction]);
            if (message.phase === 'done') optionsRef.current?.onActionDone?.(nextAction);
            break;
          }
          case 'handoff':
            setHandoff({ target: message.target, reason: message.reason });
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
            habitsRef.current({ answers: message.answers as VibeAnswers, summary: message.summary, done: message.done });
            break;
          case 'error':
            setError(message.message || 'The live voice connection dropped.');
            break;
          case 'end':
            setStatus('ended');
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
    node.port.onmessage = (event: MessageEvent<ArrayBuffer | Float32Array>) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (event.data instanceof ArrayBuffer) {
        socket.send(event.data);
      } else {
        const bytes = downsample(event.data, micCtx.sampleRate);
        socket.send(bytes.buffer as ArrayBuffer);
      }
    };
    return true;
  }, [stop, stopPlayback]);

  const sendText = useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !text.trim()) return false;
    stopPlayback();
    appendText('user', text.trim());
    const frame: LiveClientMessage = { type: 'text', text: text.trim() };
    socket.send(JSON.stringify(frame));
    return true;
  }, [stopPlayback]);

  const interrupt = useCallback(() => {
    stopPlayback();
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      const frame: LiveClientMessage = { type: 'pause' };
      socket.send(JSON.stringify(frame));
      setStatus('listening');
    }
  }, [stopPlayback]);

  const end = useCallback(() => { stop(); setStatus('ended'); }, [stop]);

  return { status, turns, error, latencyMs, actions, handoff, start, sendText, interrupt, end };
}
