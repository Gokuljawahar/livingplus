// Voice-note transcription for short resident voice notes (report §7 + §12),
// using whichever audio-capable model AI_VOICE_MODEL (or AI_MODEL) names.
// The transcript is treated as ordinary untrusted user input: dates, amounts
// and commitments from voice must still be confirmed before any action.
import { createChatModel, modelFailure, modelTimeoutMs } from './ai-provider.js';

export const MAX_VOICE_BYTES = 5 * 1024 * 1024;

const TRANSCRIBE_PROMPT =
  'Transcribe this voice note exactly as spoken. Reply with only the transcript text, no labels, ' +
  'timestamps or commentary. If there is no intelligible speech, reply with an empty response.';

export async function transcribeAudio(buffer: Buffer, _filename: string, mime: string): Promise<string> {
  if (!buffer?.length || buffer.length > MAX_VOICE_BYTES) throw new Error('AI_VOICE_INVALID_AUDIO');
  if (!/^audio\//.test(mime || '')) throw new Error('AI_VOICE_INVALID_AUDIO');
  const model = await createChatModel('voice');

  let step;
  try {
    step = await model.generate({
      system: '',
      contents: [{
        role: 'user',
        parts: [
          { text: TRANSCRIBE_PROMPT },
          { inlineData: { mimeType: mime.split(';')[0] || 'audio/wav', data: buffer.toString('base64') } }
        ]
      }],
      tools: [],
      timeoutMs: modelTimeoutMs()
    });
  } catch (error: any) {
    throw modelFailure(error);
  }
  const transcript = step.text.trim();
  if (!transcript) throw new Error('AI_VOICE_EMPTY_TRANSCRIPT');
  return transcript;
}
