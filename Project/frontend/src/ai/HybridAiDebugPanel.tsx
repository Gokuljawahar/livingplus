import { useEffect, useState } from 'react';
import { Cpu, RefreshCw, Sparkles, X } from 'lucide-react';
import { useOnDeviceAI } from './device-model';
import {
  clearHybridConfigOverrides,
  getHybridRemoteConfigState,
  setHybridConfigOverride,
  subscribeHybridConfig,
  type SymbolicInferenceMode
} from './remote-config';

const MODES: SymbolicInferenceMode[] = [
  'PREFER_ON_DEVICE',
  'ONLY_ON_DEVICE',
  'PREFER_IN_CLOUD',
  'ONLY_IN_CLOUD'
];

export default function HybridAiDebugPanel() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(true);
  const [configState, setConfigState] = useState(getHybridRemoteConfigState);
  const { status, downloadProgress, lastInference, enable, refreshStatus } = useOnDeviceAI();

  useEffect(() => {
    const syncVisibility = () => {
      const params = new URLSearchParams(window.location.search);
      const isDebug =
        params.get('debug') === 'ai' ||
        window.localStorage?.getItem('lp_hybrid_debug') === 'true';
      setVisible(isDebug);
    };
    syncVisibility();
    window.addEventListener('popstate', syncVisibility);
    const unsub = subscribeHybridConfig(() => setConfigState(getHybridRemoteConfigState()));
    return () => {
      window.removeEventListener('popstate', syncVisibility);
      unsub();
    };
  }, []);

  if (!visible) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 rounded-full border border-navy-900 bg-navy-900 px-3.5 py-2 text-xs font-bold text-white shadow-lg"
      >
        <Cpu className="h-3.5 w-3.5 text-amber-400" />
        Hybrid AI debug
      </button>
    );
  }

  return (
    <aside
      aria-label="Hybrid AI debug panel"
      className="fixed bottom-4 right-4 z-[9999] w-[340px] max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-navy-900/20 bg-canvas p-4 text-xs shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-hairline pb-2.5">
        <div className="flex items-center gap-2 font-bold text-navy-900">
          <Sparkles className="h-4 w-4 text-amber-600" />
          Hybrid AI debug
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Minimize Hybrid AI debug"
          className="rounded p-1 text-muted hover:bg-surface hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-muted">On-device Gemini Nano</span>
          <span className="rounded-full bg-surface px-2 py-0.5 font-bold uppercase text-ink">
            {status}{status === 'downloading' ? ` (${downloadProgress}%)` : ''}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void enable()}
            className="rounded-[var(--radius-field)] bg-navy-900 px-2.5 py-1.5 font-semibold text-white hover:opacity-90"
          >
            Initialize on-device AI
          </button>
          <button
            type="button"
            onClick={() => void refreshStatus()}
            className="inline-flex items-center gap-1 rounded-[var(--radius-field)] border border-hairline bg-surface px-2.5 py-1.5 font-semibold text-ink"
          >
            <RefreshCw className="h-3 w-3" /> Check
          </button>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-muted">Triage InferenceMode override</span>
            <span className="text-[11px] font-medium text-muted">src: {configState.source}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {MODES.map((m) => {
              const active = configState.values.triage_inference_mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setHybridConfigOverride({ triage_inference_mode: m })}
                  className={`rounded-[var(--radius-field)] border px-2 py-1 text-left text-[11px] font-semibold transition-colors ${
                    active
                      ? 'border-navy-900 bg-navy-900 text-white'
                      : 'border-hairline bg-surface text-ink hover:border-navy-900/40'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          {configState.source === 'override' && (
            <button
              type="button"
              onClick={() => clearHybridConfigOverrides()}
              className="mt-1 text-[11px] font-semibold text-amber-700 underline"
            >
              Reset to Remote Config
            </button>
          )}
        </div>

        <div className="rounded-[var(--radius-field)] border border-hairline bg-surface p-2.5 text-[11px]">
          <p className="font-bold text-ink">Remote Config</p>
          <p className="mt-1 text-muted">prompt_version: <span className="font-semibold text-ink">{configState.values.triage_prompt_version}</span></p>
          <p className="text-muted">vibe_on_device: <span className="font-semibold text-ink">{String(configState.values.vibe_on_device_enabled)}</span></p>
          <p className="text-muted">cloud_model: <span className="font-semibold text-ink">{configState.values.cloud_model_name}</span></p>
        </div>

        <div className="rounded-[var(--radius-field)] border border-hairline bg-surface p-2.5 text-[11px]">
          <p className="font-bold text-ink">Last Inference</p>
          {lastInference ? (
            <p className="mt-1 text-ink">
              {lastInference.feature}: <span className="font-bold">{lastInference.source === 'on-device' ? 'On-device 🔒' : 'Cloud ☁️'}</span> · {lastInference.latencyMs} ms ({lastInference.mode})
            </p>
          ) : (
            <p className="mt-1 text-muted">No hybrid AI call run in this session yet.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
