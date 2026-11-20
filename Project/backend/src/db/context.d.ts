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
export declare function setOutsideRequestScope(scope: 'deny' | 'system'): void;
export declare function currentDbContext(): DbContext;
/** The PG a query is limited to: the request's PG, else the token's. */
export declare function scopedPropertyId(context: DbContext): string | null;
/** Starts an anonymous context for the request. Mount after the body parsers. */
export declare function dbContextMiddleware(req: Request, _res: Response, next: NextFunction): void;
/**
 * Re-enters the request's context. Stream-based middleware (multipart uploads)
 * calls next() from a stream callback, which loses the async context; without
 * this, later queries would run with no identity and be refused.
 */
export declare function rebindDbContext(req: Request, _res: Response, next: NextFunction): void;
/** Records the authenticated caller (from the verified JWT). */
export declare function setDbUser(req: Request, user: {
    userId?: unknown;
    role?: unknown;
    propertyId?: unknown;
} | null | undefined): void;
/** Records the PG the request is scoped to. */
export declare function setDbHostProperty(req: Request, propertyId: string | undefined): void;
/**
 * Runs fn as the system, bypassing Row-Level Security. Use only where the code
 * has already authorized the work and it must span PGs by design. Every call
 * site names its reason; keep this list short and reviewed.
 */
export declare function asSystem<T>(reason: string, fn: () => Promise<T>): Promise<T>;
/** Runs fn as the given caller (tests and tools that act for a known user). */
export declare function runAsDbUser<T>(context: Partial<DbContext>, fn: () => Promise<T>): Promise<T>;
/** Route wrapper for public endpoints that work across PGs by design (see asSystem). */
export declare function systemRoute<Req, Res>(reason: string, handler: (req: Req, res: Res) => unknown): (req: Req, res: Res) => Promise<unknown>;
//# sourceMappingURL=context.d.ts.map