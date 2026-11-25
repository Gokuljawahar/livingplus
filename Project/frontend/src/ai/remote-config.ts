import { getLivingPlusFirebaseApp } from './firebase';

export type SymbolicInferenceMode =
  | 'PREFER_ON_DEVICE'
  | 'ONLY_ON_DEVICE'
  | 'PREFER_IN_CLOUD'
  | 'ONLY_IN_CLOUD';

export interface HybridRemoteConfigValues {
  triage_inference_mode: SymbolicInferenceMode;
  triage_prompt_version: string;
  vibe_on_device_enabled: boolean;
  cloud_model_name: string;
}

export interface HybridRemoteConfigState {
  values: HybridRemoteConfigValues;
  overrides: Partial<HybridRemoteConfigValues>;
  source: 'default' | 'remote' | 'override';
  lastFetchedAt: number | null;
}

const VALID_MODES = new Set<SymbolicInferenceMode>([
  'PREFER_ON_DEVICE',
  'ONLY_ON_DEVICE',
  'PREFER_IN_CLOUD',
  'ONLY_IN_CLOUD'
]);

export function defaultHybridConfig(): HybridRemoteConfigValues {
  return {
    triage_inference_mode: 'PREFER_ON_DEVICE',
    triage_prompt_version: 'v1',
    vibe_on_device_enabled: true,
    cloud_model_name: import.meta.env.VITE_GEMINI_CLOUD_MODEL?.trim() || 'gemini-2.5-flash'
  };
}

let remoteValues: HybridRemoteConfigValues = defaultHybridConfig();
let overrides: Partial<HybridRemoteConfigValues> = {};
let configSource: 'default' | 'remote' | 'override' = 'default';
let lastFetchedAt: number | null = null;
let fetchPromise: Promise<HybridRemoteConfigState> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeHybridConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Fetches Firebase Remote Config on app start and merges with in-code defaults
 * and any interactive debug-panel overrides.
 */
export async function initHybridRemoteConfig(): Promise<HybridRemoteConfigState> {
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const app = await getLivingPlusFirebaseApp();
      if (!app) return getHybridRemoteConfigState();

      const {
        getRemoteConfig,
        fetchAndActivate,
        getValue,
        isSupported
      } = await import('firebase/remote-config');

      if (!(await isSupported())) return getHybridRemoteConfigState();

      const rc = getRemoteConfig(app);
      rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 10_000 : 3_600_000;
      const defaults = defaultHybridConfig();
      rc.defaultConfig = {
        triage_inference_mode: defaults.triage_inference_mode,
        triage_prompt_version: defaults.triage_prompt_version,
        vibe_on_device_enabled: defaults.vibe_on_device_enabled,
        cloud_model_name: defaults.cloud_model_name
      };

      await fetchAndActivate(rc);

      const rawMode = getValue(rc, 'triage_inference_mode').asString() as SymbolicInferenceMode;
      remoteValues = {
        triage_inference_mode: VALID_MODES.has(rawMode) ? rawMode : defaults.triage_inference_mode,
        triage_prompt_version: getValue(rc, 'triage_prompt_version').asString() || defaults.triage_prompt_version,
        vibe_on_device_enabled: getValue(rc, 'vibe_on_device_enabled').asBoolean(),
        cloud_model_name: getValue(rc, 'cloud_model_name').asString() || defaults.cloud_model_name
      };
      configSource = Object.keys(overrides).length > 0 ? 'override' : 'remote';
      lastFetchedAt = Date.now();
      notify();
    } catch {
      // Offline or unconfigured: keep safe in-code defaults.
    } finally {
      fetchPromise = null;
    }
    return getHybridRemoteConfigState();
  })();

  return fetchPromise;
}

export function getHybridRemoteConfig(): HybridRemoteConfigValues {
  return {
    ...remoteValues,
    ...overrides
  };
}

export function getHybridRemoteConfigState(): HybridRemoteConfigState {
  return {
    values: getHybridRemoteConfig(),
    overrides: { ...overrides },
    source: Object.keys(overrides).length > 0 ? 'override' : configSource,
    lastFetchedAt
  };
}

export function setHybridConfigOverride(next: Partial<HybridRemoteConfigValues>): void {
  overrides = { ...overrides, ...next };
  notify();
}

export function clearHybridConfigOverrides(): void {
  overrides = {};
  notify();
}

export function _resetHybridConfigForTests(): void {
  remoteValues = defaultHybridConfig();
  overrides = {};
  configSource = 'default';
  lastFetchedAt = null;
  fetchPromise = null;
  notify();
}
