import api from './api';

const unwrap = (response) => response.data.data;
const unwrapProject = (response) => response.data.data.project;
const path = (projectId) => `/projects/${encodeURIComponent(projectId)}`;

// Several images on a phone connection can take a while.
const UPLOAD_TIMEOUT_MS = 180_000;

/** Project endpoints. The owner is always the signed-in student; no call sends an owner id. */
export const projectApi = {
  /** Categories, statuses, visibility, team roles, tech suggestions, filters, limits, image rules. */
  getOptions: () => api.get('/projects/options').then(unwrap),
  /** { projects, pagination } */
  list: ({ page = 1, limit = 12, category = 'all', sort = 'new', search = '' } = {}) =>
    api.get('/projects', { params: { page, limit, category, sort, ...(search && { search }) } }).then(unwrap),
  /** { projects (yours), teamProjects, invitations } */
  mine: () => api.get('/projects/me').then(unwrap),
  /** A student's projects as far as you may see them: { projects, pagination } */
  listByUser: (userId, { page = 1, limit = 6 } = {}) =>
    api.get(`/projects/user/${encodeURIComponent(userId)}`, { params: { page, limit } }).then(unwrap),
  /** Students to add as teammates (search by name): [{ id, firstName, ... }] */
  teamCandidates: (search) => api.get('/projects/team-candidates', { params: { search } }).then((response) => response.data.data.students),
  get: (projectId) => api.get(path(projectId)).then(unwrapProject),
  create: (fields) => api.post('/projects', fields).then(unwrapProject),
  update: (projectId, changes) => api.put(path(projectId), changes).then(unwrapProject),
  remove: (projectId) => api.delete(path(projectId)).then(unwrap),

  addImages: (projectId, files, { onProgress } = {}) => {
    const form = new FormData();
    for (const file of files) form.append('images', file);
    return api
      .post(`${path(projectId)}/images`, form, {
        timeout: UPLOAD_TIMEOUT_MS,
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
      })
      .then(unwrapProject);
  },
  removeImage: (projectId, imageId) => api.delete(`${path(projectId)}/images/${encodeURIComponent(imageId)}`).then(unwrapProject),

  like: (projectId) => api.post(`${path(projectId)}/like`).then(unwrap),
  unlike: (projectId) => api.delete(`${path(projectId)}/like`).then(unwrap),
  acceptInvitation: (projectId) => api.post(`${path(projectId)}/team/accept`).then(unwrapProject),
  leaveTeam: (projectId) => api.delete(`${path(projectId)}/team/me`).then(unwrap),
};
