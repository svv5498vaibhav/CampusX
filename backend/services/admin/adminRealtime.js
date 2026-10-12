import mongoose from 'mongoose';
import { getRedisClient } from '../../config/redis.js';
import { emitToStaff } from '../../sockets/socket.js';
import { SOCKET_EVENTS } from '../../sockets/socketEvents.js';
import { CAMPUS_EVENTS, campusEvents } from '../campusEvents.js';

/*
 * Live admin events, delivered only to the staff room (sockets/socket.js: moderators and admins, by the
 * role in the database at handshake). Payloads are ids, kinds and levels: never a reporter, a content
 * owner, an anonymous author or any content text. The REST API stays the source of truth; these only
 * tell an open control center that something new is waiting.
 *
 * System alerts come from the database and Redis connections themselves (real connection events, nothing
 * simulated).
 */

const now = () => new Date().toISOString();

const onReportCreated = ({ reportId, targetType, targetId, reason, priority }) =>
  emitToStaff(SOCKET_EVENTS.ADMIN_NEW_REPORT, { reportId, targetType, targetId, reason, priority, at: now() });

const onCaseOpened = ({ caseId, targetType, targetId, riskLevel, priority, source }) =>
  emitToStaff(SOCKET_EVENTS.ADMIN_NEW_MODERATION_CASE, { caseId, targetType, targetId, riskLevel, priority, source, at: now() });

const alert = (service, status, level, message) => emitToStaff(SOCKET_EVENTS.ADMIN_SYSTEM_ALERT, { service, status, level, message, at: now() });

const onDatabaseDown = () => alert('database', 'disconnected', 'warning', 'Database connection lost. CampusX is retrying.');
const onDatabaseUp = () => alert('database', 'connected', 'info', 'Database connection restored.');

let registered = false;
let redisClient = null;
let redisDown = false;
const onRedisError = () => {
  if (redisDown) return;
  redisDown = true;
  alert('redis', 'unavailable', 'warning', 'Redis connection lost. Caching and rate limits use memory until it returns.');
};
const onRedisReady = () => {
  if (!redisDown) return;
  redisDown = false;
  alert('redis', 'connected', 'info', 'Redis connection restored.');
};

/** Call once at startup, after Redis and Socket.IO are set up. */
export function registerAdminRealtime() {
  if (registered) return;
  registered = true;
  campusEvents.on(CAMPUS_EVENTS.REPORT_CREATED, onReportCreated);
  campusEvents.on(CAMPUS_EVENTS.MODERATION_CASE_OPENED, onCaseOpened);
  mongoose.connection.on('disconnected', onDatabaseDown);
  mongoose.connection.on('reconnected', onDatabaseUp);
  redisClient = getRedisClient();
  redisClient?.on('error', onRedisError);
  redisClient?.on('ready', onRedisReady);
}

export function unregisterAdminRealtime() {
  if (!registered) return;
  registered = false;
  campusEvents.off(CAMPUS_EVENTS.REPORT_CREATED, onReportCreated);
  campusEvents.off(CAMPUS_EVENTS.MODERATION_CASE_OPENED, onCaseOpened);
  mongoose.connection.off('disconnected', onDatabaseDown);
  mongoose.connection.off('reconnected', onDatabaseUp);
  redisClient?.off('error', onRedisError);
  redisClient?.off('ready', onRedisReady);
  redisClient = null;
}
