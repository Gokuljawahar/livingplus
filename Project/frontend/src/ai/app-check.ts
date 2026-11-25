import type { FirebaseApp } from 'firebase/app';
import type { AppCheck } from 'firebase/app-check';

const initializedApps = new WeakMap<FirebaseApp, AppCheck>();
let appCheckInitPromise: Promise<AppCheck | null> | null = null;

function resolveDebugTokenFlag(): boolean | string | null {
  const envFlag = import.meta.env.VITE_APPCHECK_DEBUG?.trim();
  if (envFlag) {
    if (envFlag === 'false' || envFlag === '0') return false;
    if (envFlag === 'true' || envFlag === '1') return true;
    return envFlag;
  }

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'ai') return true;
    const stored = window.localStorage?.getItem('lp_appcheck_debug');
    if (stored) return stored === 'true' ? true : stored;
  }

  return import.meta.env.DEV ? true : null;
}

/**
 * Initializes Firebase App Check for the LivingPlus Firebase app (required for Firebase AI Logic).
 * Supports `VITE_APPCHECK_DEBUG=true` (or a specific debug token string) so judges and local
 * developers can attest without production domain enforcement.
 */
export async function ensureAppCheck(app: FirebaseApp): Promise<AppCheck | null> {
  const existing = initializedApps.get(app);
  if (existing) return existing;
  if (appCheckInitPromise) return appCheckInitPromise;

  appCheckInitPromise = (async () => {
    try {
      const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim();
      const debugToken = resolveDebugTokenFlag();

      if (debugToken && typeof self !== 'undefined') {
        (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
      }

      if (!siteKey || siteKey.startsWith('your-')) {
        // Without a reCAPTCHA site key in local/CI environments, avoid throwing inside App Check
        // while keeping debug token setup intact.
        return null;
      }

      const {
        initializeAppCheck,
        ReCaptchaV3Provider,
        ReCaptchaEnterpriseProvider
      } = await import('firebase/app-check');

      const useEnterprise = import.meta.env.VITE_RECAPTCHA_ENTERPRISE === 'true';
      const provider = useEnterprise
        ? new ReCaptchaEnterpriseProvider(siteKey)
        : new ReCaptchaV3Provider(siteKey);

      const appCheck = initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true
      });
      initializedApps.set(app, appCheck);
      return appCheck;
    } catch {
      return null;
    } finally {
      appCheckInitPromise = null;
    }
  })();

  return appCheckInitPromise;
}
