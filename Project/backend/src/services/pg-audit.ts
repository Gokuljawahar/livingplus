import { prisma } from '../app.js';

const db = new Proxy({} as Record<string, any>, {
  get: (_target, property) => (prisma as any)[property]
});

// Fire-and-forget: audit writes must never break an operation.
export function logAudit(
  propertyId: string,
  actorId: string | null | undefined,
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  detail?: string | null
): void {
  void db.pHAuditLog
    .create({ data: { propertyId, actorId: actorId || null, action, entityType: entityType || null, entityId: entityId || null, detail: detail || null } })
    .catch((error: unknown) => console.error('[PG audit] write failed:', error));
}
