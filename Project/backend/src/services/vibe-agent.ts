// VibeCheck AI: two structured Gemini calls (plain SDK, no agent loop needed).
//
// 1. `vibe-profiler` turns a free-text description of someone's routine, in any
//    language ("I study till 2 am and play guitar on weekends"), into the eight
//    lifestyle habits plus a short habits-only summary, and asks one follow-up
//    question when something important is missing. People review the result
//    before it is used.
// 2. `vibe-matcher` judges each room with a free bed. The prompt carries each
//    room's deterministic baseline score, and its score may move at most
//    ±MAX_AI_SHIFT points from that baseline (enforced here), so the AI adds
//    judgment and explanations but cannot invent a fit the habits contradict.
//
// Anything the model cannot do (AI switched off, no usable model, timeout,
// malformed answer) falls back to the deterministic scorer, so VibeCheck never
// breaks.
//
// Model: VIBECHECK_AI_MODEL wins when set, else the "google:" model from
// AI_MODEL. Credentials as in ai-provider: Vertex AI via GOOGLE_GENAI_USE_ENTERPRISE=true
// with GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION and Application Default
// Credentials (Cloud Run), or GOOGLE_API_KEY.
//
// Privacy: names and phone numbers never reach the model. Residents' habits are
// sent as per-room counts plus their habit summaries; in a room with a single
// resident those are that resident's own habits. They stay within the project's
// Vertex AI and are shown to visitors only as habit-level phrases.
import { z } from 'zod';
import { cleanVibeAnswers, cleanVibeSummary, VIBE_QUESTIONS, vibeMatch, type VibeAnswers, type VibeMatch } from '@livingplus/shared';
import { aiEnabled, generateStructured, modelConfig } from './ai-provider.js';
import { logger } from '../utils/logger.js';

/** How far the matcher may move a score away from the deterministic baseline. */
export const MAX_AI_SHIFT = 15;

/** One room the visitor is compared against. */
export interface VibeRoomInput {
  roomId: string;
  roomNumber?: string;
  roommates: VibeAnswers[];
  /** Residents' habit summaries (no names), when they wrote one. */
  summaries?: string[];
}

export interface AiVibeMatch extends VibeMatch {
  /** True when the score came from the AI matcher rather than the baseline. */
  ai: boolean;
  /** One-line verdict from the matcher, present on AI matches only. */
  headline?: string;
}

/** Gemini model name for VibeCheck, or null when no usable model is configured. */
export function vibeModelName(): string | null {
  const direct = (process.env.VIBECHECK_AI_MODEL || '').trim();
  if (direct) return direct;
  let configured = '';
  try {
    configured = (modelConfig('chat').model || '').trim();
  } catch {
    return null;
  }
  if (!configured) return null;
  const at = configured.indexOf(':');
  if (at <= 0) return configured;
  return configured.slice(0, at) === 'google' ? configured.slice(at + 1) : null;
}

/** Whether the AI path is attempted (failures still fall back). */
export const vibeAiEnabled = (): boolean => aiEnabled() && vibeModelName() !== null;

export function vibeAiStatus(): { enabled: boolean; configured: boolean; model: string } {
  const model = vibeModelName() || '';
  return { enabled: aiEnabled(), configured: aiEnabled() && Boolean(model), model };
}

function phraseFor(questionId: string, value: number): string {
  const question = VIBE_QUESTIONS.find((item) => item.id === questionId);
  return question?.phrase[value] ?? `${questionId}=${value}`;
}

// ---------------------------------------------------------------- profiler

// Lenient on purpose: one out-of-range value is dropped by cleanVibeAnswers, not the whole answer.
const habitValue = z.number().nullable();
const vibeProfileSchema = z.object({
  answers: z.object(Object.fromEntries(VIBE_QUESTIONS.map((question) => [question.id, habitValue.describe(`${question.question} 0, 1 or 2, or null if not mentioned`)])) as Record<string, typeof habitValue>),
  summary: z.string().describe('One or two short sentences about lifestyle habits only, in English'),
  followUp: z.string().nullable().describe('One short question about the most important missing habit, or null')
});

export interface VibeProfile {
  answers: VibeAnswers;
  summary: string | null;
  followUp: string | null;
  /** Habits the description did not cover (still unanswered). */
  missing: string[];
}

function profilerInstruction(): string {
  const scale = VIBE_QUESTIONS.map((question) =>
    `- ${question.id}: ${question.question} 0 = ${question.options[0].label}, 1 = ${question.options[1].label}, 2 = ${question.options[2].label}`
  ).join('\n');
  return [
    'You build a lifestyle profile for VibeCheck, which helps people in paying-guest housing find compatible roommates.',
    'Read how the person describes their routine (it may be in Tamil, Hindi, English or a mix) and map it to these habits:',
    scale,
    'Use null for a habit the description does not clearly cover. Do not guess.',
    'Write the summary in English, about habits only (sleep, tidiness, noise, guests, kitchen, schedule, temperature, hobbies that affect roommates).',
    'Never record or mention religion, caste, diet, gender, health, politics, family background or other identity details, even if the person mentions them.',
    'If the most important habits (sleep, tidiness or noise) are missing, ask one short, friendly follow-up question in the language the person wrote in; otherwise followUp is null.'
  ].join('\n');
}

export interface VibeProfilerDeps {
  runProfiler?: (text: string) => Promise<unknown>;
}

/**
 * Builds a lifestyle profile from free text with the `vibe-profiler` model call.
 * `current` (earlier answers) fills habits the new text does not mention.
 * Throws VIBE_AI_UNAVAILABLE when no model is configured, so callers can offer the quiz.
 */
export async function buildVibeProfile(text: string, current: VibeAnswers = {}, deps: VibeProfilerDeps = {}): Promise<VibeProfile> {
  const description = text.trim().slice(0, 2000);
  if (!description) throw new Error('VIBE_TEXT_EMPTY');
  const model = vibeModelName();
  if (!deps.runProfiler && (!aiEnabled() || !model)) throw new Error('VIBE_AI_UNAVAILABLE');
  let raw: unknown;
  if (deps.runProfiler) {
    raw = await deps.runProfiler(description);
  } else {
    raw = await generateStructured({ system: profilerInstruction(), parts: [{ text: description }], schema: vibeProfileSchema, model: model! });
  }
  const parsed = vibeProfileSchema.parse(raw);
  const found = cleanVibeAnswers(Object.fromEntries(Object.entries(parsed.answers).filter(([, value]) => value !== null))) ?? {};
  const answers = { ...current, ...found };
  return {
    answers,
    summary: cleanVibeSummary(parsed.summary),
    followUp: cleanVibeSummary(parsed.followUp),
    missing: VIBE_QUESTIONS.filter((question) => answers[question.id] === undefined).map((question) => question.id)
  };
}

// ---------------------------------------------------------------- voice interview

/** One spoken (or typed) turn of the VibeCheck interview. */
export interface VibeTurn { role: 'assistant' | 'user'; text: string }

const interviewSchema = z.object({
  heard: z.string().describe('What the person just said, transcribed in their own language and script; empty if nothing intelligible'),
  answers: vibeProfileSchema.shape.answers,
  summary: z.string().describe('One or two short sentences about their lifestyle habits so far, in English'),
  reply: z.string().describe('What you say next as their PG buddy, in their language and style: a short, natural reaction and at most one follow-up, or a warm closing line when done. At most 30 words, no lists.'),
  done: z.boolean().describe('True once you have a good feel for their sleep, tidiness and noise and the chat has reached a natural pause, or after about eight exchanges')
});

export interface VibeInterviewTurn {
  heard: string;
  answers: VibeAnswers;
  summary: string | null;
  reply: string;
  done: boolean;
  missing: string[];
}

function interviewInstruction(topics: { skip: string[]; facts: string[] } = { skip: [], facts: [] }): string {
  const scale = VIBE_QUESTIONS.map((question) =>
    `- ${question.id}: ${question.question} 0 = ${question.options[0].label}, 1 = ${question.options[1].label}, 2 = ${question.options[2].label}`
  ).join('\n');
  return [
    "You are the user's PG buddy: a friendly, easy-going senior who knows PG life well, chatting with someone who is about to move into one. Behind the scenes you are getting to know how they live, so they can be matched with roommates they will get along with.",
    "Talk like a friend, not an interviewer. Never run through a list of questions, never say words like habits, questionnaire, score or profile, and never ask two questions at once.",
    "Open casually by asking whether they are studying or working these days, then follow their lead: react to what they say with genuine interest, a little warmth or humour, and ask natural follow-ups about their day, work or study, weekends, hobbies and how they like their space. Never assume where they are from, that they are new to Chennai, or why they chose it, and don't ask why they like the city; build only on what they actually tell you.",
    "Work out their lifestyle from what they tell you rather than asking directly. 'Exams are coming, I'm up most nights' tells you about sleep and noise; 'I hate a messy room' tells you about tidiness; 'my friends come over to play FIFA' tells you about guests and noise.",
    "The things you are quietly learning: sleep time, wake time, tidiness, noise they make or tolerate, how often friends visit, study or work schedule, shared kitchen use, and preferred room temperature. Sleep, tidiness and noise matter most; if one of those is still unclear late in the chat, bring it up casually in passing, never as a direct survey question.",
    "Keep each turn short and spoken: one or two sentences. Use the language and style they use (Tamil, Hindi, English, Tanglish or Hinglish) and switch when they switch.",
    "Never ask about or note religion, caste, diet, gender, health, politics or family background, even if they bring it up; just move on kindly.",
    "Each turn you get the conversation so far, what you have inferred already, and their new message (audio or text). Update answers with everything you can infer from the whole conversation; use null only for things still unknown, and keep earlier answers unless they correct them.",
    "reply is what you say next as their buddy: react to what they said and keep the chat going with one natural follow-up. When you have a good feel for sleep, tidiness and noise and the chat reaches a natural pause, or after about eight exchanges, set done to true and wrap up warmly, saying you'll now show rooms where they'd fit in.",
    'Record what you infer in answers using these values:',
    scale,
    ...(topics.facts.length ? [`About the PG they are looking at: ${topics.facts.join(' ')}`] : []),
    ...(topics.skip.length ? [`These don't apply at this PG, so never bring them up and leave them null: ${topics.skip.join(', ')}.`] : [])
  ].join('\n');
}

export interface VibeInterviewerDeps {
  runInterviewer?: (input: { history: VibeTurn[]; known: VibeAnswers; text?: string; audio?: { mimeType: string; data: string }; topics?: { skip: string[]; facts: string[] } }) => Promise<unknown>;
}

/**
 * One turn of the voice VibeCheck: Gemini hears the person's answer (audio or
 * text), updates their habits, and says the next question. Throws
 * VIBE_AI_UNAVAILABLE / VIBE_TURN_EMPTY.
 */
export async function vibeInterviewTurn(
  input: { history: VibeTurn[]; known: VibeAnswers; text?: string; audio?: { mimeType: string; data: string }; topics?: { skip: string[]; facts: string[] } },
  deps: VibeInterviewerDeps = {}
): Promise<VibeInterviewTurn> {
  const topics = input.topics ?? { skip: [], facts: [] };
  const text = (input.text || '').trim().slice(0, 1000);
  if (!text && !input.audio) throw new Error('VIBE_TURN_EMPTY');
  const model = vibeModelName();
  if (!deps.runInterviewer && (!aiEnabled() || !model)) throw new Error('VIBE_AI_UNAVAILABLE');
  const history = input.history.slice(-12).map((turn) => `${turn.role === 'assistant' ? 'VibeCheck' : 'Person'}: ${turn.text.slice(0, 500)}`).join('\n');
  const known = Object.entries(input.known).map(([id, value]) => `${id}=${value}`).join(', ') || 'none yet';
  let raw: unknown;
  if (deps.runInterviewer) {
    raw = await deps.runInterviewer({ ...input, ...(text ? { text } : {}) });
  } else {
    const parts: Array<Record<string, unknown>> = [
      { text: `Conversation so far:\n${history || '(just started)'}\n\nHabits already known: ${known}\n\nThe person's new answer${input.audio ? ' is in the audio clip' : `: ${text}`}.` }
    ];
    if (input.audio) parts.push({ inlineData: { mimeType: input.audio.mimeType, data: input.audio.data } });
    raw = await generateStructured({ system: interviewInstruction(topics), parts, schema: interviewSchema, model: model! });
  }
  const parsed = interviewSchema.parse(raw);
  const found = cleanVibeAnswers(Object.fromEntries(Object.entries(parsed.answers).filter(([id, value]) => value !== null && !topics.skip.includes(id)))) ?? {};
  const answers = { ...input.known, ...found };
  const missing = VIBE_QUESTIONS.filter((question) => !topics.skip.includes(question.id) && answers[question.id] === undefined).map((question) => question.id);
  const turns = input.history.filter((turn) => turn.role === 'user').length + 1;
  return {
    heard: (parsed.heard || text).trim().slice(0, 500),
    answers,
    summary: cleanVibeSummary(parsed.summary),
    reply: parsed.reply.trim().slice(0, 300),
    done: parsed.done || turns >= 8 || missing.length === 0,
    missing
  };
}

// ---------------------------------------------------------------- matcher

const vibeJudgment = z.object({
  score: z.number().describe('Compatibility score, 0 (clash) to 100 (perfect match)'),
  reasons: z.array(z.string()).describe('Up to two shared habits, each reading after "You both …"'),
  differences: z.array(z.string()).describe('At most one notable difference, reading after "A roommate tends to …"'),
  headline: z.string().describe('One-line verdict, at most 12 words').optional()
});
const vibeJudgments = z.object({ rooms: z.record(z.string(), vibeJudgment) });

function describeAnswers(answers: VibeAnswers): string {
  const lines: string[] = [];
  for (const question of VIBE_QUESTIONS) {
    const value = answers[question.id];
    if (value === undefined) continue;
    lines.push(`- ${question.question} ${phraseFor(question.id, value)}${question.weight > 1 ? ' (matters a lot)' : ''}`);
  }
  return lines.join('\n');
}

/** Per-question answer counts and habit summaries: never names or phone numbers. */
function describeRoommates(room: VibeRoomInput): string {
  const lines: string[] = [];
  for (const question of VIBE_QUESTIONS) {
    const counts = [0, 0, 0];
    for (const mate of room.roommates) {
      const value = mate[question.id];
      if (value !== undefined) counts[value] = (counts[value] ?? 0) + 1;
    }
    const parts = counts.map((n, v) => (n ? `${n} × ${phraseFor(question.id, v)}` : '')).filter(Boolean);
    if (parts.length) lines.push(`- ${question.question} ${parts.join('; ')}`);
  }
  for (const summary of room.summaries ?? []) lines.push(`- A resident in their own words: "${summary}"`);
  return lines.join('\n');
}

function judgePrompt(person: VibeAnswers, personSummary: string | null, judged: { room: VibeRoomInput; baseline: VibeMatch }[]): string {
  const sections = judged.map(({ room, baseline }, index) => [
    `Room ${room.roomNumber || `#${index + 1}`} (id ${room.roomId}): ${baseline.compared} resident${baseline.compared === 1 ? '' : 's'} answered; deterministic baseline score ${baseline.score ?? 'none'}.`,
    describeRoommates(room)
  ].join('\n'));
  return [
    'The visitor answered these lifestyle questions:',
    describeAnswers(person),
    ...(personSummary ? [`In their own words: "${personSummary}"`] : []),
    '',
    ...sections.flatMap((section) => [section, '']),
    `Judge every room. Your score must stay within ${MAX_AI_SHIFT} points of that room's baseline; use the words in summaries to decide which way.`,
    'Weigh sleep, tidiness and noise most.',
    'Reasons name shared habits and must read after "You both …"; the difference must read after "A roommate tends to …".',
    'Never mention residents by name or reveal who answered what; only habit-level phrases.',
    'Return one judgment per room id.'
  ].join('\n');
}

export interface VibeMatcherDeps {
  runMatcherText?: (prompt: string) => Promise<string>;
}

async function runVibeMatcher(prompt: string, model: string, deps: VibeMatcherDeps = {}): Promise<z.infer<typeof vibeJudgments>> {
  if (deps.runMatcherText) {
    const text = await deps.runMatcherText(prompt);
    return vibeJudgments.parse(JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()));
  }
  return generateStructured({
    system: [
      'You are the VibeCheck roommate-compatibility judge for a paying-guest housing platform.',
      `Ground yourself in each room's deterministic baseline score and keep each score within ${MAX_AI_SHIFT} points of it.`,
      'Answer with one JSON object only: {"rooms": {"<room id>": {"score": 0-100, "reasons": [...], "differences": [...], "headline": "..."}}}.',
      'Lifestyle habits only; never name residents or reveal who answered what.'
    ].join(' '),
    parts: [{ text: prompt }],
    schema: vibeJudgments,
    model,
    // The guest is watching a spinner: the main model gets 12 s, then the fast
    // fallback model the rest; past 20 s the deterministic baseline scores show.
    timeoutMs: 20_000
  });
}

function cleanPhrases(values: string[], limit: number): string[] {
  return values.filter((value) => typeof value === 'string' && value.trim()).slice(0, limit).map((value) => value.trim().slice(0, 140));
}

/** The agent's score, held within ±MAX_AI_SHIFT of the deterministic baseline. */
export function anchoredScore(aiScore: number, baseline: number): number {
  const value = Number.isFinite(aiScore) ? aiScore : baseline;
  return Math.max(0, Math.min(100, Math.round(Math.min(baseline + MAX_AI_SHIFT, Math.max(baseline - MAX_AI_SHIFT, value)))));
}

/**
 * Scores one person against every room: AI judgment per room when the agent
 * answers, else the deterministic baseline. Rooms nobody answered stay
 * scoreless and never reach the agent.
 */
export async function scoreVibeRooms(
  person: VibeAnswers,
  rooms: VibeRoomInput[],
  personSummary: string | null = null,
  deps: VibeMatcherDeps = {}
): Promise<Map<string, AiVibeMatch>> {
  const matches = new Map<string, AiVibeMatch>();
  const judged: { room: VibeRoomInput; baseline: VibeMatch }[] = [];
  for (const room of rooms) {
    const baseline = vibeMatch(person, room.roommates);
    matches.set(room.roomId, { ...baseline, ai: false });
    if (baseline.score !== null) judged.push({ room, baseline });
  }
  const model = vibeModelName();
  if (!judged.length || (!deps.runMatcherText && (!aiEnabled() || !model))) return matches;
  try {
    const { rooms: judgments } = await runVibeMatcher(judgePrompt(person, personSummary, judged), model ?? 'test', deps);
    for (const { room, baseline } of judged) {
      const judgment = judgments[room.roomId];
      if (!judgment) continue;
      const reasons = cleanPhrases(judgment.reasons, 2);
      const match: AiVibeMatch = {
        score: anchoredScore(judgment.score, baseline.score!),
        compared: baseline.compared,
        reasons: reasons.length ? reasons : baseline.reasons,
        differences: cleanPhrases(judgment.differences, 1),
        ai: true
      };
      const headline = judgment.headline?.trim().slice(0, 120);
      matches.set(room.roomId, headline ? { ...match, headline } : match);
    }
  } catch (error) {
    logger.warn({ err: error }, 'VibeCheck AI agent failed; using deterministic scores');
  }
  return matches;
}
