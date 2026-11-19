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
const storage = new AsyncLocalStorage();
const anonymous = () => ({ userId: null, role: null, tokenPropertyId: null, hostPropertyId: null, system: false });
/** Outside any request: 'deny' (production default) or 'system' (test fixtures only). */
let outsideRequests = 'deny';
export function setOutsideRequestScope(scope) {
    outsideRequests = scope;
}
export function currentDbContext() {
    const store = storage.getStore();
    if (store)
        return store;
    return outsideRequests === 'system' ? { ...anonymous(), system: true } : anonymous();
}
/** The PG a query is limited to: the request's PG, else the token's. */
export function scopedPropertyId(context) {
    return context.hostPropertyId || context.tokenPropertyId;
}
const CONTEXT_KEY = Symbol('dbContext');
/** Starts an anonymous context for the request. Mount after the body parsers. */
export function dbContextMiddleware(req, _res, next) {
    const context = anonymous();
    req[CONTEXT_KEY] = context;
    storage.run(context, next);
}
/**
 * Re-enters the request's context. Stream-based middleware (multipart uploads)
 * calls next() from a stream callback, which loses the async context; without
 * this, later queries would run with no identity and be refused.
 */
export function rebindDbContext(req, _res, next) {
    const context = req[CONTEXT_KEY];
    if (context)
        storage.run(context, next);
    else
        next();
}
/** Records the authenticated caller (from the verified JWT). */
export function setDbUser(req, user) {
    const context = req[CONTEXT_KEY] ?? storage.getStore();
    if (!context || !user)
        return;
    context.userId = typeof user.userId === 'string' ? user.userId : null;
    context.role = typeof user.role === 'string' ? user.role : null;
    context.tokenPropertyId = typeof user.propertyId === 'string' ? user.propertyId : null;
}
/** Records the PG the request is scoped to. */
export function setDbHostProperty(req, propertyId) {
    const context = req[CONTEXT_KEY] ?? storage.getStore();
    if (context)
        context.hostPropertyId = propertyId ?? null;
}
/**
 * Runs fn as the system, bypassing Row-Level Security. Use only where the code
 * has already authorized the work and it must span PGs by design. Every call
 * site names its reason; keep this list short and reviewed.
 */
export function asSystem(reason, fn) {
    void reason;
    // Await inside the context: Prisma queries are lazy and would otherwise run
    // when the caller awaits them, after the context has ended.
    return storage.run({ ...currentDbContext(), system: true }, async () => await fn());
}
/** Runs fn as the given caller (tests and tools that act for a known user). */
export function runAsDbUser(context, fn) {
    return storage.run({ ...anonymous(), ...context, system: false }, async () => await fn());
}
/** Route wrapper for public endpoints that work across PGs by design (see asSystem). */
export function systemRoute(reason, handler) {
    return (req, res) => asSystem(reason, async () => handler(req, res));
}
//# sourceMappingURL=context.js.map