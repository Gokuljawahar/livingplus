// Live voice VibeCheck on the Gemini Live API. The browser streams microphone
// audio over a WebSocket to this server, which relays it to a Gemini Live
// session (Vertex AI has no browser tokens, so the server holds the session)
// and streams Gemini's spoken replies back. Gemini records what it learns with
// a `record_habits` tool call, which we clean and pass to the page as chips.
//
// Guard rails: same-site origin only, at most two live sessions per visitor
// and a fixed number per instance, six minutes per conversation, small
// message frames. Nothing is stored; the person reviews the habits before
// matching. If Live is unavailable, the page falls back to tap-to-talk.
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type, type FunctionDeclaration, type FunctionResponse, type LiveServerMessage, type Session } from '@google/genai';
import { z } from 'zod';
import { cleanVibeAnswers, cleanVibeSummary, createLiveProtocol, VIBE_QUESTIONS, vibeTopicsFor, type LiveServerMessage as RelayServerMessage, type VibeAnswers } from '@livingplus/shared';

const { parseLiveClientMessage } = createLiveProtocol(z);
import { prisma } from '../db/index.js';
import { asSystem, runAsDbUser } from '../db/context.js';
import { aiEnabled, resolveGoogleAuth } from './ai-provider.js';
import { logger } from '../utils/logger.js';
import { briefingActor, briefingFacts, briefingInstruction, OWNER_BRIEFING_PATH, readBriefingPass } from './owner-briefing.js';
import { createVoiceActions, voiceActionDeclarations } from './voice-actions.js';

export const VIBE_LIVE_PATH = '/api/pg/vibecheck/live';
const MAX_SESSION_MS = 6 * 60 * 1000;
const MAX_PER_VISITOR = 2;
const MAX_PER_INSTANCE = Math.max(1, Number(process.env.VIBE_LIVE_MAX_SESSIONS) || 25);

const liveModel = () => (process.env.VIBE_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio').trim();
const liveLocation = () => (process.env.VIBE_LIVE_LOCATION || 'us-central1').trim();

export const vibeLiveEnabled = (): boolean => aiEnabled() && process.env.VIBE_LIVE_ENABLED !== 'false';

/** The record_habits tool, offering only the habits that matter for this PG. */
function recordHabitsFor(skip: string[]): FunctionDeclaration {
  const habitProperties = Object.fromEntries(VIBE_QUESTIONS.filter((question) => !skip.includes(question.id)).map((question) => [question.id, {
    type: Type.NUMBER,
    description: `${question.question} 0 = ${question.options[0].label}, 1 = ${question.options[1].label}, 2 = ${question.options[2].label}. Leave out if unknown.`
  }]));
  return {
    name: 'record_habits',
    description: 'Save what you have picked up about how they live (everything you can infer from the whole conversation) and a short English summary. Call after they share something new.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        answers: { type: Type.OBJECT, properties: habitProperties },
        summary: { type: Type.STRING, description: 'One or two short sentences about how they live, in English' },
        done: { type: Type.BOOLEAN, description: 'True once you have a good feel for their sleep, tidiness and noise and the chat has reached a natural pause, or after about eight exchanges' }
      },
      required: ['answers', 'summary', 'done']
    }
  };
}

function liveInstruction(topics: { skip: string[]; facts: string[] }): string {
  const skipped = VIBE_QUESTIONS.filter((question) => topics.skip.includes(question.id)).map((question) => question.question.replace(/\?$/, '').toLowerCase());
  return [
    "You are the user's PG buddy: a friendly, easy-going senior who knows PG life well, chatting with someone who is about to move into one. Behind the scenes you are getting to know how they live, so they can be matched with roommates they will get along with.",
    "Talk like a friend, not an interviewer. Never run through a list of questions, never say words like habits, questionnaire, score or profile, and never ask two questions at once.",
    "Open casually by asking whether they are studying or working these days, then follow their lead: react to what they say with genuine interest, a little warmth or humour, and ask natural follow-ups about their day, work or study, weekends, hobbies and how they like their space. Never assume where they are from, that they are new to Chennai, or why they chose it, and don't ask why they like the city; build only on what they actually tell you.",
    "Work out their lifestyle from what they tell you rather than asking directly. 'Exams are coming, I'm up most nights' tells you about sleep and noise; 'I hate a messy room' tells you about tidiness; 'my friends come over to play FIFA' tells you about guests and noise.",
    "The things you are quietly learning: sleep time, wake time, tidiness, noise they make or tolerate, how often friends visit, study or work schedule, shared kitchen use, and preferred room temperature. Sleep, tidiness and noise matter most; if one of those is still unclear late in the chat, bring it up casually in passing, never as a direct survey question.",
    "Keep each turn short and spoken: one or two sentences. Use the language and style they use (Tamil, Hindi, English, Tanglish or Hinglish) and switch when they switch.",
    "Never ask about or note religion, caste, diet, gender, health, politics or family background, even if they bring it up; just move on kindly.",
    "After each thing they share that tells you something new, call record_habits with everything you can infer so far (leave out what you don't know) and a short English summary. Never call it before they have said anything.",
    "After roughly six to eight exchanges, or once you have a good feel for sleep, tidiness and noise and the conversation reaches a natural pause, set done to true and wrap up warmly in one line, saying their routine is noted and will be shared with the PG owner so they can allot the best-fitting room.",
    ...(topics.facts.length ? [`About the PG they are looking at: ${topics.facts.join(' ')}`] : []),
    ...(skipped.length ? [`These don't apply at this PG, so never bring them up: ${skipped.join('; ')}.`] : [])
  ].join(' ');
}

/** Cleans one record_habits call and merges it into what is already known. */
export function applyHabitCall(known: VibeAnswers, args: unknown, skip: string[] = []): { answers: VibeAnswers; summary: string | null; done: boolean; missing: string[] } {
  const input = (args && typeof args === 'object' ? args : {}) as { answers?: unknown; summary?: unknown; done?: unknown };
  const found = Object.fromEntries(Object.entries(cleanVibeAnswers(input.answers) ?? {}).filter(([id]) => !skip.includes(id)));
  const answers = { ...known, ...found };
  const missing = VIBE_QUESTIONS.filter((question) => !skip.includes(question.id) && answers[question.id] === undefined).map((question) => question.id);
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

/** Attaches the live VibeCheck and owner briefing WebSocket endpoints to the HTTP server. */
export function attachVibeLive(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  // Connection limits are tracked in memory per Cloud Run instance (not shared across instances).
  const perVisitor = new Map<string, number>();
  let open = 0;

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url || '').split('?')[0];
    if (path !== VIBE_LIVE_PATH && path !== OWNER_BRIEFING_PATH) return;
    const visitor = visitorOf(req);
    const refuse = (status: string) => { socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    if (!vibeLiveEnabled()) return refuse('503 Service Unavailable');
    if (!originAllowed(req)) return refuse('403 Forbidden');
    if (open >= MAX_PER_INSTANCE || (perVisitor.get(visitor) ?? 0) >= MAX_PER_VISITOR) return refuse('429 Too Many Requests');
    const ownerId = path === OWNER_BRIEFING_PATH ? readBriefingPass(new URL(req.url || '/', 'http://local').searchParams.get('pass')) : null;
    if (path === OWNER_BRIEFING_PATH && !ownerId) return refuse('401 Unauthorized');
    wss.handleUpgrade(req, socket, head, (client) => {
      open += 1;
      perVisitor.set(visitor, (perVisitor.get(visitor) ?? 0) + 1);
      client.once('close', () => {
        open -= 1;
        const left = (perVisitor.get(visitor) ?? 1) - 1;
        if (left > 0) perVisitor.set(visitor, left); else perVisitor.delete(visitor);
      });
      if (ownerId) {
        void runBriefing(client, ownerId);
        return;
      }
      const propertyId = new URL(req.url || '/', 'http://local').searchParams.get('propertyId') || '';
      void runSession(client, /^[A-Za-z0-9-]{8,64}$/.test(propertyId) ? propertyId : null);
    });
  });
}

/** Public listing data for the PG the person is looking at, if any. */
async function loadPlace(propertyId: string | null) {
  if (!propertyId) return null;
  return asSystem('VibeCheck live reads a public PG listing', () => prisma.pGProperty.findFirst({
    where: { id: propertyId, status: 'ACTIVE' },
    select: { name: true, locality: true, amenities: true, rooms: { where: { status: 'ACTIVE' }, select: { hasAc: true, foodIncluded: true, foodCharge: true } } }
  })).then((place) => place && {
    ...place,
    amenities: Array.isArray(place.amenities) ? place.amenities.filter((item): item is string => typeof item === 'string') : []
  }).catch(() => null);
}

/** What a live voice session needs: its instruction, opening line and optional tools. */
interface LiveSessionSpec {
  label: string;
  instruction: string;
  kickoff: string;
  tools?: FunctionDeclaration[];
  /** Answers one tool call; `heard` counts the person's utterances (speech or typed) so far. */
  onToolCall?: (name: string, args: unknown, heard: number) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

/**
 * Relays one browser WebSocket to one Gemini Live session: mic audio and typed
 * text in; Gemini's voice, both transcripts and turn markers out. Ends after
 * MAX_SESSION_MS or when either side closes.
 */
async function relayLive(client: WebSocket, spec: LiveSessionSpec): Promise<void> {
  const send = (message: RelayServerMessage) => { if (client.readyState === client.OPEN) client.send(JSON.stringify(message)); };
  let live: Session | null = null;
  // Utterances from the person: a new speech transcript run or a typed message.
  let heardCount = 0;
  let lastHeardAt = 0;
  let inSpeechRun = false;
  let replyStarted = false;
  const timer = setTimeout(() => { send({ type: 'end', reason: 'time' }); client.close(); }, MAX_SESSION_MS);
  client.once('close', () => { clearTimeout(timer); try { live?.close(); } catch { /* already closed */ } });

  const onMessage = (message: LiveServerMessage) => {
    const content = message.serverContent;
    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        // Response latency: from the last thing the person said to the first spoken audio back.
        if (!replyStarted && lastHeardAt) {
          send({ type: 'latency', ms: Math.max(0, Date.now() - lastHeardAt) });
          lastHeardAt = 0;
        }
        inSpeechRun = false;
        replyStarted = true;
        send({ type: 'audio', data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000' });
      }
    }
    if (content?.inputTranscription?.text) {
      if (!inSpeechRun) { heardCount += 1; inSpeechRun = true; }
      lastHeardAt = Date.now();
      replyStarted = false;
      send({ type: 'heard', text: content.inputTranscription.text });
    }
    if (content?.outputTranscription?.text) { inSpeechRun = false; send({ type: 'said', text: content.outputTranscription.text }); }
    if (content?.interrupted) { replyStarted = false; inSpeechRun = false; send({ type: 'interrupted' }); }
    if (content?.turnComplete) { replyStarted = false; inSpeechRun = false; send({ type: 'turn' }); }
    const calls = message.toolCall?.functionCalls ?? [];
    if (calls.length && live) {
      const session = live;
      void Promise.all(calls.map(async (call): Promise<FunctionResponse> => {
        const base = { ...(call.id ? { id: call.id } : {}), name: call.name || 'unknown' };
        try {
          const response = spec.onToolCall ? await spec.onToolCall(call.name || '', call.args, heardCount) : { error: 'no tools here' };
          return { ...base, response };
        } catch (error: any) {
          logger.warn({ err: error?.message || String(error) }, `${spec.label} tool call failed`);
          return { ...base, response: { error: 'That did not work.' } };
        }
      })).then((functionResponses) => { try { session.sendToolResponse({ functionResponses }); } catch { /* session closed */ } });
    }
  };

  try {
    const ai = await liveClient();
    live = await ai.live.connect({
      model: liveModel(),
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: spec.instruction }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        ...(spec.tools?.length ? { tools: [{ functionDeclarations: spec.tools }] } : {})
      },
      callbacks: {
        onmessage: onMessage,
        onerror: (error: any) => { logger.warn({ err: error?.message || String(error) }, `${spec.label} live session error`); send({ type: 'error', message: 'The live voice connection dropped.' }); client.close(); },
        onclose: () => client.close()
      }
    });
  } catch (error: any) {
    logger.warn({ err: error?.message || String(error) }, `${spec.label} live session could not start`);
    send({ type: 'error', message: 'Live voice is not available right now.' });
    client.close();
    return;
  }
  if (client.readyState !== client.OPEN) { live.close(); return; }
  send({ type: 'ready' });
  live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: spec.kickoff }] }], turnComplete: true });

  client.on('message', (raw) => {
    const message = parseLiveClientMessage(String(raw));
    if (!message || !live) return;
    if (message.type === 'audio') {
      live.sendRealtimeInput({ audio: { data: message.data, mimeType: 'audio/pcm;rate=16000' } });
    } else if (message.type === 'text') {
      heardCount += 1;
      lastHeardAt = Date.now();
      replyStarted = false;
      live.sendClientContent({ turns: [{ role: 'user', parts: [{ text: message.text }] }], turnComplete: true });
    } else if (message.type === 'pause') {
      live.sendRealtimeInput({ audioStreamEnd: true });
    }
  });
}

/** VibeCheck: the PG buddy conversation, recording habits as it goes. */
async function runSession(client: WebSocket, propertyId: string | null): Promise<void> {
  const topics = vibeTopicsFor(await loadPlace(propertyId));
  let known: VibeAnswers = {};
  const send = (message: RelayServerMessage) => { if (client.readyState === client.OPEN) client.send(JSON.stringify(message)); };
  await relayLive(client, {
    label: 'VibeCheck',
    instruction: liveInstruction(topics),
    kickoff: '(The person just joined the call. Say hi like a friend in one short line and casually ask whether they are studying or working these days.)',
    tools: [recordHabitsFor(topics.skip)],
    onToolCall: (name, args, heard) => {
      if (name !== 'record_habits') return { error: 'unknown tool' };
      if (heard < 1) return { saved: false, note: 'Wait for their answer before recording habits.' };
      const result = applyHabitCall(known, args, topics.skip);
      known = result.answers;
      send({ type: 'habits', ...result });
      return { saved: true, still_missing: result.missing };
    }
  });
}

/** Owner voice session: a spoken briefing, then voice-to-action with a spoken read-back before any change. */
async function runBriefing(client: WebSocket, userId: string): Promise<void> {
  const context = await briefingFacts(userId).catch(() => null);
  if (!context) {
    if (client.readyState === client.OPEN) client.send(JSON.stringify({ type: 'error', message: 'There is nothing to brief you on yet.' }));
    client.close();
    return;
  }
  const send = (message: RelayServerMessage) => { if (client.readyState === client.OPEN) client.send(JSON.stringify(message)); };
  const identity = await briefingActor(userId).catch(() => null);
  const actions = identity
    ? createVoiceActions({
      actor: identity.actor,
      runAs: (fn) => runAsDbUser({ userId, role: identity.actor.role, tokenPropertyId: identity.actor.propertyIds.length === 1 ? identity.actor.propertyIds[0]! : null }, fn),
      notify: (event) => send({ type: 'action', ...event }),
      onHandoff: (event) => send({ type: 'handoff', ...event })
    })
    : null;
  await relayLive(client, {
    label: 'Owner briefing',
    instruction: briefingInstruction(context.facts, Boolean(actions)),
    kickoff: `(The owner, ${context.firstName}, just tapped "Brief me". Greet them by first name in a few words and give the briefing.)`,
    ...(actions && identity ? { tools: voiceActionDeclarations(identity.actor.role), onToolCall: (name: string, args: unknown, heard: number) => actions.callTool(name, args, heard) } : {})
  });
}
