// WhatsApp-native assistant (buildathon answers Q4/Q13): residents and guests
// message the PG's WhatsApp number and the same chat assistant replies.
// Off unless ENABLE_WHATSAPP_CLOUD_API=true with WHATSAPP_TOKEN,
// WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN set.
//
// - A sender with an active stay is answered as that resident (same tools and
//   Row-Level Security as the resident site); anyone else as a guest.
// - Actions that need confirmation are confirmed by replying YES (or NO).
// - Every webhook is checked against Meta's X-Hub-Signature-256.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../app.js';
import { asSystem, runAsDbUser } from '../db/context.js';
import { logger } from '../utils/logger.js';
export const whatsappInboundEnabled = () => process.env.ENABLE_WHATSAPP_CLOUD_API === 'true' && Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
/** Meta's subscription handshake: echo the challenge when the verify token matches. */
export function verifySubscription(query) {
    const token = String(query['hub.verify_token'] || '');
    const expected = process.env.WHATSAPP_VERIFY_TOKEN || '';
    if (query['hub.mode'] !== 'subscribe' || !expected || token.length !== expected.length)
        return null;
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected)) ? String(query['hub.challenge'] || '') : null;
}
/** True when the raw body was signed with our app secret. */
export function validSignature(rawBody, header) {
    const secret = process.env.WHATSAPP_APP_SECRET || '';
    if (!secret || !header?.startsWith('sha256='))
        return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
    const given = Buffer.from(header.slice('sha256='.length));
    return expected.length === given.length && timingSafeEqual(expected, given);
}
export function textMessages(payload) {
    const out = [];
    for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            for (const message of change?.value?.messages ?? []) {
                if (message?.type === 'text' && message.text?.body && message.from) {
                    out.push({ id: String(message.id), from: String(message.from).replace(/\D/g, ''), text: String(message.text.body).slice(0, 2000) });
                }
            }
        }
    }
    return out;
}
// Per-number conversation state (instance memory: a fresh thread after a restart is acceptable).
const conversations = new Map();
const seen = new Map();
const CONVERSATION_TTL_MS = 6 * 60 * 60 * 1000;
function remember(phone, state) {
    conversations.set(phone, { ...state, at: Date.now() });
    if (conversations.size > 5000)
        for (const [key, value] of conversations)
            if (Date.now() - value.at > CONVERSATION_TTL_MS)
                conversations.delete(key);
}
/** The resident account and stay behind a WhatsApp number, if any (a system lookup: the sender is not signed in). */
async function residentFor(phone) {
    const last10 = phone.slice(-10);
    return asSystem('WhatsApp: match the sender to a resident account', async () => {
        const tenant = await prisma.pGTenant.findFirst({
            where: { phone: { endsWith: last10 }, status: { in: ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'] } },
            orderBy: { createdAt: 'desc' },
            select: { propertyId: true }
        });
        if (!tenant)
            return null;
        const user = await prisma.user.findFirst({ where: { phone: { endsWith: last10 }, role: 'PG_TENANT' }, select: { id: true } });
        return user ? { userId: user.id, propertyId: tenant.propertyId } : null;
    });
}
export async function sendWhatsAppText(to, body) {
    const version = process.env.WHATSAPP_VERSION || 'v21.0';
    const response = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body: body.slice(0, 4000) } })
    });
    if (!response.ok)
        throw new Error(`WhatsApp send failed: ${response.status}`);
}
const YES = /^(yes|y|confirm|ok|haan|ஆம்|हाँ|हां)\b/i;
const NO = /^(no|n|cancel|stop|வேண்டாம்|नहीं)\b/i;
/** Answers one inbound text with the assistant. Duplicate deliveries (Meta retries) are ignored. */
export async function handleInboundText(message, deps) {
    if (seen.has(message.id))
        return null;
    seen.set(message.id, Date.now());
    if (seen.size > 10000)
        seen.delete(seen.keys().next().value);
    const send = deps.send ?? sendWhatsAppText;
    const state = conversations.get(message.from);
    const resident = await residentFor(message.from);
    const req = resident
        ? { user: { userId: resident.userId, role: 'PG_TENANT', propertyId: resident.propertyId }, pgPropertyId: resident.propertyId, ip: `whatsapp:${message.from}` }
        : { user: undefined, ip: `whatsapp:${message.from}` };
    const input = { message: message.text, ...(state?.sessionId ? { sessionId: state.sessionId } : {}) };
    if (state?.confirmationId && YES.test(message.text.trim()))
        input.confirmationId = state.confirmationId;
    else if (state?.confirmationId && NO.test(message.text.trim()))
        input.cancelConfirmationId = state.confirmationId;
    const run = () => deps.chat(req, input);
    const result = resident
        ? await runAsDbUser({ userId: resident.userId, role: 'PG_TENANT', tokenPropertyId: resident.propertyId, hostPropertyId: resident.propertyId }, run)
        : await runAsDbUser({}, run);
    const reply = result.needsConfirmation
        ? `${result.reply}\n\n${result.needsConfirmation.preview}\nReply YES to confirm or NO to cancel.`
        : result.reply;
    remember(message.from, { sessionId: result.sessionId, ...(result.needsConfirmation ? { confirmationId: result.needsConfirmation.confirmationId } : {}) });
    try {
        await send(message.from, reply);
    }
    catch (error) {
        logger.error({ err: error }, 'WhatsApp reply failed');
    }
    return reply;
}
/** Test hook. */
export function resetWhatsAppStateForTests() {
    conversations.clear();
    seen.clear();
}
//# sourceMappingURL=whatsapp-inbound.js.map