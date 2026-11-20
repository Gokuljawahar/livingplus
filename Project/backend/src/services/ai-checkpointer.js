import { prisma } from '../app.js';
const db = new Proxy({}, {
    get: (_target, property) => prisma[property]
});
const freshState = () => ({ history: [], pending: null });
function isContent(value) {
    return Boolean(value) && typeof value === 'object' && Array.isArray(value.parts);
}
/** Reads a thread's durable state; missing or corrupt rows start empty. */
export async function loadThreadState(sessionId) {
    const row = await db.conversationSession.findUnique({ where: { id: sessionId }, select: { stateJson: true } }).catch(() => null);
    if (!row || typeof row.stateJson !== 'string' || !row.stateJson)
        return freshState();
    let parsed;
    try {
        parsed = JSON.parse(row.stateJson);
    }
    catch {
        return freshState();
    }
    if (Array.isArray(parsed))
        return { history: parsed.filter(isContent), pending: null };
    if (!parsed || typeof parsed !== 'object')
        return freshState();
    const state = parsed;
    return {
        history: Array.isArray(state.history) ? state.history.filter(isContent) : [],
        pending: state.pending && typeof state.pending === 'object' ? state.pending : null
    };
}
/** Persists a thread's durable state. */
export async function saveThreadState(sessionId, state) {
    await db.conversationSession.update({ where: { id: sessionId }, data: { stateJson: JSON.stringify(state) } });
}
/** No pools to drain; state lives in PostgreSQL behind Prisma. Kept for shutdown callers. */
export async function closeCheckpointer() {
}
//# sourceMappingURL=ai-checkpointer.js.map