// One role-aware orchestrator (PG OS §8): model reasons, backend tools
// execute. Sensitive tools pause for explicit user confirmation; the backend
// — never the model — decides what runs.
//
// The agent is a LangGraph state graph with a durable checkpointer:
//
//   START -> agent -> tools -> agent ... -> END
//                       \-> confirm (interrupt: waits for the user) -> END
//
// * Each conversation is a LangGraph thread (thread_id = ConversationSession.id),
//   checkpointed in PostgreSQL, so history and paused confirmations survive
//   restarts and work across Cloud Run instances.
// * A sensitive call pauses the graph with interrupt(); confirming or canceling
//   resumes the same thread with Command({ resume }).
// * The chat model is any LangChain model (see ai-provider.ts).

import { randomBytes } from 'crypto';
import { Annotation, Command, END, GraphRecursionError, MessagesAnnotation, START, StateGraph, interrupt } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, trimMessages, type BaseMessage } from '@langchain/core/messages';
import { prisma } from '../app.js';
import { actorFromRequest, parseToolArgs, toolCatalogue, toolDefinitionsFor, type Actor } from './ai-tools.js';
import { modelFailure, modelTimeoutMs, type ToolDefinition } from './ai-provider.js';
import { getCheckpointer } from './ai-checkpointer.js';

const db = new Proxy({} as Record<string, any>, {
  get: (_target, property) => (prisma as any)[property]
});

const MAX_ITERATIONS = 6;
/** Messages (including tool calls/results) of history sent to the model. */
const HISTORY_MESSAGES = 40;
const CONFIRM_TTL_MS = 10 * 60 * 1000;

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
    return [...shared, 'You serve a PG owner across the properties they own. Summarize occupancy, outstanding dues and property expenses from tool results with period and scope. You may log property expenses, draft and approve electricity splits, and send rent reminders or notifications through their tools, always pausing for explicit confirmation first. Never mark rent paid or approve tenants yourself; direct those to the workspace workflows. Only ever discuss properties returned by your tools.'].join('\n');
  }
  if (role === 'PG_WARDEN') {
    return [...shared, 'You serve a PG warden for day-to-day operations on assigned properties only: occupancy, bookings, maintenance lifecycle, expenses, electricity drafts and approvals, reminders and notifications, always pausing for explicit confirmation first. You cannot see outstanding-dues detail; for dues questions direct the owner to the rent ledger. For room swap or move requests, review them with decide_room_change only after both residents have accepted; the move itself is atomic. Never mark rent paid or approve tenants yourself; direct those to the workspace workflows. Only ever discuss properties returned by your tools.'].join('\n');
  }
  if (role === 'SUPER_ADMIN') {
    return [...shared, 'You serve the platform administrator across every property. Summarize occupancy, outstanding dues and property expenses from tool results with period and scope. You may log property expenses, draft and approve electricity splits, and send rent reminders or notifications through their tools, always pausing for explicit confirmation first. Never mark rent paid or approve tenants yourself; direct those to the workspace workflows.'].join('\n');
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
 * Minimal surface the agent needs from a chat model. Every LangChain chat model
 * with tool calling satisfies it; tests pass a scripted stand-in.
 */
export interface AgentModel {
  bindTools?: (tools: any[]) => { invoke: (messages: BaseMessage[], config?: any) => Promise<BaseMessage> };
}

export interface ChatResult {
  reply: string;
  sessionId: string;
  needsConfirmation?: { confirmationId: string; tool: string; preview: string };
  toolCalls?: string[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | undefined;
}

/** A sensitive call the graph is paused on, bound to who may confirm it. */
interface PendingAction {
  nonce: string;
  callId: string;
  tool: string;
  args: any;
  preview: string;
  /** Later calls from the same model turn, answered once this one resolves. */
  laterCallIds: string[];
  userKey: string;
  role: string;
  propertyId: string | null;
  expiresAt: number;
}

type ResumeDecision = { action: 'confirm' | 'cancel' | 'abandon' };

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  pending: Annotation<PendingAction | null>({ reducer: (_current, next) => next, default: () => null }),
  /** Reply text produced by the confirm node for the API response. */
  outcome: Annotation<string | null>({ reducer: (_current, next) => next, default: () => null })
});

type AgentStateType = typeof AgentState.State;

function toLangChainTools(tools: ToolDefinition[]) {
  return tools.map((fn) => ({ type: 'function', function: { name: fn.name, description: fn.description, parameters: fn.parameters } }));
}

function messageText(message: BaseMessage | undefined): string {
  if (!message) return '';
  const content: any = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('');
  return '';
}

function usageOf(message: BaseMessage | undefined): ChatResult['usage'] {
  const meta: { input_tokens: number; output_tokens: number } | undefined = (message as any)?.usage_metadata;
  if (!meta) return undefined;
  return { prompt_tokens: meta.input_tokens, completion_tokens: meta.output_tokens };
}

/** Replaces photos in earlier turns with a note, so history stays small. */
function withoutOldPhotos(messages: BaseMessage[]): BaseMessage[] {
  let lastHuman = -1;
  messages.forEach((m, i) => { if (HumanMessage.isInstance(m)) lastHuman = i; });
  return messages.map((m, i) => {
    if (i === lastHuman || !HumanMessage.isInstance(m) || !Array.isArray(m.content)) return m;
    if (!m.content.some((part: any) => part?.type === 'image_url')) return m;
    return new HumanMessage(`${messageText(m)}\n[photo attached earlier]`);
  });
}

/** Tool names that ran successfully since the latest user message. */
function executedThisTurn(messages: BaseMessage[]): string[] {
  let start = 0;
  messages.forEach((m, i) => { if (HumanMessage.isInstance(m)) start = i; });
  return messages.slice(start)
    .filter((m): m is ToolMessage => ToolMessage.isInstance(m) && m.status !== 'error' && Boolean(m.name))
    .map((m) => m.name as string);
}

function newConfirmationId(threadId: string, nonce: string): string {
  return `cfm.${threadId}.${nonce}`;
}

function parseConfirmationId(value: string): { threadId: string; nonce: string } | null {
  const match = /^cfm\.([A-Za-z0-9_-]{8,64})\.([a-f0-9]{32})$/.exec(value);
  return match ? { threadId: match[1]!, nonce: match[2]! } : null;
}

/** Builds the role-scoped agent graph for one request. */
async function buildAgentGraph(model: AgentModel, actor: Actor, role: string, userKey: string) {
  const checkpointer = await getCheckpointer();
  const bound = typeof model.bindTools === 'function' ? model.bindTools(toLangChainTools(toolDefinitionsFor(role))) : null;

  const agent = async (state: AgentStateType) => {
    if (!bound) throw new Error('AI_MODEL_INIT_FAILED: the configured model does not support tool calling');
    const history = await trimMessages(withoutOldPhotos(state.messages), {
      maxTokens: HISTORY_MESSAGES,
      tokenCounter: (messages) => messages.length,
      strategy: 'last',
      startOn: 'human',
      includeSystem: false
    });
    try {
      const response = await bound.invoke([new SystemMessage(roleSystemPrompt(role)), ...history], { timeout: modelTimeoutMs() });
      return { messages: [response], outcome: null };
    } catch (error: any) {
      throw modelFailure(error);
    }
  };

  const tools = async (state: AgentStateType) => {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    const results: ToolMessage[] = [];
    for (const bad of last.invalid_tool_calls ?? []) {
      results.push(new ToolMessage({ tool_call_id: bad.id || '', name: bad.name || 'tool', status: 'error', content: 'ERROR: arguments were not valid JSON.' }));
    }
    const calls = last.tool_calls ?? [];
    for (let index = 0; index < calls.length; index += 1) {
      const call = calls[index]!;
      const callId = call.id || '';
      const tool = toolCatalogue[call.name];
      if (!tool || !tool.roles.includes(role)) {
        results.push(new ToolMessage({ tool_call_id: callId, name: call.name, status: 'error', content: `ERROR: tool ${call.name} is not available to role ${role}.` }));
        continue;
      }
      // Validate before anything runs or is offered for confirmation; the
      // model gets the exact problem back and can retry.
      const parsed = parseToolArgs(call.name, call.args);
      if (!parsed.ok) {
        results.push(new ToolMessage({ tool_call_id: callId, name: call.name, status: 'error', content: `ERROR: invalid arguments for ${call.name}:\n${parsed.error}` }));
        continue;
      }
      const args = parsed.args;
      if (tool.requiresConfirmation) {
        const pending: PendingAction = {
          nonce: randomBytes(16).toString('hex'),
          callId,
          tool: call.name,
          args,
          preview: previewFor(call.name, args),
          laterCallIds: calls.slice(index + 1).map((c) => c.id || ''),
          userKey,
          role,
          propertyId: actor.propertyId ?? null,
          expiresAt: Date.now() + CONFIRM_TTL_MS
        };
        return { messages: results, pending };
      }
      try {
        const result = await tool.execute(actor, args);
        results.push(new ToolMessage({ tool_call_id: callId, name: call.name, status: 'success', content: JSON.stringify(result).slice(0, 6000) }));
      } catch (error: any) {
        results.push(new ToolMessage({ tool_call_id: callId, name: call.name, status: 'error', content: `ERROR: ${String(error?.message || error)}` }));
      }
    }
    return { messages: results };
  };

  // Pauses until the user decides. Only interrupt() runs before the decision,
  // so re-running this node on resume cannot repeat any side effect.
  const confirm = async (state: AgentStateType) => {
    const pending = state.pending!;
    const decision = interrupt({ tool: pending.tool, preview: pending.preview }) as ResumeDecision;
    const skipped = pending.laterCallIds.map((id) => new ToolMessage({
      tool_call_id: id, name: 'skipped', status: 'error', content: 'NOT RUN: an earlier action in this step needed confirmation. Ask again if it is still needed.'
    }));
    const close = (toolContent: string, status: 'success' | 'error', reply: string) => ({
      messages: [
        new ToolMessage({ tool_call_id: pending.callId, name: pending.tool, status, content: toolContent }),
        ...skipped,
        new AIMessage(reply)
      ],
      pending: null,
      outcome: reply
    });

    if (decision?.action === 'cancel') return close('CANCELED by the user. Nothing was changed.', 'error', 'Canceled. Nothing was changed.');
    if (decision?.action !== 'confirm') return close('NOT CONFIRMED: the user moved on. Nothing was changed.', 'error', 'I did not run that action because it was not confirmed.');

    const tool = toolCatalogue[pending.tool];
    if (!tool || !tool.roles.includes(role)) {
      return close('ERROR: no longer valid for this persona.', 'error', 'That confirmation is no longer valid for this persona. Please ask again.');
    }
    try {
      const execArgs = pending.tool === 'create_booking_request' ? { ...pending.args, idempotency_key: `idem_${pending.nonce}` } : pending.args;
      const result = await tool.execute(actor, execArgs);
      return close(JSON.stringify(result).slice(0, 6000), 'success', `Done. ${pending.preview} Result: ${JSON.stringify(result)}`);
    } catch (error: any) {
      const code = String(error?.message || error);
      const reason = code === 'FORBIDDEN' ? 'That is outside your access' : code;
      return close(`ERROR: ${code}`, 'error', `I could not complete that: ${reason}. Nothing was changed.`);
    }
  };

  const afterAgent = (state: AgentStateType) => {
    const last = state.messages[state.messages.length - 1] as AIMessage;
    return (last.tool_calls?.length || last.invalid_tool_calls?.length) ? 'tools' : END;
  };
  const afterTools = (state: AgentStateType) => (state.pending ? 'confirm' : 'agent');

  return new StateGraph(AgentState)
    .addNode('agent', agent)
    .addNode('tools', tools)
    .addNode('confirm', confirm)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', afterAgent, ['tools', END])
    .addConditionalEdges('tools', afterTools, ['agent', 'confirm'])
    .addEdge('confirm', END)
    .compile({ checkpointer });
}

type AgentGraph = Awaited<ReturnType<typeof buildAgentGraph>>;

async function pausedAction(graph: AgentGraph, threadId: string): Promise<PendingAction | null> {
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  return snapshot.next.includes('confirm') ? (snapshot.values as AgentStateType).pending : null;
}

/**
 * Run name, tags and metadata for tracing. With LANGSMITH_TRACING=true every
 * agent run (model calls, tool calls, pauses) appears in LangSmith under these.
 */
function traceOptions(threadId: string, role: string, kind: 'turn' | ResumeDecision['action']) {
  return {
    runName: `livingplus-agent:${kind}`,
    tags: ['livingplus', `role:${role.toLowerCase()}`],
    metadata: { thread_id: threadId, role, kind }
  };
}

async function resume(graph: AgentGraph, threadId: string, action: ResumeDecision['action'], role: string): Promise<AgentStateType> {
  return graph.invoke(new Command({ resume: { action } }), { configurable: { thread_id: threadId }, ...traceOptions(threadId, role, action) }) as Promise<AgentStateType>;
}

async function findSession(id: string | undefined, actor: Actor): Promise<{ id: string } | null> {
  if (!id) return null;
  return db.conversationSession.findFirst({
    where: { id: String(id), ...(actor.userId ? { userId: actor.userId } : {}) },
    select: { id: true }
  }).catch(() => null);
}

export async function runChat(
  req: any,
  model: AgentModel,
  input: { message: string; sessionId?: string | undefined; confirmationId?: string | undefined; cancelConfirmationId?: string | undefined; imageDataUrl?: string | undefined }
): Promise<ChatResult> {
  const actor: Actor = await actorFromRequest(req);
  const role = ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN', 'PG_TENANT'].includes(actor.role) ? actor.role : 'GUEST';
  const userKey = actor.userId || `guest:${(req as any).ip || 'unknown'}`;
  const graph = await buildAgentGraph(model, actor, role, userKey);

  // Confirm / cancel: resume the paused thread named by the confirmation token.
  const decisionToken = input.confirmationId || input.cancelConfirmationId;
  if (decisionToken) {
    const canceling = Boolean(input.cancelConfirmationId);
    const fallbackSession = input.sessionId || '';
    const inactive = canceling ? 'That confirmation is no longer active. Nothing was changed.' : 'That confirmation expired. Please ask again and I will prepare it fresh.';
    const token = parseConfirmationId(decisionToken);
    const session = token && (!input.sessionId || input.sessionId === token.threadId) ? await findSession(token.threadId, actor) : null;
    const pending = session ? await pausedAction(graph, session.id) : null;
    if (!session || !pending || pending.nonce !== token!.nonce) return { reply: inactive, sessionId: fallbackSession };
    // Bound to the same caller, persona and PG host that prepared it.
    if (pending.userKey !== userKey || pending.role !== role || pending.propertyId !== (actor.propertyId ?? null)) {
      return { reply: inactive, sessionId: fallbackSession };
    }
    if (pending.expiresAt < Date.now()) {
      await resume(graph, session.id, 'abandon', role);
      return { reply: inactive, sessionId: session.id };
    }
    const final = await resume(graph, session.id, canceling ? 'cancel' : 'confirm', role);
    const ran = !canceling && executedThisTurn(final.messages).includes(pending.tool);
    return { reply: final.outcome || 'Done.', sessionId: session.id, ...(ran ? { toolCalls: [pending.tool] } : {}) };
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
  const config = { configurable: { thread_id: threadId }, recursionLimit: MAX_ITERATIONS * 2 + 1, ...traceOptions(threadId, role, 'turn') };

  // The user moved on instead of answering a pending confirmation: close it out.
  if (await pausedAction(graph, threadId)) await resume(graph, threadId, 'abandon', role);

  const userMessage = input.imageDataUrl
    ? new HumanMessage({ content: [{ type: 'text', text: input.message }, { type: 'image_url', image_url: { url: input.imageDataUrl } }] })
    : new HumanMessage(input.message);

  let final: AgentStateType;
  try {
    final = await graph.invoke({ messages: [userMessage], pending: null, outcome: null }, config) as AgentStateType;
  } catch (error: any) {
    if (error instanceof GraphRecursionError || error?.name === 'GraphRecursionError') {
      const reply = 'That needed more steps than I can take in one turn. Try a smaller request.';
      // Close the turn so the thread stays a valid conversation for the model.
      await graph.updateState({ configurable: { thread_id: threadId } }, { messages: [new AIMessage(reply)] }, 'agent').catch(() => undefined);
      return { reply, sessionId: threadId, toolCalls: [] };
    }
    throw error;
  }

  const executed = executedThisTurn(final.messages);
  const lastAi = [...final.messages].reverse().find((m) => AIMessage.isInstance(m));
  const usage = usageOf(lastAi);

  const pending = await pausedAction(graph, threadId);
  if (pending) {
    const confirmationId = newConfirmationId(threadId, pending.nonce);
    return {
      reply: `Before I proceed: ${pending.preview} Reply to confirm and I will run it.`,
      sessionId: threadId, needsConfirmation: { confirmationId, tool: pending.tool, preview: pending.preview }, toolCalls: executed, usage
    };
  }

  const reply = messageText(lastAi).trim() || 'I could not produce an answer. Please rephrase.';
  return { reply, sessionId: threadId, toolCalls: executed, usage };
}
