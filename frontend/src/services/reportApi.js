import api from './api';

const unwrap = (response) => response.data.data;

/**
 * Reports (Trust & Safety). The reporter is always the signed-in student (the server reads it from the
 * session); no call ever sends a reporter, status or priority.
 */
export const reportApi = {
  /** { reasons, targets: { post: { label, reasons }, ... }, rules } */
  getOptions: () => api.get('/reports/options').then(unwrap),
  /** targetType: post · comment · project · community · opportunity · achievement · user · anonymousPost · anonymousComment */
  create: ({ targetType, targetId, reason, description }) => api.post('/reports', { targetType, targetId, reason, description: description || undefined }).then(unwrap),
  /** { reports, pagination } */
  mine: ({ page = 1, limit = 20 } = {}) => api.get('/reports/me', { params: { page, limit } }).then(unwrap),
  withdraw: (reportId) => api.delete(`/reports/${encodeURIComponent(reportId)}`).then(unwrap),
};
