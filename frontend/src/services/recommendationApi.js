import api from './api';

const unwrap = (response) => response.data.data;

/**
 * Recommendations (rule-based, worked out by the server from the signed-in student's own profile and
 * activity). No call ever sends a user id, college, branch or semester: the server never accepts them.
 */
export const recommendationApi = {
  /** Home: { recommendations, sections: { opportunities, projects, communities }, trending, generatedAt, personalization } */
  home: () => api.get('/recommendations').then(unwrap),
  /** Discover: { recommendations, sections: { opportunities, projects, communities, students, achievements, posts }, trending, ... } */
  discover: () => api.get('/recommendations/discover').then(unwrap),
  /** One kind: { type, recommendations, pagination, generatedAt, personalization } */
  list: (type, { page = 1, limit } = {}) => api.get(`/recommendations/${encodeURIComponent(type)}`, { params: { page, ...(limit && { limit }) } }).then(unwrap),
  /** "Not interested" (default) or "dismiss" (just this one). */
  dismiss: (type, id, action = 'not_interested') => api.post(`/recommendations/${encodeURIComponent(type)}/${encodeURIComponent(id)}/dismiss`, { action }).then(unwrap),
  /** Light analytics: recommendations shown ("impression") or opened ("click"). */
  interactions: (action, items) => api.post('/recommendations/interactions', { action, items }).then(unwrap),
};
