import api from './api';

const unwrap = (response) => response.data.data;
const unwrapAchievement = (response) => response.data.data.achievement;
const path = (achievementId) => `/achievements/${encodeURIComponent(achievementId)}`;

const UPLOAD_TIMEOUT_MS = 180_000;

/**
 * Achievement endpoints. The owner is always the signed-in student, and verification is never sent:
 * the server sets it (proof → pending, moderators → verified / rejected).
 */
export const achievementApi = {
  /** Types, visibility, filters, limits and proof file rules. */
  getOptions: () => api.get('/achievements/options').then(unwrap),
  /** { achievements, pagination }; `verified` keeps only verified achievements. */
  list: ({ page = 1, limit = 12, type = 'all', verified = false, search = '' } = {}) =>
    api.get('/achievements', { params: { page, limit, type, verified, ...(search && { search }) } }).then(unwrap),
  mine: () => api.get('/achievements/me').then(unwrap),
  listByUser: (userId, { page = 1, limit = 6 } = {}) =>
    api.get(`/achievements/user/${encodeURIComponent(userId)}`, { params: { page, limit } }).then(unwrap),
  get: (achievementId) => api.get(path(achievementId)).then(unwrapAchievement),
  create: (fields) => api.post('/achievements', fields).then(unwrapAchievement),
  update: (achievementId, changes) => api.put(path(achievementId), changes).then(unwrapAchievement),
  remove: (achievementId) => api.delete(path(achievementId)).then(unwrap),

  /** Uploads proof and submits the achievement for review (status becomes "pending"). */
  addProof: (achievementId, files, { onProgress } = {}) => {
    const form = new FormData();
    for (const file of files) form.append('proof', file);
    return api
      .post(`${path(achievementId)}/proof`, form, {
        timeout: UPLOAD_TIMEOUT_MS,
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
      })
      .then(unwrapAchievement);
  },
  removeProof: (achievementId, proofId) => api.delete(`${path(achievementId)}/proof/${encodeURIComponent(proofId)}`).then(unwrapAchievement),
};
