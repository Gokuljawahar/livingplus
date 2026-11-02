import type { Request, Response } from 'express';
import { MetaModelProvider, parseImageDataUrl } from '../services/ai-provider.js';
import { runChat } from '../services/ai-orchestrator.js';
import { transcribeAudio } from '../services/ai-voice.js';

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_MAX;
}

export const getAiStatus = async (req: Request, res: Response): Promise<any> => {
  const provider = new MetaModelProvider();
  res.json({
    enabled: process.env.ENABLE_AI_ORCHESTRATOR === 'true',
    configured: provider.configured,
    model: process.env.META_MODEL_NAME || 'muse-spark-1.3'
  });
};

export const postChat = async (req: Request, res: Response): Promise<any> => {
  const user = (req as any).user || {};
  const key = user.userId ? String(user.userId) : `ip:${req.ip}`;
  if (rateLimited(key)) return res.status(429).json({ message: 'Too many AI requests. Slow down and retry.' });

  const message = String(req.body.message || '').trim().slice(0, 2000);
  if (!message && !req.body.confirmationId && !req.body.cancelConfirmationId) return res.status(400).json({ message: 'A message is required' });

  let imageDataUrl: string | undefined;
  if (req.body.imageDataUrl) {
    try {
      imageDataUrl = parseImageDataUrl(req.body.imageDataUrl);
    } catch {
      return res.status(400).json({ message: 'Attached image must be a JPEG, PNG or WebP under 4MB' });
    }
  }

  const provider = new MetaModelProvider();
  if (!provider.configured) {
    return res.status(503).json({
      message: 'The AI assistant is not connected. Add META_MODEL_API_KEY and set ENABLE_AI_ORCHESTRATOR=true to enable it.'
    });
  }

  try {
    const result = await runChat(req, provider, {
      message,
      imageDataUrl,
      sessionId: req.body.sessionId ? String(req.body.sessionId) : undefined,
      confirmationId: req.body.confirmationId ? String(req.body.confirmationId) : undefined,
      cancelConfirmationId: req.body.cancelConfirmationId ? String(req.body.cancelConfirmationId) : undefined
    });
    res.json(result);
  } catch (error: any) {
    if (String(error?.message || '').startsWith('MODEL_API_FAILED')) {
      console.error('PG AI model call failed:', String(error?.message || error));
      return res.status(502).json({ message: 'The AI service failed. Your data was not changed. Please retry.' });
    }
    console.error('PG AI chat error:', error);
    res.status(500).json({ message: 'The assistant could not answer right now' });
  }
};

export const postTranscribe = async (req: Request, res: Response): Promise<any> => {
  const user = (req as any).user || {};
  const key = user.userId ? String(user.userId) : `ip:${req.ip}`;
  if (rateLimited(`voice:${key}`)) return res.status(429).json({ message: 'Too many voice requests. Slow down and retry.' });

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
    if (code.startsWith('MODEL_API_FAILED')) {
      return res.status(502).json({ message: 'The transcription service failed. Nothing was changed. Please retry.' });
    }
    console.error('PG AI transcribe error:', error);
    res.status(500).json({ message: 'The recording could not be transcribed right now' });
  }
};
