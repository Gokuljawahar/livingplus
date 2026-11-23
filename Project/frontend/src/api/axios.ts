import axios from 'axios';
import { resolveAppHost } from '../utils/pg-host';
import { areaOf, loginFor, residentSlugFromPath } from '../utils/app-areas';
import { OWNER_TOKEN_KEY, OWNER_USER_KEY, RESIDENT_TOKEN_KEY, RESIDENT_USER_KEY } from '../utils/session';

const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const API_BASE_URL = configuredApiBase;
export const API_URL = configuredApiBase ? `${configuredApiBase}/api` : '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0',
  }
});

api.interceptors.request.use(async (config) => {
  const area = areaOf(window.location.pathname);
  const isResidentRoute = area === 'resident';
  const isResidentRequest = isResidentRoute || config.url?.includes('/pg/tenant/') || (config.data && !(config.data instanceof FormData) && config.data.purpose === 'TENANT_LOGIN');
  // Public PG search and the assistant chat also hide a signed-in resident's
  // own PG, so they need the resident identity even though the discovery page
  // itself is not a resident route.
  const method = (config.method || 'get').toLowerCase();
  const url = config.url || '';
  const pathname = window.location.pathname;
  // Owner workspace pages must always act as the owner, even when a resident
  // session from another tab lingers in storage. Otherwise the assistant
  // answers with the resident persona on the owner page.
  const isOwnerRoute = area === 'owner';
  const isPublicDiscovery =
    (method === 'get' && url.includes('/pg/properties')) ||
    (method === 'post' && url.includes('/pg/ai/chat'));
  const residentToken = localStorage.getItem(RESIDENT_TOKEN_KEY);
  const token = localStorage.getItem(
    !isOwnerRoute && (isResidentRequest || (isPublicDiscovery && Boolean(residentToken))) ? RESIDENT_TOKEN_KEY : OWNER_TOKEN_KEY
  );
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const hostContext = resolveAppHost();
  // Resident sites belong to one PG: /stay/<slug> (or a <slug> subdomain) scopes every request to it.
  const pgSlug = residentSlugFromPath(pathname) || (hostContext.kind === 'property' ? hostContext.slug : null);
  if (pgSlug) config.headers['X-PG-Slug'] = pgSlug;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // A guest-session 401 is not about the stored owner/resident session.
    if (error.response?.status === 401 && error.response?.data?.code !== 'GUEST_VERIFICATION_REQUIRED') {
      // Sign out of this area only, then show its sign-in page.
      const { pathname } = window.location;
      const area = areaOf(pathname);
      const sentToken = String(error.config?.headers?.Authorization || '').replace(/^Bearer /, '');
      if (sentToken && sentToken === localStorage.getItem(RESIDENT_TOKEN_KEY)) {
        localStorage.removeItem(RESIDENT_TOKEN_KEY);
        localStorage.removeItem(RESIDENT_USER_KEY);
      } else if (sentToken) {
        localStorage.removeItem(OWNER_TOKEN_KEY);
        localStorage.removeItem(OWNER_USER_KEY);
      }
      const login = loginFor(area, pathname);
      if (sentToken && area !== 'guest' && pathname !== login) window.location.href = login;
      else if (sentToken && area === 'resident') window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default api;
