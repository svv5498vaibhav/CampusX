import api from './api';

const unwrap = (response) => response.data.data;
const unwrapCommunity = (response) => response.data.data.community;
const path = (communityId) => `/communities/${encodeURIComponent(communityId)}`;

// Images can be a few MB on a phone connection; give uploads longer than normal requests.
const UPLOAD_TIMEOUT_MS = 120_000;

function uploadImage(communityId, kind, file, onProgress) {
  const form = new FormData();
  form.append(kind, file);
  return api
    .post(`${path(communityId)}/${kind}`, form, {
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
      },
    })
    .then(unwrapCommunity);
}

/**
 * Community endpoints. The student is always the signed-in one (the server reads it from the
 * session): no call sends a creator, college or branch.
 */
export const communityApi = {
  /** Types, visibility levels (and which types may use them), filters, limits and media rules. */
  getOptions: () => api.get('/communities/options').then(unwrap),
  /** { communities, pagination } */
  list: ({ page = 1, limit = 12, filter = 'all', sort = 'popular', search = '' } = {}) =>
    api.get('/communities', { params: { page, limit, filter, sort, ...(search && { search }) } }).then(unwrap),
  mine: () => api.get('/communities/me').then((response) => response.data.data.communities),
  recommended: () => api.get('/communities/recommended').then((response) => response.data.data.communities),
  get: (communityId) => api.get(path(communityId)).then(unwrapCommunity),
  create: (fields) => api.post('/communities', fields).then(unwrapCommunity),
  update: (communityId, changes) => api.put(path(communityId), changes).then(unwrapCommunity),
  /** Archives (the server keeps posts and members). */
  archive: (communityId) => api.delete(path(communityId)).then(unwrapCommunity),

  join: (communityId) => api.post(`${path(communityId)}/join`).then(unwrapCommunity),
  leave: (communityId) => api.delete(`${path(communityId)}/leave`).then(unwrap),
  /** { members: [{ student, role, joinedAt, isYou }], pagination } */
  members: (communityId, { page = 1, limit = 20 } = {}) => api.get(`${path(communityId)}/members`, { params: { page, limit } }).then(unwrap),
  changeRole: (communityId, userId, role) =>
    api.patch(`${path(communityId)}/members/${encodeURIComponent(userId)}/role`, { role }).then((response) => response.data.data.member),
  removeMember: (communityId, userId) => api.delete(`${path(communityId)}/members/${encodeURIComponent(userId)}`).then(unwrap),

  uploadIcon: (communityId, file, { onProgress } = {}) => uploadImage(communityId, 'icon', file, onProgress),
  removeIcon: (communityId) => api.delete(`${path(communityId)}/icon`).then(unwrapCommunity),
  uploadCover: (communityId, file, { onProgress } = {}) => uploadImage(communityId, 'cover', file, onProgress),
  removeCover: (communityId) => api.delete(`${path(communityId)}/cover`).then(unwrapCommunity),
};
