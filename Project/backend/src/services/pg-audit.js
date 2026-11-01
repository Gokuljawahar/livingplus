import { prisma } from '../app.js';
const db = new Proxy({}, {
    get: (_target, property) => prisma[property]
});
// Fire-and-forget: audit writes must never break an operation.
export function logAudit(propertyId, actorId, action, entityType, entityId, detail) {
    void db.pHAuditLog
        .create({ data: { propertyId, actorId: actorId || null, action, entityType: entityType || null, entityId: entityId || null, detail: detail || null } })
        .catch((error) => console.error('[PG audit] write failed:', error));
}
//# sourceMappingURL=pg-audit.js.map