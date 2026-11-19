import axios from 'axios';
import { resolveAppHost } from '../utils/pg-host';
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
  const isResidentRoute = window.location.pathname === '/resident' || window.location.pathname.startsWith('/pg/resident');
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
  const isOwnerRoute =
    pathname.startsWith('/owner/') ||
    pathname.startsWith('/pg/manage') ||
    pathname.startsWith('/pg/operators') ||
    pathname.startsWith('/dashboard') ||
    pathname === '/change-password';
  const isPublicDiscovery =
    (method === 'get' && url.includes('/pg/properties')) ||
    (method === 'post' && url.includes('/pg/ai/chat'));
  const residentToken = localStorage.getItem(RESIDENT_TOKEN_KEY);
  const token = localStorage.getItem(
    isResidentRequest || (!isOwnerRoute && isPublicDiscovery && Boolean(residentToken)) ? RESIDENT_TOKEN_KEY : OWNER_TOKEN_KEY
  );
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const hostContext = resolveAppHost();
  if (hostContext.kind === 'property') config.headers['X-PG-Slug'] = hostContext.slug;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(OWNER_TOKEN_KEY);
      localStorage.removeItem(OWNER_USER_KEY);
      localStorage.removeItem(RESIDENT_TOKEN_KEY);
      localStorage.removeItem(RESIDENT_USER_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
