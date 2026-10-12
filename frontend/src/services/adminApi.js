import api from './api';

const unwrap = (response) => response.data.data;
// Drops empty filters so the URL only carries what is set.
const params = (values = {}) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined && value !== null && value !== false));
const id = (value) => encodeURIComponent(value);

/**
 * Admin control center endpoints (/api/v1/admin). The server checks the role and the permission on
 * every call; nothing here decides access.
 */
export const adminApi = {
  /** { user, role, permissions } */
  session: () => api.get('/admin/session').then(unwrap),
  /** { api, database, redis, cache, realtime, uptimeSeconds, checkedAt } */
  systemStatus: () => api.get('/admin/system-status').then(unwrap),
  dashboard: ({ refresh = false } = {}) => api.get('/admin/dashboard', { params: params({ refresh }) }).then(unwrap),

  moderation: (query) => api.get('/admin/moderation', { params: params(query) }).then(unwrap),
  moderationCase: (caseId) => api.get(`/admin/moderation/${id(caseId)}`).then(unwrap),
  /** body: { decision, note?, confirm? } */
  decideCase: (caseId, body) => api.patch(`/admin/moderation/${id(caseId)}`, body).then(unwrap),
  /** body: { reason } — audited; the answer is shown once and never stored. */
  revealAuthor: (caseId, body) => api.post(`/admin/moderation/${id(caseId)}/reveal-author`, body).then(unwrap),

  reports: (query) => api.get('/admin/reports', { params: params(query) }).then(unwrap),
  report: (reportId) => api.get(`/admin/reports/${id(reportId)}`).then(unwrap),
  /** body: { action, note? } */
  actOnReport: (reportId, body) => api.patch(`/admin/reports/${id(reportId)}`, body).then(unwrap),

  users: (query) => api.get('/admin/users', { params: params(query) }).then(unwrap),
  user: (userId) => api.get(`/admin/users/${id(userId)}`).then(unwrap),
  /** body: { action, reason?, confirm? } */
  changeUserStatus: (userId, body) => api.patch(`/admin/users/${id(userId)}/status`, body).then(unwrap),

  content: (query) => api.get('/admin/content', { params: params(query) }).then(unwrap),
  /** body: { action, reason?, confirm? } */
  actOnContent: (type, contentId, body) => api.patch(`/admin/content/${id(type)}/${id(contentId)}`, body).then(unwrap),

  communities: (query) => api.get('/admin/communities', { params: params(query) }).then(unwrap),
  actOnCommunity: (communityId, body) => api.patch(`/admin/communities/${id(communityId)}`, body).then(unwrap),

  // Opportunity management (the Phase 8 handlers behind the admin gate; same responses).
  opportunities: (query) => api.get('/admin/opportunities', { params: params(query) }).then(unwrap),
  createOpportunity: (fields) => api.post('/admin/opportunities', fields).then((response) => response.data.data.opportunity),
  updateOpportunity: (opportunityId, changes) => api.patch(`/admin/opportunities/${id(opportunityId)}`, changes).then((response) => response.data.data.opportunity),
  deleteOpportunity: (opportunityId) => api.delete(`/admin/opportunities/${id(opportunityId)}`).then(unwrap),

  analytics: ({ range = '30d', refresh = false } = {}) => api.get('/admin/analytics', { params: params({ range, refresh }) }).then(unwrap),
  auditLogs: (query) => api.get('/admin/audit-logs', { params: params(query) }).then(unwrap),
  /** Admins (VIEW_SECURITY): protections, limits, service health and security event counts. No secrets. */
  securityStatus: () => api.get('/admin/security/status').then(unwrap),
};
