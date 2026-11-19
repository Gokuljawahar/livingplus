// Voice-note transcription for short resident voice notes (report §7 + §12),
// using whichever audio-capable model AI_VOICE_MODEL (or AI_MODEL) names.
// The transcript is treated as ordinary untrusted user input: dates, amounts
// and commitments from voice must still be confirmed before any action.
import { HumanMessage } from '@langchain/core/messages';
import { createChatModel, modelFailure, modelTimeoutMs } from './ai-provider.js';

export const MAX_VOICE_BYTES = 5 * 1024 * 1024;

const TRANSCRIBE_PROMPT =
  'Transcribe this voice note exactly as spoken. Reply with only the transcript text, no labels, ' +
  'timestamps or commentary. If there is no intelligible speech, reply with an empty response.';

export async function transcribeAudio(buffer: Buffer, _filename: string, mime: string): Promise<string> {
  if (!buffer?.length || buffer.length > MAX_VOICE_BYTES) throw new Error('AI_VOICE_INVALID_AUDIO');
  if (!/^audio\//.test(mime || '')) throw new Error('AI_VOICE_INVALID_AUDIO');
  const model = await createChatModel('voice');

  const message = new HumanMessage({
    content: [
      { type: 'text', text: TRANSCRIBE_PROMPT },
      // LangChain standard data block: each provider converts it to its own audio format.
      { type: 'audio', source_type: 'base64', mime_type: mime.split(';')[0] || 'audio/wav', data: buffer.toString('base64') }
    ]
  });
  let response;
  try {
    response = await model.invoke([message], { timeout: modelTimeoutMs() });
  } catch (error: any) {
    throw modelFailure(error);
  }
  const content: any = response.content;
  const transcript = (typeof content === 'string'
    ? content
    : Array.isArray(content) ? content.filter((p) => p?.type === 'text').map((p) => p.text).join('') : ''
  ).trim();
  if (!transcript) throw new Error('AI_VOICE_EMPTY_TRANSCRIPT');
  return transcript;
}
