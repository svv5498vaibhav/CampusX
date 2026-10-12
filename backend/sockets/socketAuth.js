import env from '../config/env.js';
import { SOCKET_RULES } from '../data/notificationOptions.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import { isSessionActive } from '../services/sessionService.js';
import { verifyAccessToken } from '../utils/generateToken.js';
import { SharedCounterStore } from '../utils/sharedCounterStore.js';
import { SOCKET_ERRORS, userRoom } from './socketEvents.js';

/*
 * Socket.IO handshake checks, the same rules as the REST `authenticate` middleware: a valid access
 * token (sent in the handshake's `auth` payload, never the URL), an active account and a live session.
 * The user id always comes from the verified token, never from anything else the client sends.
 * Tokens are never logged.
 */

const MINUTE = 60 * 1000;
const handshakes = new SharedCounterStore('socket-handshakes');
handshakes.init({ windowMs: MINUTE });

const refuse = (code) => {
  const error = new Error(code);
  error.data = { code };
  return error;
};

/** The client's IP, honouring TRUST_PROXY like Express does for REST requests. */
function clientIp(socket) {
  if (!env.trustProxy) return socket.handshake.address;
  const forwarded = String(socket.handshake.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded[forwarded.length - env.trustProxy] ?? forwarded[0] ?? socket.handshake.address;
}

export function socketAuthMiddleware(io) {
  return async (socket, next) => {
    try {
      const { totalHits } = await handshakes.increment(`ip:${clientIp(socket)}`);
      if (totalHits > SOCKET_RULES.handshakesPerMinute) return next(refuse(SOCKET_ERRORS.RATE_LIMITED));

      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) return next(refuse(SOCKET_ERRORS.UNAUTHORIZED));
      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch {
        return next(refuse(SOCKET_ERRORS.UNAUTHORIZED));
      }

      const [user, sessionActive] = await Promise.all([
        User.findById(payload.sub).select('status role').lean(),
        isSessionActive(payload.sid, payload.sub),
      ]);
      if (!user || !sessionActive || user.status !== ACCOUNT_STATUSES.ACTIVE) return next(refuse(SOCKET_ERRORS.UNAUTHORIZED));

      const userId = user._id.toString();
      const open = await io.in(userRoom(userId)).fetchSockets();
      if (open.length >= SOCKET_RULES.maxConnectionsPerUser) return next(refuse(SOCKET_ERRORS.TOO_MANY_CONNECTIONS));

      // The role comes from the database, never the token: it decides whether the socket joins the staff room.
      socket.data = { userId, role: user.role, sessionId: String(payload.sid), expiresAt: payload.exp * 1000 };
      return next();
    } catch {
      // Database trouble: the client tries again later, and REST keeps working meanwhile.
      return next(refuse(SOCKET_ERRORS.UNAVAILABLE));
    }
  };
}
