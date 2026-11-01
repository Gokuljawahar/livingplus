// Muse Voice transcription for short resident voice notes (report §7 + §12).
// The transcript is treated as ordinary untrusted user input: dates, amounts
// and commitments from voice must still be confirmed before any action.
export const MAX_VOICE_BYTES = 5 * 1024 * 1024;
const VOICE_MODEL = process.env.META_VOICE_MODEL_NAME || 'muse-voice-transcribe-1.0';

export async function transcribeAudio(buffer: Buffer, filename: string, mime: string): Promise<string> {
  if (!buffer?.length || buffer.length > MAX_VOICE_BYTES) throw new Error('AI_VOICE_INVALID_AUDIO');
  if (!/^audio\//.test(mime || '')) throw new Error('AI_VOICE_INVALID_AUDIO');
  const baseUrl = (process.env.META_MODEL_BASE_URL || 'https://api.meta.ai/v1').replace(/\/$/, '');
  const apiKey = process.env.META_MODEL_API_KEY || '';
  if (process.env.ENABLE_AI_ORCHESTRATOR !== 'true' || !apiKey) throw new Error('AI_ORCHESTRATOR_NOT_CONFIGURED');

  const timeoutMs = Math.max(1000, Number(process.env.MODEL_API_TIMEOUT_MS) || 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify({ mode: 'PUSH_TO_TALK', model: VOICE_MODEL, audioEncoding: 'WAV' })], { type: 'application/json' }));
  form.append('audio', new Blob([buffer as unknown as ArrayBuffer], { type: mime }), filename || 'note.wav');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/asr/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal
    });
  } catch (error: any) {
    clearTimeout(timer);
    if (error?.name === 'AbortError') throw new Error('MODEL_API_FAILED: TIMEOUT');
    throw error;
  }
  clearTimeout(timer);
  if (!response.ok) throw new Error(`MODEL_API_FAILED: ${response.status}`);
  const data = (await response.json()) as any;
  const transcript = String(data?.transcript || '').trim();
  if (!transcript) throw new Error('AI_VOICE_EMPTY_TRANSCRIPT');
  return transcript;
}
