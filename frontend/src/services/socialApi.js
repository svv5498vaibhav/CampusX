import api from './api';

const unwrap = (response) => response.data.data;
const id = (value) => encodeURIComponent(value);

/**
 * Follows and blocks. The student acting is always the signed-in one (from the session): calls only name
 * the other student.
 */
export const followApi = {
  follow: (userId) => api.post(`/users/${id(userId)}/follow`).then(unwrap),
  unfollow: (userId) => api.delete(`/users/${id(userId)}/follow`).then(unwrap),
  block: (userId) => api.post(`/users/${id(userId)}/block`).then(unwrap),
  unblock: (userId) => api.delete(`/users/${id(userId)}/block`).then(unwrap),
  relationship: (userId) => api.get(`/users/${id(userId)}/relationship`).then(unwrap),
  /** kind: 'followers' | 'following'. `signal` cancels a list request that's no longer wanted. */
  list: (userId, kind, { cursor, search, limit } = {}, { signal } = {}) =>
    api.get(`/users/${id(userId)}/${kind}`, { params: { cursor: cursor || undefined, search: search || undefined, limit }, signal }).then(unwrap),
  /** { [userId]: { isFollowing, canFollow } } for up to 50 students (cards). */
  statuses: (userIds) => api.get('/users/follow-status', { params: { ids: userIds.join(',') } }).then((response) => response.data.data.statuses),
};

/** Direct messages. Every conversation is checked against the signed-in student on the server. */
export const messageApi = {
  inbox: ({ cursor, limit } = {}) => api.get('/conversations', { params: { cursor: cursor || undefined, limit } }).then(unwrap),
  unreadCount: () => api.get('/conversations/unread-count').then((response) => response.data.data.unreadCount),
  /** The conversation with another student: the existing one, or a new empty one. */
  open: (userId) => api.post('/conversations', { userId }).then((response) => response.data.data.conversation),
  get: (conversationId) => api.get(`/conversations/${id(conversationId)}`).then((response) => response.data.data.conversation),
  messages: (conversationId, { before, limit } = {}, { signal } = {}) =>
    api.get(`/conversations/${id(conversationId)}/messages`, { params: { before: before || undefined, limit }, signal }).then(unwrap),
  send: (conversationId, { text, clientId }) => api.post(`/conversations/${id(conversationId)}/messages`, { text, clientId }).then(unwrap),
  markRead: (conversationId) => api.post(`/conversations/${id(conversationId)}/read`).then(unwrap),
};
