import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';

const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus'
];

export function pickSupportedAudioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return CANDIDATE_MIME_TYPES.find((mime) => MediaRecorder.isTypeSupported(mime));
}

export function extensionForMime(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes('mp4')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('wav')) return 'wav';
  return 'webm';
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function transcribeVoiceBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  const ext = extensionForMime(blob.type || '');
  form.append('audio', blob, `note.${ext}`);
  const response = await api.post('/pg/ai/transcribe', form);
  return String(response.data?.transcript || '').trim();
}

export interface UseVoiceRecorderOptions {
  maxSeconds?: number;
  onRecorded: (blob: Blob) => void | Promise<void>;
  onError?: (reason: 'unsupported' | 'denied') => void;
}

export function useVoiceRecorder({ maxSeconds = 30, onRecorded, onError }: UseVoiceRecorderOptions) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const discardRef = useRef(false);
  const onRecordedRef = useRef(onRecorded);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const clearTimers = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, [clearTimers]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder) {
      if (recorder.state === 'recording') {
        try {
          recorder.stop();
        } catch {
          /* ignore stop errors */
        }
      }
      recorder.stream?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
    }
    setRecording(false);
    setSeconds(0);
  }, [clearTimers]);

  useEffect(() => () => {
    cancel();
  }, [cancel]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onErrorRef.current?.('unsupported');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
      const mimeType = pickSupportedAudioMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        clearTimers();
        if (recorderRef.current === recorder) recorderRef.current = null;
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (!discardRef.current && blob.size > 0) {
          void onRecordedRef.current(blob);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      tickTimerRef.current = window.setInterval(() => {
        setSeconds((value) => value + 1);
      }, 1000);
      stopTimerRef.current = window.setTimeout(() => {
        stop();
      }, maxSeconds * 1000);
      return true;
    } catch {
      onErrorRef.current?.('denied');
      return false;
    }
  }, [clearTimers, maxSeconds, stop]);

  const toggle = useCallback(async () => {
    if (recording) {
      stop();
      return false;
    }
    return start();
  }, [recording, start, stop]);

  return { recording, seconds, start, stop, cancel, toggle };
}
