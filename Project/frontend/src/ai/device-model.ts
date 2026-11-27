import { useCallback, useEffect, useState } from 'react';
import type { SymbolicInferenceMode } from './remote-config';

export type DeviceModelStatus = 'unavailable' | 'downloadable' | 'downloading' | 'ready';

export interface InferenceTelemetry {
  feature: string;
  source: 'on-device' | 'cloud';
  latencyMs: number;
  mode: SymbolicInferenceMode;
  timestamp: number;
}

interface DeviceModelStore {
  status: DeviceModelStatus;
  downloadProgress: number;
  lastInference: InferenceTelemetry | null;
}

const store: DeviceModelStore = {
  status: 'unavailable',
  downloadProgress: 0,
  lastInference: null
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function normalizePromptApiAvailability(raw: unknown): DeviceModelStatus {
  const val = String(raw || '').toLowerCase();
  if (val === 'readily' || val === 'available') return 'ready';
  if (val === 'after-download' || val === 'downloadable') return 'downloadable';
  if (val === 'downloading') return 'downloading';
  return 'unavailable';
}

/**
 * Checks whether Chrome's built-in Gemini Nano Prompt API is available,
 * downloadable after user gesture, or unsupported in this browser.
 */
export async function checkOnDeviceModelStatus(): Promise<DeviceModelStatus> {
  if (typeof globalThis === 'undefined') {
    store.status = 'unavailable';
    notify();
    return store.status;
  }

  const g = globalThis as unknown as {
    LanguageModel?: { availability?: (opts?: unknown) => Promise<string> };
    ai?: { languageModel?: { capabilities?: () => Promise<{ available?: string }> } };
  };

  try {
    if (typeof g.LanguageModel?.availability === 'function') {
      const avail = await g.LanguageModel.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }]
      });
      store.status = normalizePromptApiAvailability(avail);
      if (store.status === 'ready') store.downloadProgress = 100;
      notify();
      return store.status;
    }

    if (typeof g.ai?.languageModel?.capabilities === 'function') {
      const caps = await g.ai.languageModel.capabilities();
      store.status = normalizePromptApiAvailability(caps?.available);
      if (store.status === 'ready') store.downloadProgress = 100;
      notify();
      return store.status;
    }
  } catch {
    store.status = 'unavailable';
  }

  store.status = 'unavailable';
  notify();
  return store.status;
}

export function getDeviceModelSnapshot(): DeviceModelStore {
  return { ...store };
}

export function recordInference(telemetry: Omit<InferenceTelemetry, 'timestamp'>): void {
  store.lastInference = {
    ...telemetry,
    timestamp: Date.now()
  };
  if (telemetry.source === 'on-device') {
    store.status = 'ready';
    store.downloadProgress = 100;
  }
  notify();
}

export function subscribeDeviceModel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Must be called inside a user gesture handler (e.g. button click).
 * Uses Firebase AI Logic's `GenerativeModel.initializeDeviceModel` to trigger
 * downloading Gemini Nano on-device if not yet cached.
 */
export async function enableOnDeviceAI(onProgress?: (pct: number) => void): Promise<DeviceModelStatus> {
  store.status = 'downloading';
  store.downloadProgress = 0;
  notify();

  try {
    const { getHybridModel } = await import('./ai');
    const model = await getHybridModel('PREFER_ON_DEVICE', { multimodal: true });
    if (model) {
      await model.initializeDeviceModel((progressValue) => {
        const pct = Math.max(0, Math.min(100, Math.round(progressValue * 100)));
        store.status = pct >= 100 ? 'ready' : 'downloading';
        store.downloadProgress = pct;
        notify();
        onProgress?.(pct);
      });
      store.status = 'ready';
      store.downloadProgress = 100;
      notify();
      return store.status;
    }

    // Fallback when Firebase config isn't present in local demo mode: try Chrome Prompt API directly.
    const g = globalThis as unknown as {
      LanguageModel?: {
        create?: (opts?: {
          monitor?: (m: { addEventListener: (ev: string, cb: (e: { loaded: number }) => void) => void }) => void;
        }) => Promise<{ destroy?: () => void }>;
      };
    };
    if (typeof g.LanguageModel?.create === 'function') {
      const session = await g.LanguageModel.create({
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', (e) => {
            const pct = Math.max(0, Math.min(100, Math.round(Number(e.loaded || 0) * 100)));
            store.status = pct >= 100 ? 'ready' : 'downloading';
            store.downloadProgress = pct;
            notify();
            onProgress?.(pct);
          });
        }
      });
      session?.destroy?.();
      store.status = 'ready';
      store.downloadProgress = 100;
      notify();
      return store.status;
    }
  } catch {
    // Re-check actual availability rather than leaving stale downloading state
  }

  return checkOnDeviceModelStatus();
}

export function useOnDeviceAI() {
  const [snapshot, setSnapshot] = useState<DeviceModelStore>(getDeviceModelSnapshot);

  useEffect(() => {
    const unsub = subscribeDeviceModel(() => {
      setSnapshot(getDeviceModelSnapshot());
    });
    void checkOnDeviceModelStatus();
    return unsub;
  }, []);

  const enable = useCallback(async () => enableOnDeviceAI(), []);
  const refreshStatus = useCallback(async () => checkOnDeviceModelStatus(), []);

  return {
    status: snapshot.status,
    downloadProgress: snapshot.downloadProgress,
    lastInference: snapshot.lastInference,
    enable,
    refreshStatus
  };
}

export function _resetDeviceModelForTests(): void {
  store.status = 'unavailable';
  store.downloadProgress = 0;
  store.lastInference = null;
  notify();
}
