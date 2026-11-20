// Live voice VibeCheck on the Gemini Live API. The browser streams microphone
// audio over a WebSocket to this server, which relays it to a Gemini Live
// session (Vertex AI has no browser tokens, so the server holds the session)
// and streams Gemini's spoken replies back. Gemini records what it learns with
// a `record_habits` tool call, which we clean and pass to the page as chips.
//
// Guard rails: same-site origin only, at most two live sessions per visitor
// and a fixed number per instance, four minutes per conversation, small
// message frames. Nothing is stored; the person reviews the habits before
// matching. If Live is unavailable, the page falls back to tap-to-talk.
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type, type FunctionDeclaration, type FunctionResponse, type LiveServerMessage, type Session } from '@google/genai';
import { cleanVibeAnswers, cleanVibeSummary, VIBE_QUESTIONS, type VibeAnswers } from '@livingplus/shared';
import { aiEnabled, resolveGoogleAuth } from './ai-provider.js';
import { logger } from '../utils/logger.js';

export const VIBE_LIVE_PATH = '/api/pg/vibecheck/live';
const MAX_SESSION_MS = 4 * 60 * 1000;
const MAX_PER_VISITOR = 2;
const MAX_PER_INSTANCE = Math.max(1, Number(process.env.VIBE_LIVE_MAX_SESSIONS) || 25);

const liveModel = () => (process.env.VIBE_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio').trim();
const liveLocation = () => (process.env.VIBE_LIVE_LOCATION || 'us-central1').trim();

export const vibeLiveEnabled = (): boolean => aiEnabled() && process.env.VIBE_LIVE_ENABLED !== 'false';

const habitProperties = Object.fromEntries(VIBE_QUESTIONS.map((question) => [question.id, {
  type: Type.NUMBER,
  description: `${question.question} 0 = ${question.options[0].label}, 1 = ${question.options[1].label}, 2 = ${question.options[2].label}. Leave out if unknown.`
}]));

const recordHabits: FunctionDeclaration = {
  name: 'record_habits',
  description: 'Save the lifestyle habits learned so far (every habit you can infer from the whole conversation) and a short English summary. Call after every answer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      answers: { type: Type.OBJECT, properties: habitProperties },
      summary: { type: Type.STRING, description: 'One or two short sentences about their habits, in English' },
      done: { type: Type.BOOLEAN, description: 'True once sleep, tidiness and noise are known and nothing else important is missing, or after five questions' }
    },
    required: ['answers', 'summary', 'done']
  }
};

function liveInstruction(): string {
  return [
    'You are VibeCheck, a warm voice host that helps someone moving into paying-guest housing in India find compatible roommates.',
    'Have a short spoken conversation, about five questions, to learn their sleep time, wake time, tidiness, noise, guests, study or work schedule, kitchen use and room temperature.',
    'Ask one question at a time, most important first: sleep, tidiness, noise. Keep every turn short: a few words acknowledging their answer, then one question. Never list options unless they seem unsure.',
    'Speak in the language they use (Tamil, Hindi, English or a mix) and switch if they switch.',
    'Start by speaking: greet them in one short line and ask about sleep. Only after they answer, call record_habits with all habits you can infer so far and a short English summary; never call it before their first answer.',
    'Never ask about or record religion, caste, diet, gender, health, politics or family background, even if they mention it.',
    'When done, thank them in one line and say you will now show rooms that match.'
  ].join(' ');
}

/** Cleans one record_habits call and merges it into what is already known. */
export function applyHabitCall(known: VibeAnswers, args: unknown): { answers: VibeAnswers; summary: string | null; done: boolean; missing: string[] } {
  const input = (args && typeof args === 'object' ? args : {}) as { answers?: unknown; summary?: unknown; done?: unknown };
  const found = cleanVibeAnswers(input.answers) ?? {};
  const answers = { ...known, ...found };
  const missing = VIBE_QUESTIONS.filter((question) => answers[question.id] === undefined).map((question) => question.id);
  return { answers, summary: cleanVibeSummary(typeof input.summary === 'string' ? input.summary : null), done: input.done === true || missing.length === 0, missing };
}

/** Same-site browsers only (any origin in development). */
export function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0]!.trim();
    return new URL(origin).host === (forwarded || req.headers.host);
  } catch {
    return false;
  }
}

async function liveClient(): Promise<GoogleGenAI> {
  const auth = await resolveGoogleAuth();
  return auth.vertexai
    ? new GoogleGenAI({ vertexai: true, project: auth.project!, location: liveLocation() })
    : new GoogleGenAI({ apiKey: auth.apiKey! });
}

const visitorOf = (req: IncomingMessage) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0]!.trim();

/** Attaches the live VibeCheck WebSocket endpoint to the HTTP server. */
export function attachVibeLive(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const perVisitor = new Map<string, number>();
  let open = 0;

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url || '').split('?')[0];
    if (path !== VIBE_LIVE_PATH) return;
    const visitor = visitorOf(req);
    const refuse = (status: string) => { socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    if (!vibeLiveEnabled()) return refuse('503 Service Unavailable');
    if (!originAllowed(req)) return refuse('403 Forbidden');
    if (open >= MAX_PER_INSTANCE || (perVisitor.get(visitor) ?? 0) >= MAX_PER_VISITOR) return refuse('429 Too Many Requests');
    wss.handleUpgrade(req, socket, head, (client) => {
      open += 1;
      perVisitor.set(visitor, (perVisitor.get(visitor) ?? 0) + 1);
      client.once('close', () => {
        open -= 1;
        const left = (perVisitor.get(visitor) ?? 1) - 1;
        if (left > 0) perVisitor.set(visitor, left); else perVisitor.delete(visitor);
      });
      void runSession(client);
    });
  });
}

async function runSession(client: WebSocket): Promise<void> {
  const send = (message: Record<string, unknown>) => { if (client.readyState === client.OPEN) client.send(JSON.stringify(message)); };
  let known: VibeAnswers = {};
  let live: Session | null = null;
  // Habits only count once the person has said or typed something.
  let heardFromUser = false;
  const timer = setTimeout(() => { send({ type: 'end', reason: 'time' }); client.close(); }, MAX_SESSION_MS);
  client.once('close', () => { clearTimeout(timer); try { live?.close(); } catch { /* already closed */ } });

  const onMessage = (message: LiveServerMessage) => {
    const content = message.serverContent;
    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) send({ type: 'audio', data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000' });
    }
    if (content?.inputTranscription?.text) send({ type: 'heard', text: content.inputTranscription.text });
    if (content?.outputTranscription?.text) send({ type: 'said', text: content.outputTranscription.text });
    if (content?.interrupted) send({ type: 'interrupted' });
    if (content?.turnComplete) send({ type: 'turn' });
    const calls = message.toolCall?.functionCalls ?? [];
    if (calls.length && live) {
      const responses: FunctionResponse[] = calls.map((call) => {
        const base = { ...(call.id ? { id: call.id } : {}), name: call.name || 'unknown' };
        if (call.name !== 'record_habits') return { ...base, response: { error: 'unknown tool' } };
        if (!heardFromUser) return { ...base, response: { saved: false, note: 'Wait for their answer before recording habits.' } };
        const result = applyHabitCall(known, call.args);
        known = result.answers;
        send({ type: 'habits', ...result });
        return { ...base, response: { saved: true, still_missing: result.missing } };
      });
      live.sendToolResponse({ functionResponses: responses });
    }
  };

  try {
    const ai = await liveClient();
    live = await ai.live.connect({
      model: liveModel(),
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: liveInstruction() }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [{ functionDeclarations: [recordHabits] }]
      },
      callbacks: {
        onmessage: onMessage,
        onerror: (error: any) => { logger.warn({ err: error?.message || String(error) }, 'VibeCheck live session error'); send({ type: 'error', message: 'The live voice connection dropped.' }); client.close(); },
        onclose: () => client.close()
      }
    });
  } catch (error: any) {
    logger.warn({ err: error?.message || String(error) }, 'VibeCheck live session could not start');
    send({ type: 'error', message: 'Live voice is not available right now.' });
    client.close();
    return;
  }
  if (client.readyState !== client.OPEN) { live.close(); return; }
  send({ type: 'ready' });
  live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Start now: greet me in one short line and ask your first question.' }] }], turnComplete: true });

  client.on('message', (raw) => {
    let message: any;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (!live) return;
    if (message?.type === 'audio' && typeof message.data === 'string' && message.data.length < 200_000 && /^[A-Za-z0-9+/=]+$/.test(message.data)) {
      heardFromUser = true;
      live.sendRealtimeInput({ audio: { data: message.data, mimeType: 'audio/pcm;rate=16000' } });
    } else if (message?.type === 'text' && typeof message.text === 'string' && message.text.trim()) {
      heardFromUser = true;
      live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: message.text.trim().slice(0, 1000) }] }], turnComplete: true });
    } else if (message?.type === 'pause') {
      live.sendRealtimeInput({ audioStreamEnd: true });
    }
  });
}
