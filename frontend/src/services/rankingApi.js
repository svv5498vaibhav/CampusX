import api from './api';

const unwrap = (response) => response.data.data;

/**
 * Leaderboards. Scopes (college, branch, semester) always come from the signed-in student's own
 * profile on the server; no call sends them.
 */
export const rankingApi = {
  /** scope: overall | college | branch | semester; period: all | month | week */
  leaderboard: (scope, { period = 'all', page = 1, limit = 20 } = {}) => api.get(`/rankings/${scope}`, { params: { period, page, limit } }).then(unwrap),
  /** { totalPoints, level, ranks: { overall, college, branch, semester }, weekly, monthly, badgeCount } */
  me: () => api.get('/rankings/me').then(unwrap),
};
