/**
 * Socket.IO event names and rooms, in one place. Sockets only deliver: everything they carry was
 * already saved through the REST services, and nothing a client sends over a socket is trusted.
 * The frontend mirrors these names in constants/notifications.js.
 */
export const SOCKET_EVENTS = Object.freeze({
  // { notification, unreadCount }: a new notification, or a grouped one that was just updated.
  NOTIFICATION_NEW: 'notification:new',
  // { ids } or { all: true }: marked as read (in another tab, or by "Mark all as read").
  NOTIFICATION_READ: 'notification:read',
  // { ids } or { allRead: true }: deleted, or withdrawn (e.g. a like taken back before it was seen).
  NOTIFICATION_DELETED: 'notification:deleted',
  // { unreadCount }: the unread count after a read or delete.
  NOTIFICATION_COUNT: 'notification:count',
  // Admin control center, delivered only to the staff room (moderators and admins). Ids, types and levels
  // only: never a reporter, a content owner or an anonymous author.
  // { reportId, targetType, targetId, reason, priority, at }
  ADMIN_NEW_REPORT: 'admin:newReport',
  // { caseId, targetType, targetId, riskLevel, priority, source, at }
  ADMIN_NEW_MODERATION_CASE: 'admin:newModerationCase',
  // { level: 'warning' | 'info', service: 'database' | 'redis', status, message, at }
  ADMIN_SYSTEM_ALERT: 'admin:systemAlert',
});

/** Handshake refusals, sent to the client as connect_error messages. */
export const SOCKET_ERRORS = Object.freeze({
  UNAUTHORIZED: 'unauthorized',
  RATE_LIMITED: 'rate-limited',
  TOO_MANY_CONNECTIONS: 'too-many-connections',
  // The server couldn't check the token (e.g. the database is down): try again later.
  UNAVAILABLE: 'unavailable',
});

/** Every connection of a student joins their room; notifications are sent there, never broadcast. */
export const userRoom = (userId) => `user:${userId}`;
/** Each connection also joins its session's room, so logging out disconnects that device's sockets. */
export const sessionRoom = (sessionId) => `session:${sessionId}`;
/** Connections of CampusX moderators and admins (decided by the role in the database at handshake). */
export const STAFF_ROOM = 'staff';
