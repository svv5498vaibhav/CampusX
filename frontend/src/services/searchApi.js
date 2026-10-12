import api from './api';

const unwrap = (response) => response.data.data;
// Drops empty filters so requests only carry what is set.
const params = (values) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined && value !== null && value !== false));

/**
 * Search endpoints. Visibility is always worked out by the server from the signed-in student's own
 * profile and memberships: no call sends a college, branch or user id for that. `signal` lets a newer
 * search cancel an older one still in flight.
 */
export const searchApi = {
  /** Tabs, sorts per category, rules and filter choices. */
  getOptions: () => api.get('/search/options').then(unwrap),
  /** { query, counts, students, posts, projects, communities, opportunities, achievements } */
  searchAll: (q, { signal } = {}) => api.get('/search', { params: { q }, signal }).then(unwrap),
  /** { query, type, sort, results, pagination } */
  searchType: (type, query, { signal } = {}) => api.get(`/search/${encodeURIComponent(type)}`, { params: params(query), signal }).then(unwrap),
  /** { query, suggestions } */
  suggestions: (q, { signal } = {}) => api.get('/search/suggestions', { params: { q }, signal }).then(unwrap),
  /** { history: [{ id, query, searchedAt }] } */
  history: () => api.get('/search/history').then(unwrap),
  deleteHistory: (id) => api.delete(`/search/history/${encodeURIComponent(id)}`).then(unwrap),
  clearHistory: () => api.delete('/search/history').then(unwrap),
};
