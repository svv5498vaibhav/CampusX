import { io } from 'socket.io-client';
import { SOCKET_URL } from '@/constants/app';
import { getAccessToken, refreshSession } from './api';

/*
 * This tab's single Socket.IO connection, for live updates. It signs in with the same in-memory access
 * token as REST calls (sent in the handshake, never in the URL). Sockets only deliver: when the
 * connection drops, everything keeps working through the REST API, and Socket.IO reconnects by itself.
 *
 * The server ends a connection when its access token expires, and refuses a handshake with an expired
 * token ("unauthorized"); both are answered with a silent token refresh and a new connection. If the
 * refresh fails because the session is gone, the API client signs the student out.
 */

let socket = null;
let retryTimer = null;
let retries = 0;
const statusListeners = new Set();

const notify = (status) => statusListeners.forEach((listener) => listener(status));

/** Called with 'connecting' | 'live' | 'reconnecting' | 'offline'. Returns an unsubscribe function. */
export function onSocketStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function scheduleReconnect(current, { refresh }) {
  clearTimeout(retryTimer);
  // 1 s, 2 s, 4 s ... up to a minute between attempts the server refused.
  const delay = Math.min(1000 * 2 ** retries, 60_000);
  retries += 1;
  retryTimer = setTimeout(async () => {
    if (socket !== current) return;
    if (refresh) {
      try {
        await refreshSession();
      } catch (error) {
        // Signed out (the auth store clears everything) or offline: try again later if still connected.
        if ([401, 403].includes(error?.status)) return;
      }
    }
    if (socket === current && !current.connected) current.connect();
  }, delay);
}

/** Opens (or reuses) the connection for this student. One per tab: a different student replaces it. */
export function connectSocket(userId) {
  if (socket?.userId === userId) return socket;
  disconnectSocket();

  const current = io(SOCKET_URL, {
    auth: (send) => send({ token: getAccessToken() }),
    withCredentials: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15_000,
  });
  current.userId = userId;
  socket = current;
  notify('connecting');

  current.on('connect', () => {
    retries = 0;
    notify('live');
  });
  current.on('connect_error', (error) => {
    notify('reconnecting');
    // Network trouble: Socket.IO retries by itself. A refused handshake needs us to try again.
    if (current.active) return;
    scheduleReconnect(current, { refresh: error?.message === 'unauthorized' });
  });
  current.on('disconnect', (reason) => {
    notify('reconnecting');
    // The server closed it (token expired, or the session ended): get a fresh token, then reconnect.
    if (reason === 'io server disconnect') scheduleReconnect(current, { refresh: true });
  });
  return current;
}

export function disconnectSocket() {
  clearTimeout(retryTimer);
  retries = 0;
  if (!socket) return;
  const current = socket;
  socket = null;
  current.removeAllListeners();
  current.disconnect();
  notify('offline');
}
