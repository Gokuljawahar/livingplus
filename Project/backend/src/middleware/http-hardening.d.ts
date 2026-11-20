import type { Express } from 'express';
/**
 * How many proxies to trust for the client IP (rate limits, logs). Behind Cloud
 * Run's front end the client is one hop away; locally only loopback proxies
 * (the Vite dev server) are trusted. Override with TRUST_PROXY.
 */
export declare function trustProxySetting(): boolean | number | string;
/** Browser origins allowed to call the API. Requests without Origin are not CORS. */
export declare function allowedOriginPatterns(): RegExp[];
export declare function isAllowedOrigin(origin: string | undefined): boolean;
export declare function applyHttpHardening(app: Express): void;
//# sourceMappingURL=http-hardening.d.ts.map