import api from './api';

const unwrap = (response) => response.data.data;

/** Points, level, badges and history of the signed-in student. All read-only: points only change on the server. */
export const gamificationApi = {
  /** Point rules, caps, levels, badges, tie-breakers, time zone. */
  rules: () => api.get('/gamification/rules').then(unwrap),
  /** { totalPoints, level, weeklyPoints, monthlyPoints, streak, badges, ... } */
  me: () => api.get('/gamification/me').then(unwrap),
  /** { transactions, pagination } */
  transactions: ({ page = 1, limit = 20 } = {}) => api.get('/gamification/transactions', { params: { page, limit } }).then(unwrap),
  /** { badges, earnedCount, total } */
  badges: () => api.get('/gamification/badges').then(unwrap),
};
