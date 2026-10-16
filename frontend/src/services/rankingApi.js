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
  /**
   * Elite rank tokens (read-only: the server moves them from its ranking snapshots).
   * { status, seq, updatedAt, scope, tiers, holders: [{ tier, student, since, points, topThreeEntries }], you }
   */
  elite: () => api.get('/rankings/elite').then(unwrap),
  /** The overview plus previousHolders, records, totals, transfers (paged) and pagination. */
  hallOfFame: ({ page = 1, limit = 15 } = {}) => api.get('/rankings/hall-of-fame', { params: { page, limit } }).then(unwrap),
  /** { current, reigns, stats } for one student. */
  eliteHistory: (userId) => api.get(`/rankings/elite/students/${encodeURIComponent(userId)}`).then(unwrap),
};
