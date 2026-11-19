import { createChatModel, modelStatus, parseImageDataUrl } from '../services/ai-provider.js';
import { runChat } from '../services/ai-orchestrator.js';
import { transcribeAudio } from '../services/ai-voice.js';
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;
const hits = new Map();
function rateLimited(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > RATE_MAX;
}
export const getAiStatus = async (_req, res) => {
    const status = await modelStatus();
    res.json({ enabled: status.enabled, configured: status.configured, provider: status.provider, model: status.model });
};
export const postChat = async (req, res) => {
    const user = req.user || {};
    const key = user.userId ? String(user.userId) : `ip:${req.ip}`;
    if (rateLimited(key))
        return res.status(429).json({ message: 'Too many AI requests. Slow down and retry.' });
    const message = String(req.body.message || '').trim().slice(0, 2000);
    if (!message && !req.body.confirmationId && !req.body.cancelConfirmationId)
        return res.status(400).json({ message: 'A message is required' });
    let imageDataUrl;
    if (req.body.imageDataUrl) {
        try {
            imageDataUrl = parseImageDataUrl(req.body.imageDataUrl);
        }
        catch {
            return res.status(400).json({ message: 'Attached image must be a JPEG, PNG or WebP under 4MB' });
        }
    }
    let model;
    try {
        model = await createChatModel('chat');
    }
    catch (error) {
        if (String(error?.message || '').startsWith('AI_MODEL_INIT_FAILED'))
            console.error('PG AI model init failed:', String(error?.message || error));
        return res.status(503).json({
            message: 'The AI assistant is not connected. Set ENABLE_AI_ORCHESTRATOR=true and AI_MODEL (for example google:gemini-3.8-flash) with that provider\'s credentials to enable it.'
        });
    }
    try {
        const result = await runChat(req, model, {
            message,
            imageDataUrl,
            sessionId: req.body.sessionId ? String(req.body.sessionId) : undefined,
            confirmationId: req.body.confirmationId ? String(req.body.confirmationId) : undefined,
            cancelConfirmationId: req.body.cancelConfirmationId ? String(req.body.cancelConfirmationId) : undefined
        });
        res.json(result);
    }
    catch (error) {
        if (String(error?.message || '').startsWith('MODEL_API_FAILED')) {
            console.error('PG AI model call failed:', String(error?.message || error));
            return res.status(502).json({ message: 'The AI service failed. Your data was not changed. Please retry.' });
        }
        console.error('PG AI chat error:', error);
        res.status(500).json({ message: 'The assistant could not answer right now' });
    }
};
export const postTranscribe = async (req, res) => {
    const user = req.user || {};
    const key = user.userId ? String(user.userId) : `ip:${req.ip}`;
    if (rateLimited(`voice:${key}`))
        return res.status(429).json({ message: 'Too many voice requests. Slow down and retry.' });
    const file = req.file;
    if (!file?.buffer?.length)
        return res.status(400).json({ message: 'An audio recording is required' });
    try {
        const transcript = await transcribeAudio(file.buffer, file.originalname || 'note.wav', file.mimetype);
        res.json({ transcript });
    }
    catch (error) {
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
        console.error('PG AI transcribe error:', error);
        res.status(500).json({ message: 'The recording could not be transcribed right now' });
    }
};
//# sourceMappingURL=ai.controller.js.map