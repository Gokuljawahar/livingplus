// Edge-of-app HTTP setup: proxy trust, security headers, CORS allowlist and
// structured request logs. Applied before every route.
import type { Express, Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.js';

/**
 * How many proxies to trust for the client IP (rate limits, logs). Behind Cloud
 * Run's front end the client is one hop away; locally only loopback proxies
 * (the Vite dev server) are trusted. Override with TRUST_PROXY.
 */
export function trustProxySetting(): boolean | number | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (raw) {
    if (raw === 'true' || raw === 'false') return raw === 'true';
    return /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  return process.env.K_SERVICE ? 1 : 'loopback';
}

function originPattern(entry: string): RegExp | null {
  const value = entry.trim().replace(/\/$/, '');
  if (!value) return null;
  const escaped = value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Browser origins allowed to call the API. Requests without Origin are not CORS. */
export function allowedOriginPatterns(): RegExp[] {
  const entries = (process.env.CORS_ORIGINS || '').split(',');
  const root = (process.env.LIVINGPLUS_ROOT_DOMAIN || '').trim().toLowerCase();
  if (root) entries.push(`https://${root}`, `https://*.${root}`);
  if (process.env.FRONTEND_URL) {
    try {
      entries.push(new URL(process.env.FRONTEND_URL).origin);
    } catch {
      /* ignore malformed FRONTEND_URL */
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    entries.push('http://localhost:*', 'http://*.localhost:*', 'http://127.0.0.1:*');
  }
  return entries.map(originPattern).filter((p): p is RegExp => p !== null);
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return allowedOriginPatterns().some((pattern) => pattern.test(origin));
}

const MEDIA_TOKEN_PATH = /^(\/api\/local-media\/)[^/?#]+/;

export function applyHttpHardening(app: Express): void {
  app.set('trust proxy', trustProxySetting());
  app.disable('x-powered-by');

  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/healthz' },
    customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    serializers: {
      // Signed media URLs carry their token in the path: keep it out of logs.
      req: (req: any) => ({ method: req.method, url: String(req.url || '').replace(MEDIA_TOKEN_PATH, '$1[redacted]'), remoteAddress: req.remoteAddress }),
      res: (res: any) => ({ statusCode: res.statusCode })
    },
    customProps: (req) => ({ clientIp: (req as Request).ip })
  }));

  // The API serves JSON and private media, never HTML, so a page CSP adds
  // nothing here (the frontend host sets its own). Media is fetched from the
  // app's own subdomains and Cloud Run URLs, hence a cross-origin CORP.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  app.use(cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    maxAge: 600
  }));
}
