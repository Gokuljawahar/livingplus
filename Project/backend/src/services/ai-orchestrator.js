// One role-aware orchestrator (PG OS §8): model reasons, backend tools
// execute. Sensitive tools pause for explicit user confirmation; the backend
// — never the model — decides what runs.
import { randomUUID } from 'crypto';
import { prisma } from '../app.js';
import { actorFromRequest, toolCatalogue, toolDefinitionsFor } from './ai-tools.js';
const db = new Proxy({}, {
    get: (_target, property) => prisma[property]
});
const MAX_ITERATIONS = 6;
const HISTORY_LIMIT = 20;
const CONFIRM_TTL_MS = 10 * 60 * 1000;
const pendingConfirmations = new Map();
function roleSystemPrompt(role) {
    const shared = [
        'You are the PG OS assistant for a paying-guest housing platform.',
        'Use backend tools for every operational fact: properties, availability, rent, bookings.',
        'Never invent availability, prices, booking references or payment outcomes.',
        'If constraints are missing, ask one focused question instead of guessing.',
        'If the user attached a maintenance photo, use what you see to propose create_maintenance_ticket with an interpreted title, category and description. If the photo is blurry or unrelated, ask for a clearer photo instead of guessing.',
        'If a request is outside the caller’s role or property scope, refuse briefly and offer what you can do.',
        'Every tool available to you in this conversation is already authorized for this caller. Never tell the user a listed tool is unavailable to their role. When a tool fits the request, call it with concrete arguments instead of answering from general knowledge or asking the user to do it elsewhere. When an argument such as a property ID is missing, either look it up with a search tool first or ask one focused question, then call the tool.',
        'For actions that need confirmation (booking requests, tickets, expenses, notifications), call the tool as soon as you have the details. The system pauses for user confirmation automatically, so never substitute a prose confirmation question for the tool call.'
    ];
    if (role === 'PG_OWNER' || role === 'SUPER_ADMIN' || role === 'PG_WARDEN') {
        return [...shared, 'You serve operations staff. Summarize occupancy, dues and property expenses from tool results with period and scope. You may log property expenses and send rent reminders or notifications through their tools, always pausing for explicit confirmation first. Never mark rent paid or approve tenants yourself; direct those to the workspace workflows.'].join('\n');
    }
    return [...shared, 'You serve residents and guests. Help discover PGs, check availability, prepare booking requests and maintenance reports. Booking and ticket creation need explicit confirmation.'].join('\n');
}
function previewFor(tool, args) {
    if (tool === 'create_booking_request') {
        return `Create a PENDING booking for ${args.resident_name || 'the resident'} (${args.phone || 'no phone'}) — bed ${args.bed_id}, move-in ${args.move_in_date}. The owner must still approve it.`;
    }
    if (tool === 'create_maintenance_ticket') {
        return `File a maintenance ticket: ${args.title || 'untitled'} — ${(args.description || '').slice(0, 140)}.`;
    }
    if (tool === 'send_rent_reminders') {
        return `Send rent-due reminders for ${args.period || 'all open periods'}${args.property_id ? ' (one property)' : ' (all my properties)'}. Residents who were reminded recently are skipped unless forced.`;
    }
    if (tool === 'log_expense') {
        return `Record a ${args.category || 'general'} expense of ${args.amount} for ${args.spent_on || 'today'}${args.note ? ` (${args.note})` : ''}. This writes to the ledger.`;
    }
    if (tool === 'propose_electricity_split') {
        return `Propose an electricity split of ${args.total_amount} for ${args.period}. No one is billed yet; approval creates the ledger entries.`;
    }
    if (tool === 'approve_electricity_bill') {
        return `Approve the drafted electricity bill and create one ledger entry per tenant. Tenants will see the charge with their rent.`;
    }
    if (tool === 'set_meal_preference') {
        return args.opt_out ? 'Opt out of the monthly food charge from the next billing cycle.' : 'Opt back in to the monthly food charge.';
    }
    if (tool === 'send_notification') {
        return `Send template "${args.template}" to ${args.recipient_phone}.`;
    }
    return `Run ${tool} with the provided arguments.`;
}
export async function runChat(req, provider, input) {
    const actor = await actorFromRequest(req);
    const role = ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN', 'PG_TENANT'].includes(actor.role) ? actor.role : 'GUEST';
    const userKey = actor.userId || `guest:${req.ip || 'unknown'}`;
    // Confirmation resume path: execute a previously previewed sensitive call.
    if (input.confirmationId) {
        const pending = pendingConfirmations.get(input.confirmationId);
        if (!pending || pending.userKey !== userKey || pending.expiresAt < Date.now()) {
            pendingConfirmations.delete(input.confirmationId);
            return { reply: 'That confirmation expired. Please ask again and I will prepare it fresh.', sessionId: input.sessionId || '' };
        }
        pendingConfirmations.delete(input.confirmationId);
        const tool = toolCatalogue[pending.tool];
        if (!tool)
            return { reply: 'That confirmation is no longer valid. Please ask again.', sessionId: input.sessionId || '' };
        try {
            const execArgs = pending.tool === 'create_booking_request' ? { ...pending.args, idempotency_key: pending.idemKey } : pending.args;
            const result = await tool.execute(actor, execArgs);
            return {
                reply: `Done. ${previewFor(pending.tool, pending.args)} Result: ${JSON.stringify(result)}`,
                sessionId: input.sessionId || '', toolCalls: [pending.tool]
            };
        }
        catch (error) {
            return { reply: `I could not complete that: ${String(error?.message || error)}. Nothing was changed.`, sessionId: input.sessionId || '' };
        }
    }
    // Session history (short-lived conversational context, PG OS §10).
    let session = null;
    if (input.sessionId) {
        session = await db.conversationSession.findFirst({
            where: { id: String(input.sessionId), ...(actor.userId ? { userId: actor.userId } : {}) }
        }).catch(() => null);
    }
    const history = session ? JSON.parse(session.stateJson || '[]') : [];
    const messages = [
        { role: 'system', content: roleSystemPrompt(role) },
        ...history.slice(-HISTORY_LIMIT),
        { role: 'user', content: input.message, ...(input.imageDataUrl ? { images: [input.imageDataUrl] } : {}) }
    ];
    const tools = toolDefinitionsFor(role);
    const executed = [];
    let usage;
    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
        const response = await provider.complete(messages, tools);
        usage = response.usage;
        const message = response.message;
        messages.push({ role: 'assistant', content: message.content, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) });
        if (!message.tool_calls?.length) {
            const reply = message.content?.trim() || 'I could not produce an answer. Please rephrase.';
            const saved = await persistSession(session, actor, [...history, { role: 'user', content: input.message }, { role: 'assistant', content: reply }], true);
            return { reply, sessionId: saved, toolCalls: executed, usage };
        }
        for (const call of message.tool_calls) {
            const tool = toolCatalogue[call.name];
            if (!tool || (!tool.roles.includes(role) && !tool.roles.includes('GUEST'))) {
                messages.push({ role: 'tool', tool_call_id: call.id, content: `ERROR: tool ${call.name} is not available to role ${role}.` });
                continue;
            }
            let args = {};
            try {
                args = JSON.parse(call.arguments || '{}');
            }
            catch {
                messages.push({ role: 'tool', tool_call_id: call.id, content: 'ERROR: arguments were not valid JSON.' });
                continue;
            }
            if (tool.requiresConfirmation) {
                const confirmationId = `cfm_${randomUUID().replace(/-/g, '')}`;
                pendingConfirmations.set(confirmationId, { userKey, tool: call.name, args, preview: previewFor(call.name, args), expiresAt: Date.now() + CONFIRM_TTL_MS, idemKey: `idem_${confirmationId}` });
                const saved = await persistSession(session, actor, [...history, { role: 'user', content: input.message }], true);
                return {
                    reply: `Before I proceed: ${previewFor(call.name, args)} Reply to confirm and I will run it.`,
                    sessionId: saved, needsConfirmation: { confirmationId, tool: call.name, preview: previewFor(call.name, args) }, toolCalls: executed, usage
                };
            }
            try {
                const result = await tool.execute(actor, args);
                executed.push(call.name);
                messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
            }
            catch (error) {
                messages.push({ role: 'tool', tool_call_id: call.id, content: `ERROR: ${String(error?.message || error)}` });
            }
        }
    }
    const saved = await persistSession(session, actor, [...history, { role: 'user', content: input.message }], true);
    return { reply: 'That needed more steps than I can take in one turn. Try a smaller request.', sessionId: saved, toolCalls: executed, usage };
}
async function persistSession(session, actor, history, create = false) {
    const stateJson = JSON.stringify(history.slice(-HISTORY_LIMIT).map((m) => (m.images?.length ? { role: m.role, content: `${m.content || ''}\n[photo attached earlier]` } : m)));
    try {
        if (session && !create) {
            await db.conversationSession.update({ where: { id: session.id }, data: { stateJson } });
            return session.id;
        }
        if (session) {
            await db.conversationSession.update({ where: { id: session.id }, data: { stateJson } });
            return session.id;
        }
        const created = await db.conversationSession.create({
            data: { userId: actor.userId, channel: 'web', role: actor.role, stateJson }
        });
        return created.id;
    }
    catch {
        return session?.id || '';
    }
}
//# sourceMappingURL=ai-orchestrator.js.map