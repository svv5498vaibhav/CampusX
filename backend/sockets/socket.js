import { Server } from 'socket.io';
import { corsOptions } from '../config/cors.js';
import { getDatabaseStatus } from '../config/db.js';
import Session from '../models/Session.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import { CAMPUS_EVENTS, campusEvents } from '../services/campusEvents.js';
import logger from '../utils/logger.js';
import { socketAuthMiddleware } from './socketAuth.js';
import { STAFF_ROOM, sessionRoom, userRoom } from './socketEvents.js';

const STAFF_ROLES = ['admin', 'moderator'];

// Clients never send data over sockets (every change goes through the REST API), so incoming
// messages stay tiny; anything larger closes the connection.
const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024;

let io = null;

// setTimeout can't wait longer than this (about 24.8 days).
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Logging out ends that device's live connections. */
const onSessionEnded = ({ sessionId }) => {
  if (io && sessionId) io.in(sessionRoom(sessionId)).disconnectSockets(true);
};

/** A deleted account loses every live connection, on every device. */
const onAccountDeleted = ({ userId }) => {
  if (io && userId) io.in(userRoom(String(userId))).disconnectSockets(true);
};

/**
 * Attaches Socket.IO to the HTTP server. Only signed-in students can connect (sockets/socketAuth.js);
 * each connection joins its student's room, and services deliver to that room with emitToUser().
 * Sockets carry nothing the client could use to act: every change goes through the REST API.
 */
export function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: corsOptions.origin, credentials: corsOptions.credentials },
    serveClient: false,
    maxHttpBufferSize: MAX_CLIENT_MESSAGE_BYTES,
  });
  io.use(socketAuthMiddleware(io));

  io.on('connection', (socket) => {
    const { userId, role, sessionId, expiresAt } = socket.data;
    socket.join([userRoom(userId), sessionRoom(sessionId), ...(STAFF_ROLES.includes(role) ? [STAFF_ROOM] : [])]);
    // A connection lasts as long as its access token. The client reconnects with a fresh token, so a
    // revoked session or a suspended account stops getting live updates within one token lifetime.
    const expiry = setTimeout(() => socket.disconnect(true), Math.min(Math.max(0, expiresAt - Date.now()), MAX_TIMER_MS));
    logger.debug(`Socket connected: ${socket.id} (user ${userId})`);
    socket.on('disconnect', (reason) => {
      clearTimeout(expiry);
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });
  campusEvents.on(CAMPUS_EVENTS.AUTH_SESSION_ENDED, onSessionEnded);
  campusEvents.on(CAMPUS_EVENTS.AUTH_ACCOUNT_DELETED, onAccountDeleted);

  logger.info('Socket.IO: ready');
  return io;
}

/** Lets services emit events without importing the HTTP server. */
export function getIO() {
  if (!io) throw new Error('Socket.IO has not been initialised');
  return io;
}

/** Sends an event to every open connection of one student. A no-op while Socket.IO isn't running. */
export function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(userRoom(String(userId))).emit(event, payload);
}

/**
 * Re-checks every connection in the staff room against the database: the account must still be an
 * active moderator or admin and its session still live. A demoted account leaves the room (it keeps its
 * own notifications); a suspended account or an ended session is disconnected. Role changes made by
 * another process (scripts/setUserRole.js) are respected this way before the next admin event.
 */
async function verifyStaffRoom(server) {
  const sockets = await server.in(STAFF_ROOM).fetchSockets();
  if (!sockets.length) return;
  const [staff, liveSessions] = await Promise.all([
    User.find({ _id: { $in: [...new Set(sockets.map((socket) => socket.data.userId))] } }).select('role status').lean(),
    Session.find({ _id: { $in: [...new Set(sockets.map((socket) => socket.data.sessionId))] }, revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id').lean(),
  ]);
  const accounts = new Map(staff.map((user) => [user._id.toString(), user]));
  const live = new Set(liveSessions.map((session) => session._id.toString()));
  for (const socket of sockets) {
    const account = accounts.get(socket.data.userId);
    if (!account || account.status !== ACCOUNT_STATUSES.ACTIVE || !live.has(socket.data.sessionId)) socket.disconnect(true);
    else if (!STAFF_ROLES.includes(account.role)) socket.leave(STAFF_ROOM);
  }
}

/**
 * Sends an admin event to every connected moderator and admin (the staff room), after checking the room
 * against the database. Never broadcast to students. A no-op while Socket.IO isn't running. If the
 * database can't be asked (e.g. the alert is about the database), the room as verified at handshake is used.
 */
export async function emitToStaff(event, payload) {
  const server = io;
  if (!server) return;
  try {
    if (getDatabaseStatus() === 'connected') await verifyStaffRoom(server);
  } catch (error) {
    logger.debug(`Staff room check skipped (${error?.message ?? error})`);
  }
  server.to(STAFF_ROOM).emit(event, payload);
}

/** 'online' while live updates are being served. */
export const getSocketStatus = () => (io ? 'online' : 'offline');

/**
 * Disconnects every client, then closes the HTTP server Socket.IO is attached
 * to. Resolves once in-flight HTTP requests have finished.
 */
export async function closeSocketServer() {
  if (!io) return;
  const server = io;
  io = null;
  campusEvents.off(CAMPUS_EVENTS.AUTH_SESSION_ENDED, onSessionEnded);
  campusEvents.off(CAMPUS_EVENTS.AUTH_ACCOUNT_DELETED, onAccountDeleted);
  await server.close();
  logger.info('Socket.IO and HTTP server closed');
}
