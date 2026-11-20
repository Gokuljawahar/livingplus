// One role-aware orchestrator (PG OS §8): model reasons, backend tools
// execute. Sensitive tools pause for explicit user confirmation; the backend
// — never the model — decides what runs.
//
// The agent runs on Google ADK: an LlmAgent with one FunctionTool per tool,
// driven by ADK's Runner (model ↔ tools, at most MAX_ITERATIONS model calls a
// turn). The model behind it is our Gemini SDK model (ai-provider) wrapped as
// an ADK BaseLlm, so Gemini settings (Vertex or API key, thinking level) stay
// in one place and tests can script the model.
//
// Threads live in ConversationSession.stateJson, so history and paused
// confirmations survive restarts and work across Cloud Run instances: each
// turn seeds an in-memory ADK session with the stored history, runs, and saves
// the new events back. Confirmation is our own pause (not ADK's in-memory
// requireConfirmation) because it must be bound to the caller, persona and
// PG and outlive the process.
//
// Confirming or canceling a sensitive call resumes the same thread; the
// confirmation token binds the pause to the caller, persona and property
// host that prepared it, and expires after ten minutes.

import { randomBytes } from 'crypto';
import { BaseLlm, createEvent, createRunConfig, FunctionTool, InMemoryRunner, isLlmCallsLimitExceededError, LlmAgent, type LlmRequest, type LlmResponse } from '@google/adk';
import type { Content, Schema } from '@google/genai';
import { prisma } from '../app.js';
import { actorFromRequest, parseToolArgs, toolCatalogue, toolDefinitionsFor, type Actor } from './ai-tools.js';
import { modelFailure, modelTimeoutMs, type ModelStep, type ModelTurn, type ToolDefinition } from './ai-provider.js';
import { loadThreadState, saveThreadState, type ChatThreadState, type PendingAction } from './ai-checkpointer.js';
import { confirmationSurface, surfacesForOutcomes, type A2uiMessage } from './a2ui.js';
import { logger } from '../utils/logger.js';

const db = new Proxy({} as Record<string, any>, {
  get: (_target, property) => (prisma as any)[property]
});

const MAX_ITERATIONS = 6;
/** History entries (user/model turns) sent to the model. */
const HISTORY_MESSAGES = 40;
const CONFIRM_TTL_MS = 10 * 60 * 1000;

/** Reply language chosen in the chat panel (buildathon answers Q12: local-language help). */
export const ASSISTANT_LANGUAGES: Record<string, string> = { en: 'English', ta: 'Tamil (தமிழ்)', hi: 'Hindi (हिन्दी)' };

export function languageInstruction(language = 'en'): string {
  const name = ASSISTANT_LANGUAGES[language] ?? ASSISTANT_LANGUAGES.en;
  return language === 'en' || !ASSISTANT_LANGUAGES[language]
    ? 'Reply in English unless the user writes in another language; then reply in theirs.'
    : `Reply in ${name}, in simple everyday words, using its own script. Keep PG names, rupee amounts (₹), dates, room numbers and booking references exactly as they are.`;
}

function roleSystemPrompt(role: string): string {
  const shared = [
    'You are the PG OS assistant for a paying-guest housing platform.',
    'Use backend tools for every operational fact: properties, availability, rent, bookings.',
    'Never invent availability, prices, booking references or payment outcomes.',
    'If constraints are missing, ask one focused question instead of guessing.',
    'If a request is outside the caller’s role or property scope, refuse briefly and offer what you can do.',
    'Describe every action in plain words: never mention internal tool names, codes, or IDs to the user.',
    'Use only tools explicitly supplied for this persona. Do not infer access from the conversation or act on a different property. When an argument such as a property ID is missing, look it up with an authorized tool or ask one focused question.',
    'For actions that need confirmation, call the tool as soon as the details are complete. The system pauses for explicit user confirmation.'
  ];
  if (role === 'PG_OWNER') {
    return [...shared, 'You serve a PG owner across the properties they own. Summarize occupancy, outstanding dues and property expenses from tool results with period and scope. You may log property expenses, draft and approve electricity splits, and send rent reminders or notifications through their tools, and draft notices for residents (show the draft, then post it with send_property_notice), and coordinate staff (list_staff, then assign_maintenance_ticket), always pausing for explicit confirmation first. Never mark rent paid or approve tenants yourself; direct those to the workspace workflows. Only ever discuss properties returned by your tools.'].join('\n');
  }
  if (role === 'PG_WARDEN') {
    return [...shared, 'You serve a PG warden for day-to-day operations on assigned properties only: occupancy, bookings, maintenance lifecycle, expenses, electricity drafts and approvals, reminders, notifications, resident notices (draft first, then send_property_notice) and staff assignments (list_staff, assign_maintenance_ticket), always pausing for explicit confirmation first. You cannot see outstanding-dues detail; for dues questions direct the owner to the rent ledger. For room swap or move requests, review them with decide_room_change only after both residents have accepted; the move itself is atomic. Never mark rent paid or approve tenants yourself; direct those to the workspace workflows. Only ever discuss properties returned by your tools.'].join('\n');
  }
  if (role === 'PG_TENANT') {
    return [...shared, 'You serve a resident and can only ever see their own stay on their own PG. For questions about room, stay, rent or dues, call get_my_stay immediately. For ticket history, call get_my_maintenance_requests. For a complaint, gather a short title, details and category, then call create_maintenance_ticket; the session already identifies their PG, so omit property_id. If the resident attaches a clear, relevant maintenance photo, use it to help describe the issue. For meal charges, use set_meal_preference only after explicit confirmation. For room changes: open requests with request_room_change, show matches with find_room_change_matches, and track them with get_my_room_change_requests. Swap proposals name only a first name and the bed on offer — never reveal any other resident phone number or surname, and either side may decline with no reason needed. Nothing moves until the warden or owner confirms. Never ask which PG the resident is staying in or ask for internal IDs. Never access other residents, owner finances or staff operations. The resident may also ask about other PGs: search those with search_properties — their current PG is hidden there — and for a different room inside their own PG use only the room change tools, never a new booking.'].join('\n');
  }
  return [...shared, 'You serve visitors. Help discover PGs, check availability and booking status, and prepare booking requests only after collecting move-in details and phone verification. Visitors cannot create maintenance tickets; direct current residents to their authenticated resident portal for that.'].join('\n');
}

function previewFor(tool: string, args: any): string {
  if (tool === 'create_booking_request') {
    return `Create a PENDING booking for ${args.resident_name || 'the resident'} (${args.phone || 'no phone'}) — bed ${args.bed_id}, move-in ${args.move_in_date}. The owner must still approve it.`;
  }
  if (tool === 'create_maintenance_ticket') {
    return `File a maintenance ticket: ${args.title || 'untitled'} — ${(args.description || '').slice(0, 140)}.`;
  }
  if (tool === 'request_room_change') {
    return `Open a room ${args.request_type === 'MOVE' ? 'move' : 'swap'} request for your stay${args.reason ? ` (${String(args.reason).slice(0, 100)})` : ''}. The other side and staff must still agree.`;
  }
  if (tool === 'propose_room_swap') {
    return `Propose a swap with another resident's pending request. They can accept or decline; nothing moves until staff confirm.`;
  }
  if (tool === 'respond_room_swap') {
    return `${args.decision === 'ACCEPT' ? 'Accept' : 'Decline'} the swap proposal${args.decision === 'ACCEPT' ? '; the warden or owner still confirms the move' : ''}.`;
  }
  if (tool === 'decide_room_change') {
    return `${args.decision === 'APPROVE_AND_MOVE' ? 'Approve and move the resident(s) to their new bed(s) now' : 'Decline the room change request'}${args.note ? ` (${String(args.note).slice(0, 100)})` : ''}. This is audited.`;
  }
  if (tool === 'send_rent_reminders') {
    return `Send rent-due reminders for ${args.period || 'all open periods'}${args.property_id ? ' (one property)' : ' (all my properties)'}. Residents who were reminded recently are skipped unless forced.`;
  }
  if (tool === 'assign_maintenance_ticket') {
    return `Assign maintenance ticket ${String(args.ticket_id || '').slice(0, 8)}… to ${String(args.staff_name || 'a staff member').slice(0, 60)}. This is audited.`;
  }
  if (tool === 'send_property_notice') {
    return `Post this notice to every current resident of the property: "${String(args.title || '').slice(0, 80)}" — ${String(args.message || '').slice(0, 300)}`;
  }
  if (tool === 'log_expense') {
    return `Record a ${args.category || 'general'} expense of ${args.amount} for ${args.spent_on || 'today'}${args.note ? ` (${args.note})` : ''}. This writes to the ledger.`;
  }
  if (tool === 'propose_electricity_split') {
    return `Propose an electricity split of ${args.total_amount} for ${args.period}. No one is billed yet; approval creates the ledger entries.`;
  }
  if (tool === 'approve_electricity_bill') {
    return `Approve the drafted electricity bill and create one ledger entry per tenant. Tenants will see the charge with their rent.`;
  }
  if (tool === 'set_meal_preference') {
    return args.opt_out ? 'Opt out of the monthly food charge from the next billing cycle.' : 'Opt back in to the monthly food charge.';
  }
  if (tool === 'send_notification') {
    return `Send template "${args.template}" to ${args.recipient_phone}.`;
  }
  return `Run ${tool} with the provided arguments.`;
}

/**
 * Minimal surface the agent needs from a chat model: one generate() step per
 * turn. The configured Google model satisfies it; tests pass scripted stand-ins.
 */
export interface AgentModel {
  generate?: (turn: ModelTurn) => Promise<ModelStep>;
}

export interface ChatResult {
  reply: string;
  sessionId: string;
  needsConfirmation?: { confirmationId: string; tool: string; preview: string };
  toolCalls?: string[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | undefined;
  /** A2UI v1.0 surfaces for the client to render natively (text reply remains the fallback). */
  ui?: A2uiMessage[];
}

type ResumeDecision = { action: 'confirm' | 'cancel' | 'abandon' };

function contentText(content: Content | undefined): string {
  return (content?.parts ?? []).filter((part) => typeof part.text === 'string').map((part) => part.text as string).join('');
}

/** Last HISTORY_MESSAGES entries, starting at a user turn (the API rejects histories that open otherwise). */
function trimHistory(history: Content[]): Content[] {
  const window = history.slice(-HISTORY_MESSAGES);
  const firstUser = window.findIndex((entry) => entry.role === 'user');
  return firstUser < 0 ? [] : window.slice(firstUser);
}

/** Replaces photos in earlier turns with a note, so history stays small. */
function withoutOldPhotos(history: Content[]): Content[] {
  let lastUser = -1;
  history.forEach((entry, i) => { if (entry.role === 'user') lastUser = i; });
  return history.map((entry, i) => {
    if (i === lastUser || entry.role !== 'user') return entry;
    if (!entry.parts?.some((part) => part.inlineData && String(part.inlineData.mimeType || '').startsWith('image/'))) return entry;
    return { role: 'user', parts: [{ text: `${contentText(entry)}\n[photo attached earlier]` }] };
  });
}

interface ToolOutcome {
  id: string;
  name: string;
  ok: boolean;
  output: string;
}

/** Tool results as the model turn's answer: one user turn of function responses. */
function responseContent(results: ToolOutcome[]): Content {
  return {
    role: 'user',
    parts: results.map((result) => ({
      functionResponse: { id: result.id, name: result.name, response: result.ok ? { output: result.output } : { error: result.output } }
    }))
  };
}

function userContent(message: string, imageDataUrl?: string): Content {
  if (!imageDataUrl) return { role: 'user', parts: [{ text: message }] };
  const comma = imageDataUrl.indexOf(',');
  const mime = comma > 0 ? /^data:([^;,]+);base64$/.exec(imageDataUrl.slice(0, comma))?.[1] : undefined;
  if (!mime) return { role: 'user', parts: [{ text: message }] };
  return { role: 'user', parts: [{ text: message }, { inlineData: { mimeType: mime, data: imageDataUrl.slice(comma + 1) } }] };
}

function newConfirmationId(threadId: string, nonce: string): string {
  return `cfm.${threadId}.${nonce}`;
}

function parseConfirmationId(value: string): { threadId: string; nonce: string } | null {
  const match = /^cfm\.([A-Za-z0-9_-]{8,64})\.([a-f0-9]{32})$/.exec(value);
  return match ? { threadId: match[1]!, nonce: match[2]! } : null;
}

async function generateStep(model: AgentModel, system: string, contents: Content[], tools: ToolDefinition[]): Promise<ModelStep> {
  if (typeof model.generate !== 'function') throw new Error('AI_MODEL_INIT_FAILED: the configured model does not support tool calling');
  try {
    return await model.generate({ system, contents, tools, timeoutMs: modelTimeoutMs() });
  } catch (error: any) {
    throw modelFailure(error);
  }
}

/** Closes a pause the user walked away from: every call answered, then a plain reply. Nothing runs. */
function abandonPending(state: ChatThreadState): ChatThreadState {
  const pending = state.pending;
  if (!pending) return state;
  const results: ToolOutcome[] = [
    { id: pending.callId, name: pending.tool, ok: false, output: 'NOT CONFIRMED: the user moved on. Nothing was changed.' },
    ...pending.laterCalls.map((call) => ({
      id: call.id, name: call.name || 'skipped', ok: false,
      output: 'NOT RUN: an earlier action in this step needed confirmation. Ask again if it is still needed.'
    }))
  ];
  return {
    history: [...state.history, responseContent(results), { role: 'model', parts: [{ text: 'I did not run that action because it was not confirmed.' }] }],
    pending: null
  };
}

async function findSession(id: string | undefined, actor: Actor): Promise<{ id: string } | null> {
  if (!id) return null;
  return db.conversationSession.findFirst({
    where: { id: String(id), ...(actor.userId ? { userId: actor.userId } : {}) },
    select: { id: true }
  }).catch(() => null);
}

/** ADK skips any event whose first part is an empty text, which would orphan the function calls after it. */
function withoutEmptyText<T extends { text?: string | undefined }>(parts: T[]): T[] {
  const kept = parts.filter((part) => !(part.text === '' && Object.keys(part).length === 1));
  return kept.length ? kept : parts;
}

/** Marks a model call whose arguments could not be parsed (see AgentModelLlm). */
const INVALID_ARGS = '__invalid_args__';
const AWAITING = 'AWAITING_CONFIRMATION';

/**
 * Our Gemini SDK model (or a test's scripted model) as an ADK BaseLlm. ADK owns
 * the loop; this answers each model call with one generate() step, declaring
 * only the caller role's tools.
 */
class AgentModelLlm extends BaseLlm {
  constructor(private readonly inner: AgentModel, private readonly declared: ToolDefinition[], private readonly onUsage: (usage: ChatResult['usage']) => void) {
    super({ model: 'livingplus-gemini' });
  }

  async *generateContentAsync(request: LlmRequest): AsyncGenerator<LlmResponse, void> {
    const instruction = request.config?.systemInstruction as any;
    const system = typeof instruction === 'string' ? instruction : (instruction?.parts ?? []).map((part: any) => part?.text ?? '').join('\n');
    const step = await generateStep(this.inner, system, request.contents, this.declared);
    if (step.usage) this.onUsage(step.usage);
    // Calls the provider could not parse go back to the model as errors (it can retry).
    const invalid = step.invalid.map((bad) => ({ functionCall: { id: bad.id, name: bad.name || 'search_properties', args: { [INVALID_ARGS]: bad.error } } }));
    const parts = [...withoutEmptyText(step.content.parts ?? []), ...invalid];
    yield { content: { role: 'model', parts: parts.length ? parts : [{ text: step.text }] }, ...(step.usage ? { usageMetadata: { promptTokenCount: step.usage.prompt_tokens, candidatesTokenCount: step.usage.completion_tokens } } : {}) } as LlmResponse;
  }

  async connect(): Promise<never> {
    throw new Error('Live connections are not used by the LivingPlus assistant');
  }
}

export async function runChat(
  req: any,
  model: AgentModel,
  input: { message: string; sessionId?: string | undefined; confirmationId?: string | undefined; cancelConfirmationId?: string | undefined; imageDataUrl?: string | undefined; language?: string | undefined }
): Promise<ChatResult> {
  const actor: Actor = await actorFromRequest(req);
  const role = ['PG_OWNER', 'PG_WARDEN', 'PG_TENANT'].includes(actor.role) ? actor.role : 'GUEST';
  const userKey = actor.userId || `guest:${(req as any).ip || 'unknown'}`;
  const system = `${roleSystemPrompt(role)}\n${languageInstruction(input.language)}`;
  const tools = toolDefinitionsFor(role);

  // Confirm / cancel: resume the paused thread named by the confirmation token. No model calls.
  const decisionToken = input.confirmationId || input.cancelConfirmationId;
  if (decisionToken) {
    const action: ResumeDecision['action'] = input.cancelConfirmationId ? 'cancel' : 'confirm';
    const fallbackSession = input.sessionId || '';
    const inactive = action === 'cancel' ? 'That confirmation is no longer active. Nothing was changed.' : 'That confirmation expired. Please ask again and I will prepare it fresh.';
    const token = parseConfirmationId(decisionToken);
    const session = token && (!input.sessionId || input.sessionId === token.threadId) ? await findSession(token.threadId, actor) : null;
    const state = session ? await loadThreadState(session.id) : null;
    const pending: PendingAction | null = state?.pending ?? null;
    if (!session || !state || !pending || pending.nonce !== token!.nonce) {
      logger.debug({ role, kind: action }, 'chat confirmation without a matching pause');
      return { reply: inactive, sessionId: fallbackSession };
    }
    // Bound to the same caller, persona and PG host that prepared it.
    if (pending.userKey !== userKey || pending.role !== role || pending.propertyId !== (actor.propertyId ?? null)) {
      logger.debug({ role, kind: action }, 'chat confirmation refused for another caller');
      return { reply: inactive, sessionId: fallbackSession };
    }
    if (pending.expiresAt < Date.now()) {
      await saveThreadState(session.id, abandonPending(state));
      return { reply: inactive, sessionId: session.id };
    }
    const results: ToolOutcome[] = [];
    let reply: string;
    let ran = false;
    if (action === 'cancel') {
      results.push({ id: pending.callId, name: pending.tool, ok: false, output: 'CANCELED by the user. Nothing was changed.' });
      reply = 'Canceled. Nothing was changed.';
    } else {
      const tool = toolCatalogue[pending.tool];
      if (!tool || !tool.roles.includes(role)) {
        results.push({ id: pending.callId, name: pending.tool, ok: false, output: 'ERROR: no longer valid for this persona.' });
        reply = 'That confirmation is no longer valid for this persona. Please ask again.';
      } else {
        try {
          const execArgs = pending.tool === 'create_booking_request' ? { ...pending.args, idempotency_key: `idem_${pending.nonce}` } : pending.args;
          const result = await tool.execute(actor, execArgs);
          results.push({ id: pending.callId, name: pending.tool, ok: true, output: JSON.stringify(result).slice(0, 6000) });
          reply = `Done. ${pending.preview} Result: ${JSON.stringify(result)}`;
          ran = true;
        } catch (error: any) {
          const code = String(error?.message || error);
          const reason = code === 'FORBIDDEN' ? 'That is outside your access' : code;
          results.push({ id: pending.callId, name: pending.tool, ok: false, output: `ERROR: ${code}` });
          reply = `I could not complete that: ${reason}. Nothing was changed.`;
        }
      }
    }
    for (const later of pending.laterCalls) {
      results.push({ id: later.id, name: later.name || 'skipped', ok: false, output: 'NOT RUN: an earlier action in this step needed confirmation. Ask again if it is still needed.' });
    }
    state.history.push(responseContent(results));
    state.history.push({ role: 'model', parts: [{ text: reply }] });
    state.pending = null;
    await saveThreadState(session.id, state);
    logger.debug({ role, kind: action, tool: pending.tool, ran }, 'chat confirmation resolved');
    return { reply, sessionId: session.id, ...(ran ? { toolCalls: [pending.tool] } : {}) };
  }

  // A new message: continue the caller's thread, or start one.
  let session = await findSession(input.sessionId, actor);
  if (!session) {
    session = await db.conversationSession.create({
      data: { userId: actor.userId, channel: 'web', role: actor.role, stateJson: '[]' },
      select: { id: true }
    });
  }
  const threadId = session!.id;
  let state = await loadThreadState(threadId);

  // The user moved on instead of answering a pending confirmation: close it out.
  if (state.pending) {
    state = abandonPending(state);
    await saveThreadState(threadId, state);
  }

  const userMessage = userContent(input.message, input.imageDataUrl);
  const executed: string[] = [];
  const outcomes: Array<{ tool: string; result: unknown }> = [];
  let usage: ChatResult['usage'];
  let pending: PendingAction | null = null;

  /** Every tool call the model makes lands here; the backend decides what runs. */
  const handleCall = async (name: string, rawArgs: unknown, callId: string, skip: () => void): Promise<Record<string, string>> => {
    if (pending) return { error: 'NOT RUN: an earlier action in this step needed confirmation. Ask again if it is still needed.' };
    const invalid = rawArgs && typeof rawArgs === 'object' ? (rawArgs as Record<string, unknown>)[INVALID_ARGS] : undefined;
    if (invalid !== undefined) return { error: 'ERROR: arguments were not valid JSON.' };
    const tool = toolCatalogue[name];
    if (!tool || !tool.roles.includes(role)) return { error: `ERROR: tool ${name} is not available to role ${role}.` };
    // Validate before anything runs or is offered for confirmation; the model gets the exact problem back.
    const parsed = parseToolArgs(name, rawArgs);
    if (!parsed.ok) return { error: `ERROR: invalid arguments for ${name}:\n${parsed.error}` };
    if (tool.requiresConfirmation) {
      pending = {
        nonce: randomBytes(16).toString('hex'), callId, tool: name, args: parsed.args, preview: previewFor(name, parsed.args),
        laterCalls: [], userKey, role, propertyId: actor.propertyId ?? null, expiresAt: Date.now() + CONFIRM_TTL_MS
      };
      skip();
      return { status: AWAITING };
    }
    try {
      const outcome = await tool.execute(actor, parsed.args);
      executed.push(name);
      outcomes.push({ tool: name, result: outcome });
      return { output: JSON.stringify(outcome).slice(0, 6000) };
    } catch (error: any) {
      return { error: `ERROR: ${String(error?.message || error)}` };
    }
  };

  const agent = new LlmAgent({
    name: 'livingplus_assistant',
    description: 'Role-aware PG assistant for guests, residents and staff.',
    model: new AgentModelLlm(model, tools, (next) => { usage = next; }),
    // A function, so ADK does not template {placeholders} from session state into the prompt.
    instruction: async () => system,
    // Every catalogue tool is registered so calls outside the role reach handleCall and are refused there;
    // only the role's tools are declared to the model (AgentModelLlm).
    tools: Object.keys(toolCatalogue).map((name) => new FunctionTool({
      name,
      description: toolCatalogue[name]!.description,
      parameters: (tools.find((tool) => tool.name === name)?.parameters ?? { type: 'object', properties: {} }) as Schema,
      execute: (args, toolContext) => handleCall(name, args, toolContext?.functionCallId || '', () => {
        if (toolContext) toolContext.actions.skipSummarization = true;
      })
    }))
  });

  const runner = new InMemoryRunner({ agent, appName: 'livingplus' });
  const adkSession = await runner.sessionService.createSession({ appName: 'livingplus', userId: userKey, sessionId: threadId });
  for (const content of withoutOldPhotos(trimHistory(state.history))) {
    await runner.sessionService.appendEvent({
      session: adkSession,
      event: createEvent({ invocationId: 'history', author: content.role === 'user' ? 'user' : agent.name, content: { ...content, parts: withoutEmptyText(content.parts ?? []) } })
    });
  }

  const added: Content[] = [];
  let reply = '';
  let limited = false;
  try {
    for await (const event of runner.runAsync({ userId: userKey, sessionId: threadId, newMessage: userMessage, runConfig: createRunConfig({ maxLlmCalls: MAX_ITERATIONS }) as any })) {
      if (event.errorCode || event.errorMessage) {
        if (/max number of llm calls/i.test(String(event.errorMessage))) { limited = true; break; }
        throw modelFailure(new Error(event.errorMessage || event.errorCode));
      }
      const content = event.content;
      if (content?.parts?.length) added.push({ role: content.role || (event.author === 'user' ? 'user' : 'model'), parts: content.parts });
      const responded = content?.parts?.some((part) => part.functionResponse);
      const called = content?.parts?.some((part) => part.functionCall);
      if (pending && responded) break;
      if (!called && !responded && event.author === agent.name) reply = (content?.parts ?? []).filter((part) => typeof part.text === 'string').map((part) => part.text).join('');
    }
  } catch (error: any) {
    if (!isLlmCallsLimitExceededError(error)) throw error?.message?.startsWith?.('MODEL_API_FAILED') ? error : modelFailure(error);
    limited = true;
  }

  // The pause's own placeholder answer is not kept: the confirm/cancel path answers that call.
  const pendingCallId = (pending as PendingAction | null)?.callId;
  const kept = added
    .map((content) => ({ ...content, parts: (content.parts ?? []).filter((part) => !(pendingCallId && part.functionResponse?.id === pendingCallId && part.functionResponse?.response?.status === AWAITING)) }))
    .filter((content) => content.parts.length);
  state.history.push(userMessage, ...kept);

  if (pending) {
    const paused = pending as PendingAction;
    state.pending = paused;
    await saveThreadState(threadId, state);
    const confirmationId = newConfirmationId(threadId, paused.nonce);
    logger.debug({ role, kind: 'pause', tool: paused.tool }, 'chat paused for confirmation');
    return {
      reply: `Before I proceed: ${paused.preview} Reply to confirm and I will run it.`,
      sessionId: threadId, needsConfirmation: { confirmationId, tool: paused.tool, preview: paused.preview }, toolCalls: executed, usage,
      ui: confirmationSurface(confirmationId, paused.preview)
    };
  }

  if (limited) {
    // That needed more steps than fit in one turn; every call already has its
    // answer, so the thread stays a valid conversation for the model.
    const message = 'That needed more steps than I can take in one turn. Try a smaller request.';
    state.history.push({ role: 'model', parts: [{ text: message }] });
    await saveThreadState(threadId, state);
    return { reply: message, sessionId: threadId, toolCalls: [] };
  }

  await saveThreadState(threadId, state);
  logger.debug({ role, kind: 'turn' }, 'chat turn answered');
  const ui = surfacesForOutcomes(outcomes);
  return { reply: reply.trim() || 'I could not produce an answer. Please rephrase.', sessionId: threadId, toolCalls: executed, usage, ...(ui.length ? { ui } : {}) };
}
