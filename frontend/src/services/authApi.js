import api from './api';

const unwrap = (response) => response.data.data;

/** Auth endpoints. Session refresh lives in api.js because the 401 interceptor needs it too. */
export const authApi = {
  register: (payload) => api.post('/auth/register', payload).then(unwrap),
  login: (credentials) => api.post('/auth/login', credentials).then(unwrap),
  logout: () => api.post('/auth/logout', null, { skipAuthRefresh: true }).then(unwrap),
  getCurrentUser: () => api.get('/auth/me').then(unwrap),
  /** body: { currentPassword, newPassword, confirmPassword } → { otherSessionsSignedOut }. This device stays signed in. */
  changePassword: (payload) => api.put('/auth/password', payload).then(unwrap),
};
