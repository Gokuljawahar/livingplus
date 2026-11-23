// Who a database query runs for. Every HTTP request gets its own context
// (dbContextMiddleware); authentication and PG host resolution fill it in, and
// the Prisma client (db/client.ts) hands it to PostgreSQL, whose Row-Level
// Security policies then decide which rows the query may touch.
//
// Outside a request there is no identity, so queries fail closed (they see only
// public listings) unless the code says otherwise with asSystem(): scheduled
// jobs, migrations-time tasks and the few public flows that create or look up
// data across PGs by design (registration, guest bookings, OTP, sign-in).
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export interface DbContext {
  userId: string | null;
  /** JWT role: PG_OWNER, PG_WARDEN or PG_TENANT (null for guests). */
  role: string | null;
  /** The PG a resident token or staff token was issued for. */
  tokenPropertyId: string | null;
  /** The PG the request is scoped to (resident site slug or PG host). */
  hostPropertyId: string | null;
  /** Runs as the tables' owner, bypassing RLS. Only via asSystem(). */
  system: boolean;
}

const storage = new AsyncLocalStorage<DbContext>();
const anonymous = (): DbContext => ({ userId: null, role: null, tokenPropertyId: null, hostPropertyId: null, system: false });

/** Outside any request: 'deny' (production default) or 'system' (test fixtures only). */
let outsideRequests: 'deny' | 'system' = 'deny';
export function setOutsideRequestScope(scope: 'deny' | 'system'): void {
  outsideRequests = scope;
}

export function currentDbContext(): DbContext {
  const store = storage.getStore();
  if (store) return store;
  return outsideRequests === 'system' ? { ...anonymous(), system: true } : anonymous();
}

/** The PG a query is limited to: the request's PG, else the token's. */
export function scopedPropertyId(context: DbContext): string | null {
  return context.hostPropertyId || context.tokenPropertyId;
}

const CONTEXT_KEY = Symbol('dbContext');

/** Starts an anonymous context for the request. Mount after the body parsers. */
export function dbContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const context = anonymous();
  (req as any)[CONTEXT_KEY] = context;
  storage.run(context, next);
}

/**
 * Re-enters the request's context. Stream-based middleware (multipart uploads)
 * calls next() from a stream callback, which loses the async context; without
 * this, later queries would run with no identity and be refused.
 */
export function rebindDbContext(req: Request, _res: Response, next: NextFunction): void {
  const context = (req as any)[CONTEXT_KEY] as DbContext | undefined;
  if (context) storage.run(context, next);
  else next();
}

/** Records the authenticated caller (from the verified JWT). */
export function setDbUser(req: Request, user: { userId?: unknown; role?: unknown; propertyId?: unknown } | null | undefined): void {
  const context = ((req as any)[CONTEXT_KEY] as DbContext | undefined) ?? storage.getStore();
  if (!context || !user) return;
  context.userId = typeof user.userId === 'string' ? user.userId : null;
  context.role = typeof user.role === 'string' ? user.role : null;
  context.tokenPropertyId = typeof user.propertyId === 'string' ? user.propertyId : null;
}

/** Records the PG the request is scoped to. */
export function setDbHostProperty(req: Request, propertyId: string | undefined): void {
  const context = ((req as any)[CONTEXT_KEY] as DbContext | undefined) ?? storage.getStore();
  if (context) context.hostPropertyId = propertyId ?? null;
}

/**
 * Runs fn as the system, bypassing Row-Level Security. Use only where the code
 * has already authorized the work and it must span PGs by design. Every call
 * site names its reason; keep this list short and reviewed.
 */
export function asSystem<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  void reason;
  // Await inside the context: Prisma queries are lazy and would otherwise run
  // when the caller awaits them, after the context has ended.
  return storage.run({ ...currentDbContext(), system: true }, async () => await fn());
}

/** Runs fn as the given caller (tests and tools that act for a known user). */
export function runAsDbUser<T>(context: Partial<DbContext>, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...anonymous(), ...context, system: false }, async () => await fn());
}

/** Route wrapper for public endpoints that work across PGs by design (see asSystem). */
export function systemRoute<Req, Res>(reason: string, handler: (req: Req, res: Res) => unknown) {
  return (req: Req, res: Res): Promise<unknown> => asSystem(reason, async () => handler(req, res));
}
