// Voice → action for the owner's live voice session (PG Pulse Live).
//
// The owner speaks a request ("Room 102 AC complaint ah Ravi ku assign pannu").
// Gemini Live calls one of the tools below. Read tools run at once. Write
// tools never run on the first call: they are *staged* and Gemini gets a
// read-back line to say aloud. The action only runs when Gemini then calls
// confirm_action, and the server accepts that call only if
//   - the owner has actually spoken or typed again since the read-back, and
//   - the staged action has not expired (two minutes), and
//   - the same person and PG scope still apply.
// High-risk approvals (marking rent paid, KYC/booking approvals, deposit
// settlements) escalate cleanly via `hand_off_to_workspace`.
// Writes go through the same tool catalogue as the typed assistant (role gates,
// argument validation, property scope, audit rows marked "via assistant").
import { Type, type FunctionDeclaration } from '@google/genai';
import { parseToolArgs, toolCatalogue, toolParameters, type Actor, type ToolExecutor } from './ai-tools.js';
import { toFunctionDeclarations } from './ai-provider.js';

/** Tools the live voice agent may call. Reads run at once; writes are staged first. */
export const VOICE_READ_TOOLS = [
  'list_staff',
  'get_occupancy_report',
  'get_pending_rent',
  'get_expense_summary',
  'list_room_change_requests'
] as const;

export const VOICE_WRITE_TOOLS = [
  'assign_maintenance_ticket',
  'update_maintenance_status',
  'send_property_notice',
  'send_rent_reminders',
  'log_expense'
] as const;

export const STAGE_TTL_MS = 2 * 60 * 1000;

export type ActionPhase = 'proposed' | 'done' | 'cancelled' | 'failed';
export interface ActionEvent { phase: ActionPhase; summary: string }

export type HandoffTarget = 'rent' | 'bookings' | 'maintenance';
export interface HandoffEvent { target: HandoffTarget; reason: string }

const HANDOFF_TARGETS: readonly HandoffTarget[] = ['rent', 'bookings', 'maintenance'];

export interface StagedAction { tool: string; args: Record<string, any>; summary: string; stagedAt: number; heardAtStage: number }

/** One plain sentence the agent reads back and the screen shows. */
export function describeAction(tool: string, args: Record<string, any>): string {
  const clean = (value: unknown) => String(value ?? '').trim();
  switch (tool) {
    case 'assign_maintenance_ticket':
      return `Assign the maintenance ticket to ${clean(args.staff_name)}`;
    case 'update_maintenance_status':
      return `Mark the maintenance ticket as ${clean(args.status).toLowerCase().replace('_', ' ')}`;
    case 'send_property_notice':
      return `Post a notice titled "${clean(args.title)}" to every resident of ${clean(args.property_id)}: ${clean(args.message)}`;
    case 'send_rent_reminders':
      return `Send rent-due reminders${args.property_id ? ` for ${clean(args.property_id)}` : ' across your PGs'}${args.period ? ` (${clean(args.period)})` : ''}`;
    case 'log_expense':
      return `Log a ₹${Number(args.amount).toLocaleString('en-IN')} ${clean(args.category || 'other').toLowerCase()} expense for ${clean(args.property_id)}${args.note ? ` (${clean(args.note)})` : ''}`;
    default:
      return `Run ${tool}`;
  }
}

/** Function declarations Gemini Live sees: the allowed tools, handoff, confirm and cancel. */
export function voiceActionDeclarations(role: string): FunctionDeclaration[] {
  const names = [...VOICE_READ_TOOLS, ...VOICE_WRITE_TOOLS].filter((name) => toolCatalogue[name]?.roles.includes(role));
  const defs = names.map((name) => {
    const tool = toolCatalogue[name]!;
    const isWrite = (VOICE_WRITE_TOOLS as readonly string[]).includes(name);
    return {
      name,
      description: isWrite
        ? `${tool.description} Calling this only PREPARES the action. You will get a read-back to say aloud; the action runs only after the owner says yes and you call confirm_action.`
        : tool.description,
      parameters: toolParameters(tool.schema)
    };
  });
  const declarations = toFunctionDeclarations(defs);
  if (!declarations.length) return declarations;

  if (defs.some((def) => (VOICE_WRITE_TOOLS as readonly string[]).includes(def.name))) {
    declarations.push(
      { name: 'confirm_action', description: 'Run the action you prepared, but ONLY after you read it back aloud and the owner clearly said yes in a new turn.', parameters: { type: Type.OBJECT, properties: {} } },
      { name: 'cancel_action', description: 'Drop the prepared action when the owner says no, wants a change, or moves on.', parameters: { type: Type.OBJECT, properties: {} } }
    );
  }

  declarations.push({
    name: 'hand_off_to_workspace',
    description: 'Place a direct workspace button on the owner screen when a request needs human judgment or financial approval (marking rent paid, verifying KYC, approving bookings or settling deposits).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        target: { type: Type.STRING, enum: [...HANDOFF_TARGETS], description: 'Workspace tab to open: rent, bookings, or maintenance.' },
        reason: { type: Type.STRING, description: 'Short plain-language reason shown to the owner on the handoff card.' }
      },
      required: ['target', 'reason']
    }
  });
  return declarations;
}

export interface VoiceActionDeps {
  actor: Actor;
  /** Runs fn with the owner's database identity (Row-Level Security). */
  runAs: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Sends a screen event to the browser. */
  notify: (event: ActionEvent) => void;
  /** Places a workspace escalation banner on the browser screen. */
  onHandoff?: (event: HandoffEvent) => void;
  /** Override tool catalogue for unit testing without DB side effects. */
  tools?: Record<string, ToolExecutor>;
  now?: () => number;
}

/**
 * Per-session controller. `heard` is the number of owner utterances (speech
 * transcripts and typed messages) seen so far in the session.
 */
export function createVoiceActions(deps: VoiceActionDeps) {
  const now = deps.now ?? Date.now;
  const catalogue = deps.tools ?? toolCatalogue;
  let staged: StagedAction | null = null;

  async function callTool(name: string, rawArgs: unknown, heard: number): Promise<Record<string, unknown>> {
    if (name === 'confirm_action') return confirm(heard);
    if (name === 'cancel_action') return cancel();
    if (name === 'hand_off_to_workspace') return handoff(rawArgs);

    const tool = catalogue[name];
    const isWrite = (VOICE_WRITE_TOOLS as readonly string[]).includes(name);
    if (!tool || !(isWrite || (VOICE_READ_TOOLS as readonly string[]).includes(name))) return { error: 'That is not something you can do by voice.' };
    if (!tool.roles.includes(deps.actor.role)) return { error: 'This person is not allowed to do that.' };

    const parsed = deps.tools ? parseCustomArgs(tool, rawArgs) : parseToolArgs(name, rawArgs);
    if (!parsed.ok) return { error: parsed.error };

    if (!isWrite) {
      try {
        return { result: await deps.runAs(() => tool.execute(deps.actor, parsed.args)) };
      } catch (error: any) {
        return { error: errorText(error) };
      }
    }

    if (staged) deps.notify({ phase: 'cancelled', summary: staged.summary });
    staged = { tool: name, args: parsed.args, summary: describeAction(name, parsed.args), stagedAt: now(), heardAtStage: heard };
    deps.notify({ phase: 'proposed', summary: staged.summary });
    return {
      status: 'PREPARED_NOT_DONE',
      read_back: staged.summary,
      instruction: 'Nothing has changed yet. Say the read_back aloud in the owner\'s language, ask for a clear yes or no, and wait for their answer before calling confirm_action.'
    };
  }

  async function confirm(heard: number): Promise<Record<string, unknown>> {
    if (!staged) return { error: 'There is nothing prepared to confirm.' };
    if (now() - staged.stagedAt > STAGE_TTL_MS) {
      deps.notify({ phase: 'cancelled', summary: staged.summary });
      staged = null;
      return { error: 'That request timed out. Ask the owner again and prepare it fresh.' };
    }
    if (heard <= staged.heardAtStage) {
      return { error: 'The owner has not answered yet. Read it back, then wait for their yes before confirming.' };
    }
    const action = staged;
    staged = null;
    const tool = catalogue[action.tool]!;
    try {
      const result = await deps.runAs(() => tool.execute(deps.actor, action.args));
      deps.notify({ phase: 'done', summary: action.summary });
      return { done: true, result };
    } catch (error: any) {
      deps.notify({ phase: 'failed', summary: `${action.summary} (${errorText(error)})` });
      return { done: false, error: errorText(error) };
    }
  }

  function cancel(): Record<string, unknown> {
    if (!staged) return { cancelled: false, note: 'Nothing was prepared.' };
    deps.notify({ phase: 'cancelled', summary: staged.summary });
    staged = null;
    return { cancelled: true };
  }

  function handoff(rawArgs: unknown): Record<string, unknown> {
    const input = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as { target?: unknown; reason?: unknown };
    const target = String(input.target ?? '').trim() as HandoffTarget;
    const reason = String(input.reason ?? '').trim().slice(0, 200);
    if (!HANDOFF_TARGETS.includes(target)) {
      return { error: `Unknown workspace target. Use one of: ${HANDOFF_TARGETS.join(', ')}.` };
    }
    if (!reason) {
      return { error: 'Provide a short reason explaining what needs the owner’s review.' };
    }
    deps.onHandoff?.({ target, reason });
    return {
      handed_off: true,
      target,
      note: 'Tell the owner in one short sentence that you placed a workspace button on their screen so they can review and complete this safely.'
    };
  }

  return { callTool, hasStaged: () => staged !== null };
}

function parseCustomArgs(tool: ToolExecutor, args: unknown): { ok: true; args: Record<string, any> } | { ok: false; error: string } {
  const result = tool.schema.safeParse(args ?? {});
  return result.success
    ? { ok: true, args: result.data as Record<string, any> }
    : { ok: false, error: result.error.message };
}

function errorText(error: unknown): string {
  const text = String((error as { message?: string })?.message || error || 'failed');
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
