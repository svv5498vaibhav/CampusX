import api from './api';

const unwrap = (response) => response.data.data;
const unwrapPost = (response) => response.data.data.post;

// Videos can be tens of MB on a phone connection; give uploads far longer than normal requests.
const UPLOAD_TIMEOUT_MS = 300_000;

/**
 * Sends a post as JSON, or as multipart when files are attached (fields + "media" files).
 * keepMedia (edits) travels as a JSON list in multipart requests.
 */
function sendPost(method, path, fields, files = [], onProgress) {
  if (files.length === 0) return api[method](path, fields).then(unwrapPost);

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    form.append(key, Array.isArray(value) ? JSON.stringify(value) : value);
  }
  for (const file of files) form.append('media', file);

  return api[method](path, form, {
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
    },
  }).then(unwrapPost);
}

const postPath = (postId) => `/posts/${encodeURIComponent(postId)}`;
const commentPath = (commentId) => `/comments/${encodeURIComponent(commentId)}`;

/**
 * Campus feed endpoints, also used inside communities (pass `community` when creating). The author
 * is always the signed-in student (the server reads it from the session); no call sends an author or
 * owner id.
 */
export const postApi = {
  /** Post types, visibility levels, feed filters, report reasons and media limits. */
  getOptions: () => api.get('/posts/options').then(unwrap),
  /** { posts, pagination: { page, limit, total, hasMore } } */
  list: ({ page = 1, limit = 10, filter = 'all' } = {}) => api.get('/posts', { params: { page, limit, filter } }).then(unwrap),
  /** A community's posts (members only): { posts, pagination }. */
  listCommunity: (communityId, { page = 1, limit = 10 } = {}) =>
    api.get(`/communities/${encodeURIComponent(communityId)}/posts`, { params: { page, limit } }).then(unwrap),
  get: (postId) => api.get(postPath(postId)).then(unwrapPost),
  create: (fields, files, { onProgress } = {}) => sendPost('post', '/posts', fields, files, onProgress),
  update: (postId, fields, files, { onProgress } = {}) => sendPost('put', postPath(postId), fields, files, onProgress),
  remove: (postId) => api.delete(postPath(postId)).then(unwrap),

  like: (postId) => api.post(`${postPath(postId)}/like`).then(unwrap),
  unlike: (postId) => api.delete(`${postPath(postId)}/like`).then(unwrap),
  save: (postId) => api.post(`${postPath(postId)}/save`).then(unwrap),
  unsave: (postId) => api.delete(`${postPath(postId)}/save`).then(unwrap),

  /** { comments, pagination } — newest first. */
  listComments: (postId, { page = 1, limit = 10 } = {}) =>
    api.get(`${postPath(postId)}/comments`, { params: { page, limit } }).then(unwrap),
  /** { comment, commentCount } */
  addComment: (postId, content) => api.post(`${postPath(postId)}/comments`, { content }).then(unwrap),
  updateComment: (commentId, content) => api.put(commentPath(commentId), { content }).then((response) => response.data.data.comment),
  /** { id, postId, commentCount } */
  deleteComment: (commentId) => api.delete(commentPath(commentId)).then(unwrap),
};
