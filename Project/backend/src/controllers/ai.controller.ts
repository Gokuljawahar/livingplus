import type { Request, Response } from 'express';
import { createChatModel, modelStatus, parseImageDataUrl } from '../services/ai-provider.js';
import { runChat } from '../services/ai-orchestrator.js';
import { transcribeAudio } from '../services/ai-voice.js';
import { logger } from '../utils/logger.js';
import { INVALID_REQUEST, parseBody } from '../utils/validate.js';
import { aiChatBody } from '../validation/request.schemas.js';

export const getAiStatus = async (_req: Request, res: Response): Promise<any> => {
  const status = await modelStatus();
  res.json({ enabled: status.enabled, configured: status.configured, provider: status.provider, model: status.model });
};

export const postChat = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(aiChatBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const message = String(input.message || '').trim().slice(0, 2000);
  if (!message && !input.confirmationId && !input.cancelConfirmationId) return res.status(400).json({ message: 'A message is required' });

  let imageDataUrl: string | undefined;
  if (input.imageDataUrl) {
    try {
      imageDataUrl = parseImageDataUrl(input.imageDataUrl);
    } catch {
      return res.status(400).json({ message: 'Attached image must be a JPEG, PNG or WebP under 4MB' });
    }
  }

  let model;
  try {
    model = await createChatModel('chat');
  } catch (error: any) {
    if (String(error?.message || '').startsWith('AI_MODEL_INIT_FAILED')) logger.error({ err: error }, 'PG AI model init failed');
    return res.status(503).json({
      message: 'The AI assistant is not connected. Set ENABLE_AI_ORCHESTRATOR=true and AI_MODEL (for example google:gemini-4-hydrogen) with Google credentials (GOOGLE_API_KEY, or Vertex AI) to enable it.'
    });
  }

  try {
    const result = await runChat(req, model, {
      message,
      imageDataUrl,
      language: input.language ? String(input.language) : undefined,
      sessionId: input.sessionId ? String(input.sessionId) : undefined,
      confirmationId: input.confirmationId ? String(input.confirmationId) : undefined,
      cancelConfirmationId: input.cancelConfirmationId ? String(input.cancelConfirmationId) : undefined
    });
    res.json(result);
  } catch (error: any) {
    if (String(error?.message || '').startsWith('MODEL_API_FAILED')) {
      logger.error({ err: error }, 'PG AI model call failed');
      return res.status(502).json({ message: 'The assistant couldn\'t answer just now. Nothing was changed. Please try again.' });
    }
    logger.error({ err: error }, 'PG AI chat error');
    res.status(500).json({ message: 'The assistant could not answer right now' });
  }
};

export const postTranscribe = async (req: Request, res: Response): Promise<any> => {

  const file = (req as any).file;
  if (!file?.buffer?.length) return res.status(400).json({ message: 'An audio recording is required' });

  try {
    const transcript = await transcribeAudio(file.buffer, file.originalname || 'note.wav', file.mimetype);
    res.json({ transcript });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'AI_VOICE_INVALID_AUDIO' || code === 'AI_VOICE_EMPTY_TRANSCRIPT') {
      return res.status(400).json({ message: 'That recording could not be transcribed. Send a short WAV voice note and retry.' });
    }
    if (code === 'AI_ORCHESTRATOR_NOT_CONFIGURED' || code.startsWith('AI_MODEL_INIT_FAILED')) {
      return res.status(503).json({ message: 'Voice notes are not connected. Configure an audio-capable AI_MODEL or AI_VOICE_MODEL to enable them.' });
    }
    if (code.startsWith('MODEL_API_FAILED')) {
      return res.status(502).json({ message: 'The transcription service failed. Nothing was changed. Please retry.' });
    }
    logger.error({ err: error }, 'PG AI transcribe error');
    res.status(500).json({ message: 'The recording could not be transcribed right now' });
  }
};
