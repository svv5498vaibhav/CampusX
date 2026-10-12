import api from './api';

const unwrap = (response) => response.data.data;

/** The signed-in student's own notifications. Nothing here can create one: they come from campus activity. */
export const notificationApi = {
  /** { notifications, pagination, unreadCount } */
  list: ({ page = 1, limit = 20, filter = 'all' } = {}) => api.get('/notifications', { params: { page, limit, filter } }).then(unwrap),
  /** { unreadCount } */
  unreadCount: () => api.get('/notifications/unread-count').then(unwrap),
  /** { notification, unreadCount } */
  markAsRead: (id) => api.patch(`/notifications/${encodeURIComponent(id)}/read`).then(unwrap),
  /** { updated, unreadCount } */
  markAllAsRead: () => api.patch('/notifications/read-all').then(unwrap),
  /** { id, unreadCount } */
  remove: (id) => api.delete(`/notifications/${encodeURIComponent(id)}`).then(unwrap),
  /** { deleted, unreadCount } */
  removeRead: () => api.delete('/notifications/read').then(unwrap),
  /** { preferences, categories } */
  preferences: () => api.get('/notifications/preferences').then(unwrap),
  /** Only the categories being changed: { likes: false, ... }. Returns { preferences, categories }. */
  updatePreferences: (changes) => api.put('/notifications/preferences', changes).then(unwrap),
};
