import { prisma } from '../app.js';
import { logger } from '../utils/logger.js';
const db = new Proxy({}, {
    get: (_target, property) => prisma[property]
});
// Fire-and-forget: audit writes must never break an operation.
export function logAudit(propertyId, actorId, action, entityType, entityId, detail) {
    void db.pHAuditLog
        .create({ data: { propertyId, actorId: actorId || null, action, entityType: entityType || null, entityId: entityId || null, detail: detail || null } })
        .catch((error) => logger.error({ err: error }, '[PG audit] write failed'));
}
//# sourceMappingURL=pg-audit.js.map