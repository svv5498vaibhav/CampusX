import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as notificationService from '../services/notificationService.js';

// Notifications belong to whoever is asking: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export async function list(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Notifications', data: await notificationService.getUserNotifications(req.user, queryOf(req)) });
}

export async function unreadCount(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Unread notifications', data: { unreadCount: await notificationService.getUnreadCount(req.user._id) } });
}

export async function markAsRead(req, res) {
  return sendSuccess(res, { message: 'Marked as read', data: await notificationService.markAsRead(req.user, req.params.id) });
}

export async function markAllAsRead(req, res) {
  return sendSuccess(res, { message: 'All caught up', data: await notificationService.markAllAsRead(req.user) });
}

export async function remove(req, res) {
  return sendSuccess(res, { message: 'Notification deleted', data: await notificationService.deleteNotification(req.user, req.params.id) });
}

export async function removeRead(req, res) {
  return sendSuccess(res, { message: 'Read notifications cleared', data: await notificationService.deleteReadNotifications(req.user) });
}

export async function preferences(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Notification preferences', data: await notificationService.getPreferences(req.user) });
}

export async function updatePreferences(req, res) {
  return sendSuccess(res, { message: 'Notification preferences saved', data: await notificationService.updatePreferences(req.user, matchedData(req, { locations: ['body'] })) });
}
