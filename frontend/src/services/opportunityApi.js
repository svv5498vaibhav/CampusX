import api from './api';

const unwrap = (response) => response.data.data;
const unwrapOpportunity = (response) => response.data.data.opportunity;
const path = (opportunityId) => `/opportunities/${encodeURIComponent(opportunityId)}`;
// Drops empty filters so the URL only carries what is set.
const params = (values) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined && value !== null && value !== false));

const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Opportunity endpoints. No call ever sends a user id, college, branch or semester for eligibility:
 * the server always uses the signed-in student's own profile.
 */
export const opportunityApi = {
  /** Types, filters, modes, statuses, tracking statuses, sorts, report reasons, colleges/branches, limits. */
  getOptions: () => api.get('/opportunities/options').then(unwrap),
  /** { opportunities, pagination } */
  list: (query = {}) => api.get('/opportunities', { params: params(query) }).then(unwrap),
  /** { opportunities } each with `matchReasons` */
  recommended: () => api.get('/opportunities/recommended').then(unwrap),
  get: (opportunityId) => api.get(path(opportunityId)).then(unwrapOpportunity),

  // The signed-in student's own tracking ("My Opportunities").
  /** { opportunities, counts, pagination } */
  mine: ({ status = 'all', page = 1, limit = 20 } = {}) => api.get('/opportunities/my', { params: { status, page, limit } }).then(unwrap),
  /** { tracking } — adds it to the list (default "saved"); already there = unchanged. */
  track: (opportunityId, body = {}) => api.post(`${path(opportunityId)}/track`, body).then(unwrap),
  /** { tracking } */
  updateStatus: (opportunityId, body) => api.patch(`${path(opportunityId)}/status`, body).then(unwrap),
  untrack: (opportunityId) => api.delete(`${path(opportunityId)}/track`).then(unwrap),

  // Moderators and admins, through the admin control center API (403 for everyone else; every change
  // is written to the admin audit log).
  /** { opportunities, counts, pagination } */
  manage: (query = {}) => api.get('/admin/opportunities', { params: params(query) }).then(unwrap),
  create: (fields) => api.post('/admin/opportunities', fields).then(unwrapOpportunity),
  update: (opportunityId, changes) => api.patch(`/admin${path(opportunityId)}`, changes).then(unwrapOpportunity),
  remove: (opportunityId) => api.delete(`/admin${path(opportunityId)}`).then(unwrap),
  /** kind: 'image' | 'logo' */
  uploadImage: (opportunityId, kind, file) => {
    const form = new FormData();
    form.append(kind, file);
    return api.post(`${path(opportunityId)}/${kind}`, form, { timeout: UPLOAD_TIMEOUT_MS }).then(unwrapOpportunity);
  },
  removeImage: (opportunityId, kind) => api.delete(`${path(opportunityId)}/${kind}`).then(unwrapOpportunity),
};
