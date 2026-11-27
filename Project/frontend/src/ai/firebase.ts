import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import api from '../api/axios';

export interface FirebaseWebConfig extends FirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

const APP_NAME = 'livingplus';
let cachedConfig: FirebaseWebConfig | null | undefined;
let configPromise: Promise<FirebaseWebConfig | null> | null = null;
let anonAuthPromise: Promise<string | null> | null = null;

function envFirebaseConfig(): FirebaseWebConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  const authDomain =
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ||
    (projectId ? `${projectId}.firebaseapp.com` : '');

  if (!apiKey || !projectId || !appId || apiKey.startsWith('your-')) {
    return null;
  }
  return { apiKey, authDomain, projectId, appId };
}

/**
 * Resolves Firebase web app configuration from `VITE_FIREBASE_*` env vars first,
 * falling back to `/api/pg/config` when provisioned on the backend.
 */
export async function getFirebaseConfig(): Promise<FirebaseWebConfig | null> {
  if (cachedConfig !== undefined) return cachedConfig;

  const fromEnv = envFirebaseConfig();
  if (fromEnv) {
    cachedConfig = fromEnv;
    return cachedConfig;
  }

  if (!configPromise) {
    configPromise = api
      .get('/pg/config')
      .then((res) => {
        const fb = res.data?.phoneVerification?.firebase;
        if (fb?.apiKey && fb?.projectId && fb?.appId) {
          return {
            apiKey: fb.apiKey,
            authDomain: fb.authDomain || `${fb.projectId}.firebaseapp.com`,
            projectId: fb.projectId,
            appId: fb.appId
          } as FirebaseWebConfig;
        }
        return null;
      })
      .catch(() => null)
      .then((cfg) => {
        cachedConfig = cfg;
        return cfg;
      });
  }
  return configPromise;
}

/**
 * Lazily initializes and returns the shared `'livingplus'` FirebaseApp instance,
 * reusing the existing app instance initialized by Phone OTP / Google Sign-In if present.
 */
export async function getLivingPlusFirebaseApp(): Promise<FirebaseApp | null> {
  const [{ getApps, initializeApp }, config] = await Promise.all([
    import('firebase/app'),
    getFirebaseConfig()
  ]);

  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;
  if (!config) return null;

  return initializeApp(config, APP_NAME);
}

/**
 * Ensures an anonymous (or already signed-in) Firebase Auth user so Firestore
 * offline outbox security rules can scope documents to `request.auth.uid`.
 */
export async function ensureAnonymousFirebaseUser(): Promise<string | null> {
  if (anonAuthPromise) return anonAuthPromise;

  anonAuthPromise = (async () => {
    try {
      const app = await getLivingPlusFirebaseApp();
      if (!app) return null;
      const { getAuth, signInAnonymously } = await import('firebase/auth');
      const auth = getAuth(app);
      if (auth.currentUser?.uid) return auth.currentUser.uid;
      const cred = await signInAnonymously(auth);
      return cred.user.uid;
    } catch {
      return null;
    } finally {
      anonAuthPromise = null;
    }
  })();

  return anonAuthPromise;
}

/** Resets cached state for unit tests. */
export function _resetFirebaseCacheForTests(): void {
  cachedConfig = undefined;
  configPromise = null;
  anonAuthPromise = null;
}
