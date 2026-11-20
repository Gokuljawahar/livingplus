import { prisma } from '../app.js';
import { logger } from '../utils/logger.js';

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
    .catch((error: unknown) => logger.error({ err: error }, '[PG audit] write failed'));
}
