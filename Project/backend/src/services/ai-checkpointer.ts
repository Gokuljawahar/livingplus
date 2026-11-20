// Durable assistant threads: conversation history and paused confirmations
// survive restarts and work across Cloud Run instances. Stored as JSON in
// ConversationSession.stateJson (PostgreSQL), so threads need no extra tables,
// schemas or connection pools. Rows left by earlier versions hold a bare
// history array (or the "[]" default) and load as threads without pauses.
import type { Content } from '@google/genai';
import { prisma } from '../app.js';

const db = new Proxy({} as Record<string, any>, {
  get: (_target, property) => (prisma as any)[property]
});

/** A sensitive call the thread is paused on, bound to who may confirm it. */
export interface PendingAction {
  nonce: string;
  callId: string;
  tool: string;
  args: any;
  preview: string;
  /** Later calls from the same model turn, answered once this one resolves. */
  laterCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  userKey: string;
  role: string;
  propertyId: string | null;
  expiresAt: number;
}

export interface ChatThreadState {
  history: Content[];
  pending: PendingAction | null;
}

const freshState = (): ChatThreadState => ({ history: [], pending: null });

function isContent(value: unknown): value is Content {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as Content).parts);
}

/** Reads a thread's durable state; missing or corrupt rows start empty. */
export async function loadThreadState(sessionId: string): Promise<ChatThreadState> {
  const row = await db.conversationSession.findUnique({ where: { id: sessionId }, select: { stateJson: true } }).catch(() => null);
  if (!row || typeof row.stateJson !== 'string' || !row.stateJson) return freshState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.stateJson);
  } catch {
    return freshState();
  }
  if (Array.isArray(parsed)) return { history: parsed.filter(isContent), pending: null };
  if (!parsed || typeof parsed !== 'object') return freshState();
  const state = parsed as Partial<ChatThreadState>;
  return {
    history: Array.isArray(state.history) ? state.history.filter(isContent) : [],
    pending: state.pending && typeof state.pending === 'object' ? (state.pending as PendingAction) : null
  };
}

/** Persists a thread's durable state. */
export async function saveThreadState(sessionId: string, state: ChatThreadState): Promise<void> {
  await db.conversationSession.update({ where: { id: sessionId }, data: { stateJson: JSON.stringify(state) } });
}

/** No pools to drain; state lives in PostgreSQL behind Prisma. Kept for shutdown callers. */
export async function closeCheckpointer(): Promise<void> {
}
