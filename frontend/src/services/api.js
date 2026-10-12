import axios from 'axios';
import { API_BASE_URL } from '@/constants/app';

/** Error shape every service call rejects with, so UI code never digs through axios internals. */
export class ApiRequestError extends Error {
  constructor(message, { status = 0, errors = [] } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.errors = errors;
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  // Sends the HttpOnly refresh cookie to /auth routes. JavaScript can never read that cookie.
  withCredentials: true,
});

/*
 * The access token lives only in this module's memory: never in localStorage or
 * component state. A page reload drops it, and the refresh cookie restores it.
 */
let accessToken = null;
let refreshPromise = null;
let onSessionExpired = () => {};

export const setAccessToken = (token) => {
  accessToken = token;
};

/** For the Socket.IO handshake (services/socket.js), which uses the same in-memory token. */
export const getAccessToken = () => accessToken;

/** Called by the auth store so a failed silent refresh signs the user out everywhere in the UI. */
export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share one request,
 * so a burst of 401s triggers a single refresh.
 */
export function refreshSession() {
  refreshPromise ??= api
    .post('/auth/refresh', null, { skipAuthRefresh: true })
    .then((response) => {
      setAccessToken(response.data.data.accessToken);
      return response.data.data;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

function toApiRequestError(error) {
  const status = error.response?.status ?? 0;
  const body = error.response?.data;
  const message =
    body?.message ||
    (status === 0 ? 'Cannot reach CampusX right now. Check your connection and try again.' : 'Request failed');
  return new ApiRequestError(message, { status, errors: body?.errors ?? [] });
}

// A 401 from these means wrong credentials or no session at all, never an access token that needs
// renewing. Every other endpoint (including /auth/me and /auth/password) retries once after a refresh.
const SESSION_ENDPOINTS = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    const { config, response } = error;
    const isSessionEndpoint = SESSION_ENDPOINTS.has(config?.url);
    const canRefresh = response?.status === 401 && config && !config.skipAuthRefresh && !config.retried && !isSessionEndpoint;

    if (canRefresh) {
      try {
        await refreshSession();
      } catch (refreshError) {
        // Session gone (expired, revoked, account suspended): sign out. Network blips are not.
        if ([401, 403].includes(refreshError.status)) {
          setAccessToken(null);
          onSessionExpired();
        }
        return Promise.reject(refreshError);
      }
      config.retried = true;
      config.headers.Authorization = `Bearer ${accessToken}`;
      return api(config);
    }

    return Promise.reject(toApiRequestError(error));
  },
);

export default api;
