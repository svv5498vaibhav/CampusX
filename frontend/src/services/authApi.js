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
  /**
   * body: { password, confirmation: 'DELETE' } → { status: 'deleted' | 'scheduled' }. Permanent. A wrong
   * password is a 422 field error and the session stays. A bigger account can take a while to remove.
   */
  deleteAccount: (payload) => api.delete('/auth/account', { data: payload, timeout: 60_000 }).then(unwrap),
};
