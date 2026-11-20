import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
const callerKey = (prefix) => (req) => {
    const userId = req.user?.userId;
    return userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${ipKeyGenerator(req.ip || 'unknown')}`;
};
const perMinute = () => Math.max(1, Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 20);
export const aiChatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: perMinute,
    keyGenerator: callerKey('chat'),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many AI requests. Slow down and retry.' }
});
export const aiVoiceLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: perMinute,
    keyGenerator: callerKey('voice'),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many voice requests. Slow down and retry.' }
});
// Each search embeds the query; typed searches are debounced client-side.
export const semanticSearchLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: () => Math.max(1, Number(process.env.SEARCH_RATE_LIMIT_PER_MINUTE) || 60),
    keyGenerator: callerKey('search'),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many searches. Slow down and retry.' }
});
//# sourceMappingURL=ai-rate-limit.js.map