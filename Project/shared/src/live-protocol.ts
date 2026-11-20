// Typed WebSocket protocol between the browser and the Gemini Live relay
// (used by both VibeCheck and the owner's hands-free voice briefing).
// Defined once in @livingplus/shared; each app passes its own `z` (keeping
// @livingplus/shared zero-dependency at both runtime and type-check time).
import type { VibeAnswers } from './vibecheck.js';

const BASE64_AUDIO = /^[A-Za-z0-9+/=]+$/;

export type LiveClientMessage =
  | { type: 'audio'; data: string }
  | { type: 'text'; text: string }
  | { type: 'pause' };

export type LiveServerMessage =
  | { type: 'ready' }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'heard'; text: string }
  | { type: 'said'; text: string }
  | { type: 'interrupted' }
  | { type: 'turn' }
  | { type: 'habits'; answers: VibeAnswers; summary: string | null; done: boolean; missing?: string[] | undefined }
  | { type: 'error'; message: string }
  | { type: 'end'; reason?: string | undefined };

export interface SafeParseResult<T = unknown> {
  success: boolean;
  data?: T;
}

export interface LiveMessageSchema<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

/** Structural subset of Zod v4 used to build the live protocol schemas without importing `zod` in @livingplus/shared. */
export interface ZodLike {
  discriminatedUnion(discriminator: string, options: readonly any[]): { safeParse(input: unknown): SafeParseResult };
  object(shape: Record<string, any>): any;
  literal(value: string): any;
  string(): any;
  number(): any;
  boolean(): any;
  record(key: any, value: any): any;
  array(element: any): any;
}

export interface LiveProtocol {
  liveClientMessageSchema: LiveMessageSchema<LiveClientMessage>;
  liveServerMessageSchema: LiveMessageSchema<LiveServerMessage>;
  parseLiveClientMessage(raw: unknown): LiveClientMessage | null;
  parseLiveServerMessage(raw: unknown): LiveServerMessage | null;
}

export function createLiveProtocol(z: ZodLike): LiveProtocol {
  const liveClientMessageSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('audio'),
      data: z.string().min(1).max(199_999).regex(BASE64_AUDIO)
    }),
    z.object({
      type: z.literal('text'),
      text: z
        .string()
        .transform((value: string) => value.trim())
        .pipe(z.string().min(1))
        .transform((value: string) => value.slice(0, 1000))
    }),
    z.object({
      type: z.literal('pause')
    })
  ]) as LiveMessageSchema<LiveClientMessage>;

  const liveServerMessageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('ready') }),
    z.object({
      type: z.literal('audio'),
      data: z.string().min(1),
      mimeType: z.string().default('audio/pcm;rate=24000')
    }),
    z.object({ type: z.literal('heard'), text: z.string() }),
    z.object({ type: z.literal('said'), text: z.string() }),
    z.object({ type: z.literal('interrupted') }),
    z.object({ type: z.literal('turn') }),
    z.object({
      type: z.literal('habits'),
      answers: z.record(z.string(), z.number().int().min(0).max(2)),
      summary: z.string().nullable(),
      done: z.boolean(),
      missing: z.array(z.string()).optional()
    }),
    z.object({ type: z.literal('error'), message: z.string() }),
    z.object({ type: z.literal('end'), reason: z.string().optional() })
  ]) as LiveMessageSchema<LiveServerMessage>;

  function parseLiveClientMessage(raw: unknown): LiveClientMessage | null {
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const result = liveClientMessageSchema.safeParse(parsed);
      return result.success ? (result.data as LiveClientMessage) : null;
    } catch {
      return null;
    }
  }

  function parseLiveServerMessage(raw: unknown): LiveServerMessage | null {
    try {
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const result = liveServerMessageSchema.safeParse(parsed);
      return result.success ? (result.data as LiveServerMessage) : null;
    } catch {
      return null;
    }
  }

  return { liveClientMessageSchema, liveServerMessageSchema, parseLiveClientMessage, parseLiveServerMessage };
}
