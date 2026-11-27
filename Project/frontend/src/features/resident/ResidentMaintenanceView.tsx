import { useCallback, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Cloud,
  CloudOff,
  Loader2,
  Lock,
  Mic,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  WifiOff,
  Wrench
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useOnDeviceAI } from '../../ai/device-model';
import { downscaleImageToJpeg, type DownscaledImage } from '../../ai/image';
import {
  queueOfflineTicket,
  useOfflineTicketOutbox,
  type QueuedMaintenanceTicket
} from '../../ai/outbox';
import { Button, Card, EmptyState, StatusPill } from '../../components/ui';
import { usePlatformCatalog } from '../../hooks/usePlatformCatalog';
import { apiErrorMessage } from '../../utils/api-error';
import { transcribeVoiceBlob, useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { shortDate } from '../../utils/money';
import { residentTicketSchema, type ResidentTicketForm } from '../../validation/forms';
import type { MaintenanceTicket, Stay } from './types';

const MAX_VOICE_RECORD_SECONDS = 30;

const EMPTY_TICKET: ResidentTicketForm = {
  tenantId: '',
  title: '',
  description: '',
  category: 'OTHER',
  priority: 'NORMAL'
};

interface TriageBannerState {
  source: 'on-device' | 'cloud';
  latencyMs: number;
  safetyRisk: boolean;
  residentTip: string;
}

interface Props {
  stays: Stay[];
  tickets: MaintenanceTicket[];
  onChanged: () => Promise<unknown>;
}

function isOfflineOrNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (typeof error === 'object' && error !== null) {
    const err = error as { code?: string; message?: string; response?: unknown };
    if (!err.response && (err.code === 'ERR_NETWORK' || /network/i.test(String(err.message || '')))) {
      return true;
    }
  }
  return false;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function uploadPhotoBlob(blob: Blob): Promise<string | undefined> {
  try {
    const upload = new FormData();
    upload.append('image', blob, `issue-${Date.now()}.jpg`);
    const res = await api.post('/upload-s3', upload, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data?.fileKey;
  } catch {
    return undefined;
  }
}

export default function ResidentMaintenanceView({ stays, tickets, onChanged }: Props) {
  const { catalog } = usePlatformCatalog();
  const [ticketFormFor, setTicketFormFor] = useState('');
  const [snappedImage, setSnappedImage] = useState<DownscaledImage | null>(null);
  const [triageNote, setTriageNote] = useState('');
  const [triaging, setTriaging] = useState(false);
  const [triageBanner, setTriageBanner] = useState<TriageBannerState | null>(null);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { status: deviceAiStatus, downloadProgress, enable: enableDeviceAi } = useOnDeviceAI();

  const ticketFormApi = useForm<ResidentTicketForm>({
    resolver: zodResolver(residentTicketSchema),
    defaultValues: EMPTY_TICKET
  });
  const submittingTicket = ticketFormApi.formState.isSubmitting;
  const tenantIds = useMemo(() => stays.map((s) => s.id), [stays]);

  const submitQueuedTicketToApi = useCallback(async (queued: QueuedMaintenanceTicket) => {
    let imageUrl: string | undefined;
    if (queued.photoDataUrl) {
      const blob = await dataUrlToBlob(queued.photoDataUrl);
      imageUrl = (await uploadPhotoBlob(blob)) || queued.photoDataUrl;
    }
    await api.post('/pg/tenant/maintenance', {
      tenantId: queued.tenantId,
      category: queued.category,
      aiPriority: queued.priority,
      safetyRisk: Boolean(queued.safetyRisk),
      title: queued.title,
      description: queued.description,
      ...(imageUrl ? { imageUrl } : {})
    });
  }, []);

  const {
    queuedTickets,
    isOnline,
    flushing,
    reloadOutbox,
    flushOutbox
  } = useOfflineTicketOutbox(tenantIds, submitQueuedTicketToApi, onChanged);

  const resetFormState = () => {
    setTranscribingVoice(false);
    setTicketFormFor('');
    setSnappedImage(null);
    setTriageNote('');
    setTriageBanner(null);
    ticketFormApi.reset(EMPTY_TICKET);
  };

  const runHybridTriage = async (opts: { image?: DownscaledImage | null; note?: string }) => {
    const activeNote = (opts.note ?? triageNote).trim();
    const activeImage = opts.image ?? snappedImage;
    if (!activeImage && !activeNote) {
      toast.error('Snap a photo or type a quick note first.');
      return;
    }

    setTriaging(true);
    try {
      const { triageMaintenanceIssue } = await import('../../ai/ai');
      const res = await triageMaintenanceIssue({
        note: activeNote || undefined,
        imageBase64: activeImage?.base64Data,
        imageMimeType: activeImage?.mimeType
      });

      ticketFormApi.setValue('category', res.data.category, { shouldDirty: true });
      ticketFormApi.setValue('priority', res.data.priority, { shouldDirty: true });
      ticketFormApi.setValue('title', res.data.title, { shouldDirty: true, shouldValidate: true });
      ticketFormApi.setValue('description', res.data.description, { shouldDirty: true, shouldValidate: true });

      setTriageBanner({
        source: res.source,
        latencyMs: res.latencyMs,
        safetyRisk: res.data.safetyRisk,
        residentTip: res.data.residentTip
      });
    } catch (error) {
      toast.error(
        apiErrorMessage(
          error,
          'AI triage is unavailable right now — please fill the form manually below.'
        )
      );
    } finally {
      setTriaging(false);
    }
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const downscaled = await downscaleImageToJpeg(file, 1024, 0.82);
      setSnappedImage(downscaled);
      await runHybridTriage({ image: downscaled });
    } catch {
      toast.error('Could not process that photo. Please try a JPEG or PNG.');
    }
  };

  const voice = useVoiceRecorder({
    maxSeconds: MAX_VOICE_RECORD_SECONDS,
    onRecorded: async (blob) => {
      setTranscribingVoice(true);
      try {
        const transcript = await transcribeVoiceBlob(blob);
        if (!transcript) {
          toast.error('No speech was recognized — try speaking closer to the mic or type below.');
          return;
        }
        const nextNote = triageNote.trim() ? `${triageNote.trim()} ${transcript}` : transcript;
        setTriageNote(nextNote);
        await runHybridTriage({ note: nextNote });
      } catch (error) {
        toast.error(apiErrorMessage(error, 'Voice note could not be transcribed right now.'));
      } finally {
        setTranscribingVoice(false);
      }
    },
    onError: (reason) => {
      toast.error(
        reason === 'unsupported'
          ? 'Voice recording is not supported in this browser.'
          : 'Microphone access was blocked. Allow microphone access and try again.'
      );
    }
  });

  const openTicketForm = (stayId: string) => {
    voice.cancel();
    setTranscribingVoice(false);
    setTicketFormFor(stayId);
    setSnappedImage(null);
    setTriageNote('');
    setTriageBanner(null);
    ticketFormApi.reset({ ...EMPTY_TICKET, tenantId: stayId });
  };

  const cancelForm = () => {
    voice.cancel();
    resetFormState();
  };

  const handleVoiceToggle = async () => {
    if (voice.recording) {
      voice.stop();
      return;
    }
    if (!isOnline) {
      toast.error('Voice transcription needs internet — snap a photo or type a note to triage offline.');
      return;
    }
    await voice.start();
  };

  const submitTicket = ticketFormApi.handleSubmit(async (form) => {
    const effectivePriority = triageBanner?.safetyRisk ? 'URGENT' : form.priority || 'NORMAL';

    const saveToOfflineOutbox = async () => {
      await queueOfflineTicket({
        tenantId: form.tenantId,
        category: form.category,
        priority: effectivePriority,
        title: form.title,
        description: form.description,
        photoDataUrl: snappedImage?.dataUrl || null,
        triageSource: triageBanner?.source || null,
        safetyRisk: Boolean(triageBanner?.safetyRisk)
      });
      await reloadOutbox();
      toast.success("Queued, will send when you're back online");
      resetFormState();
    };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await saveToOfflineOutbox();
      return;
    }

    try {
      let imageUrl: string | undefined;
      if (snappedImage) {
        imageUrl = (await uploadPhotoBlob(snappedImage.blob)) || snappedImage.dataUrl;
      }
      await api.post('/pg/tenant/maintenance', {
        tenantId: form.tenantId,
        category: form.category,
        title: form.title,
        description: form.description,
        aiPriority: effectivePriority,
        safetyRisk: Boolean(triageBanner?.safetyRisk),
        ...(imageUrl ? { imageUrl } : {})
      });
      toast.success('Report sent. The warden will update its status here.');
      resetFormState();
      await onChanged();
    } catch (error) {
      if (isOfflineOrNetworkError(error)) {
        await saveToOfflineOutbox();
        return;
      }
      toast.error(apiErrorMessage(error, 'Could not send maintenance request'));
    }
  });

  return (
    <div className="space-y-6">
      {!isOnline && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-amber-500/40 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-950"
        >
          <span className="flex items-center gap-2 font-semibold">
            <WifiOff className="h-4 w-4 text-amber-700" />
            Weak or offline signal detected. On-device AI triage and the offline outbox stay ready.
          </span>
        </div>
      )}

      {!stays.length && <EmptyState title="No stays found for this number." />}

      {stays.map((stay) => {
        const stayQueued = queuedTickets.filter((q) => q.tenantId === stay.id);
        const stayTickets = tickets.filter((ticket) => ticket.tenantId === stay.id);

        return (
          <Card key={stay.id} className="p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-4">
              <h2 className="text-lg font-bold text-navy-900">{stay.property.name}</h2>
              <div className="flex items-center gap-2">
                <StatusPill status={stay.status} />
                {stay.bed && (
                  <span className="text-xs font-semibold text-muted">
                    Room {stay.bed.room.roomNumber}, {stay.bed.label}
                  </span>
                )}
              </div>
            </div>

            <section className="pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-bold text-ink">
                  <Wrench className="h-4 w-4 text-navy-900" /> Your requests
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {stayQueued.length > 0 && isOnline && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={flushing}
                      onClick={() => void flushOutbox()}
                    >
                      {flushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Sync {stayQueued.length} queued
                    </Button>
                  )}
                  {['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && ticketFormFor !== stay.id && (
                    <Button size="sm" onClick={() => openTicketForm(stay.id)}>
                      <Plus className="h-3.5 w-3.5" /> Report an issue
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-canvas">
                {stayQueued.map((queued) => (
                  <article
                    key={queued.id}
                    className="bg-amber-50/40 p-4 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-ink">{queued.title}</p>
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                        <CloudOff className="h-3 w-3" /> Queued, will send when you&apos;re back online
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-muted">
                      {queued.category.charAt(0) + queued.category.slice(1).toLowerCase()} · Priority {queued.priority} · Saved {shortDate(queued.createdAt)}
                      {queued.triageSource ? ` · ${queued.triageSource === 'on-device' ? 'Analysed on your device 🔒' : 'Analysed in the cloud ☁️'}` : ''}
                    </p>
                    {queued.photoDataUrl && (
                      <img
                        src={queued.photoDataUrl}
                        alt="Queued maintenance issue"
                        className="mt-2 h-24 w-32 rounded-[var(--radius-field)] border border-hairline object-cover"
                      />
                    )}
                    <p className="mt-2 whitespace-pre-wrap rounded-[var(--radius-field)] border border-hairline bg-canvas p-2.5 text-xs leading-relaxed text-ink">
                      {queued.description}
                    </p>
                  </article>
                ))}

                {stayTickets.map((ticket) => (
                  <article key={ticket.id} className="p-4 transition-colors hover:bg-surface/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-ink">{ticket.title}</p>
                      <div className="flex items-center gap-2">
                        {ticket.priority === 'URGENT' && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                            URGENT
                          </span>
                        )}
                        <StatusPill status={ticket.status} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs font-medium text-muted">
                      {ticket.category.charAt(0) + ticket.category.slice(1).toLowerCase()} · Reported {shortDate(ticket.createdAt)}
                    </p>
                    {ticket.imageUrl && (
                      ticket.imageUrl.startsWith('data:') || ticket.imageUrl.startsWith('http') || ticket.imageUrl.startsWith('/') ? (
                        <img
                          src={ticket.imageUrl}
                          alt="Submitted issue"
                          className="mt-2 h-24 w-32 rounded-[var(--radius-field)] border border-hairline object-cover"
                        />
                      ) : (
                        <p className="mt-1.5 text-xs font-medium text-muted">Photo attached</p>
                      )
                    )}
                    <p className="mt-2 whitespace-pre-wrap rounded-[var(--radius-field)] border border-hairline bg-surface p-2.5 text-xs leading-relaxed text-ink">
                      {ticket.description}
                    </p>
                  </article>
                ))}

                {stayQueued.length === 0 && stayTickets.length === 0 && (
                  <p className="p-6 text-center text-xs font-medium text-muted">
                    No maintenance requests submitted yet. Everything running smoothly!
                  </p>
                )}
              </div>

              {ticketFormFor === stay.id && (
                <form
                  onSubmit={submitTicket}
                  className="mt-5 space-y-4 rounded-[var(--radius-card)] border border-hairline bg-surface p-5"
                >
                  <div className="rounded-[var(--radius-card)] border border-navy-900/15 bg-canvas p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="flex items-center gap-1.5 text-xs font-bold text-navy-900">
                          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                          Snap, Speak &amp; Triage (works offline on Chrome)
                        </h4>
                        <p className="mt-0.5 text-[11px] text-muted">
                          Snap a photo, record a voice note (Tamil, Hindi, Tanglish, English), or type a quick note to auto-fill category, priority, and safety advice.
                        </p>
                      </div>
                      {deviceAiStatus === 'downloadable' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void enableDeviceAi()}
                        >
                          Enable offline AI
                        </Button>
                      )}
                      {deviceAiStatus === 'downloading' && (
                        <span className="text-[11px] font-semibold text-navy-900">
                          Downloading Gemini Nano… {downloadProgress}%
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        aria-label="Snap a photo"
                        onChange={handlePhotoSelected}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={triaging || voice.recording || transcribingVoice}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        {snappedImage ? 'Retake photo' : 'Snap a photo'}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={voice.recording ? 'Stop voice note' : 'Record voice note'}
                        disabled={triaging || transcribingVoice}
                        onClick={() => void handleVoiceToggle()}
                      >
                        {transcribingVoice ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : voice.recording ? (
                          <Square className="h-3.5 w-3.5 text-negative" />
                        ) : (
                          <Mic className="h-3.5 w-3.5" />
                        )}
                        {transcribingVoice ? 'Transcribing…' : voice.recording ? 'Stop' : 'Voice note'}
                      </Button>

                      <div className="flex flex-1 gap-2">
                        <input
                          type="text"
                          value={triageNote}
                          onChange={(e) => setTriageNote(e.target.value)}
                          placeholder='Or describe in a few words, e.g. "sparking switch near geyser"'
                          className="min-w-0 flex-1 rounded-[var(--radius-field)] border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink outline-none focus:border-navy-900"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={triaging || voice.recording || transcribingVoice || (!snappedImage && !triageNote.trim())}
                          onClick={() => void runHybridTriage({})}
                        >
                          {triaging ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          {triaging ? 'Triaging…' : 'Triage'}
                        </Button>
                      </div>
                    </div>

                    {voice.recording && (
                      <p role="status" className="mt-2 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-900">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" />
                        Recording voice note… speak in Tamil, Hindi, Tanglish or English, then tap Stop (max 30s)
                      </p>
                    )}

                    {snappedImage && (
                      <div className="mt-3 flex items-center gap-3 rounded-[var(--radius-field)] border border-hairline bg-surface p-2">
                        <img
                          src={snappedImage.dataUrl}
                          alt="Maintenance issue preview"
                          className="h-16 w-16 rounded object-cover"
                        />
                        <div className="min-w-0 flex-1 text-[11px] text-muted">
                          <p className="font-semibold text-ink">Photo ready ({snappedImage.width}×{snappedImage.height} JPEG)</p>
                          <p>Downscaled on device before AI triage.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSnappedImage(null)}
                          aria-label="Remove photo"
                          className="rounded p-1 text-muted hover:bg-canvas hover:text-negative"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {triageBanner && (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 font-bold text-navy-900">
                            {triageBanner.source === 'on-device' ? (
                              <>
                                <Lock className="h-3 w-3 text-emerald-700" />
                                Analysed on your device 🔒
                              </>
                            ) : (
                              <>
                                <Cloud className="h-3 w-3 text-sky-700" />
                                Analysed in the cloud ☁️
                              </>
                            )}
                            <span className="font-medium text-muted">· {triageBanner.latencyMs} ms</span>
                          </span>
                          <span className="text-muted">Review fields below before sending.</span>
                        </div>

                        {triageBanner.safetyRisk ? (
                          <div
                            role="alert"
                            className="flex items-start gap-2.5 rounded-[var(--radius-field)] border border-red-300 bg-red-50 p-3 text-xs text-red-950"
                          >
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                            <div>
                              <p className="font-bold">Safety risk flagged — Priority set to URGENT</p>
                              <p className="mt-0.5 text-red-900">{triageBanner.residentTip}</p>
                            </div>
                          </div>
                        ) : (
                          triageBanner.residentTip && (
                            <p className="rounded-[var(--radius-field)] border border-hairline bg-surface px-3 py-2 text-[11px] font-medium text-ink">
                              Tip: {triageBanner.residentTip}
                            </p>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-ink">New issue details</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-ink">
                      Issue category
                      <select
                        {...ticketFormApi.register('category')}
                        className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-navy-900"
                      >
                        {(catalog.maintenanceCategories.length
                          ? catalog.maintenanceCategories
                          : [
                              { value: 'PLUMBING', label: 'Plumbing (Tap, Pipe, Flush, Leakage)' },
                              { value: 'ELECTRICAL', label: 'Electrical (Fan, Light, Switch, Geyser)' },
                              { value: 'APPLIANCE', label: 'Appliance (AC, Washing Machine, Fridge)' },
                              { value: 'CLEANING', label: 'Cleaning & Housekeeping' },
                              { value: 'SAFETY', label: 'Safety & Locks' },
                              { value: 'PEST', label: 'Pest Control' },
                              { value: 'OTHER', label: 'Other Query' }
                            ]
                        ).map((cat) => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-ink">
                      Priority
                      <select
                        {...ticketFormApi.register('priority')}
                        disabled={Boolean(triageBanner?.safetyRisk)}
                        className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-navy-900 disabled:opacity-80"
                      >
                        {(catalog.ticketPriorities.length
                          ? catalog.ticketPriorities
                          : [
                              { value: 'LOW', label: 'Low' },
                              { value: 'NORMAL', label: 'Normal' },
                              { value: 'HIGH', label: 'High' },
                              { value: 'URGENT', label: 'Urgent' }
                            ]
                        ).map((prio) => (
                          <option key={prio.value} value={prio.value}>{prio.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-navy-900">
                    What needs fixing?
                    <input
                      required
                      maxLength={120}
                      {...ticketFormApi.register('title')}
                      placeholder="e.g. Geyser not heating in 2nd floor bathroom"
                      className="mt-1 block w-full rounded-[var(--radius-field)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-navy-900"
                    />
                  </label>
                  <label className="block text-sm font-medium text-navy-900">
                    Where is it, and what&apos;s wrong?
                    <textarea
                      required
                      maxLength={2000}
                      rows={3}
                      {...ticketFormApi.register('description')}
                      placeholder="Please describe the problem and exact location so staff can fix it quickly…"
                      className="mt-1 block w-full resize-y rounded-[var(--radius-field)] border border-hairline bg-canvas px-3 py-2 text-xs font-medium text-ink outline-none focus:border-navy-900"
                    />
                  </label>
                  {Object.values(ticketFormApi.formState.errors)[0]?.message && (
                    <p role="alert" className="text-xs font-medium text-negative">
                      {Object.values(ticketFormApi.formState.errors)[0]?.message}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="submit" size="sm" disabled={submittingTicket}>
                      {submittingTicket ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : !isOnline ? (
                        <CloudOff className="h-3.5 w-3.5" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {!isOnline ? 'Queue offline report' : 'Send report'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={cancelForm}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {!['ACTIVE', 'NOTICE_PERIOD'].includes(stay.status) && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  Maintenance requests are enabled during an active stay.
                </p>
              )}
            </section>
          </Card>
        );
      })}
    </div>
  );
}
