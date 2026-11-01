import axios from 'axios';
import { encrypt, decrypt } from '../utils/crypto';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
export const API_URL = `${API_BASE_URL}/api`;
// export const API_BASE_URL = 'https://www.livingplus.com';
// export const API_URL = `${API_BASE_URL}/api`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0',
  }
});

api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Encrypt request body (skip FormData)
  if (config.data !== undefined && config.data !== null && !(config.data instanceof FormData)) {
    const encrypted = await encrypt(config.data);
    config.data = { data: encrypted };
  }

  // Encrypt query params (GET and any request with params)
  if (config.params && Object.keys(config.params).length > 0) {
    const encrypted = await encrypt(config.params);
    config.params = { data: encrypted };
  }

  return config;
});

api.interceptors.response.use(
  async (response) => {
    if (response.data && typeof response.data.data === 'string') {
      response.data = await decrypt(response.data.data);
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    if (error.response?.data && typeof error.response.data.data === 'string') {
      error.response.data = await decrypt(error.response.data.data);
    }
    return Promise.reject(error);
  }
);

export default api;
