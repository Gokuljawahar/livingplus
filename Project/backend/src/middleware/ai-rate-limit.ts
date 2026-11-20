// Per-caller limits for the AI endpoints (each request costs a model call).
// Signed-in users are limited per account, guests per IP (IPv6 by /56 subnet).
// The default store is per instance; with several Cloud Run instances, use a
// shared store (e.g. Memorystore Redis) for a global limit.
import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const callerKey = (prefix: string) => (req: Request): string => {
  const userId = (req as any).user?.userId;
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
