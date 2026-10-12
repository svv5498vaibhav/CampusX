import api from './api';

const unwrap = (response) => response.data.data;
const unwrapPost = (response) => response.data.data.post;
const path = (postId) => `/anonymous/posts/${encodeURIComponent(postId)}`;
const commentPath = (commentId) => `/anonymous/comments/${encodeURIComponent(commentId)}`;

const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Anonymous Zone endpoints. No call ever sends an author, user id, college or branch: the server takes
 * the author from the session and never sends anyone's identity back.
 */
export const anonymousApi = {
  /** Categories, filters, visibility, sorts, report reasons, limits, image rules, the author label. */
  getOptions: () => api.get('/anonymous/options').then(unwrap),
  /** { posts, pagination } */
  list: ({ page = 1, limit = 10, category = 'all', sort = 'recent', search = '', community } = {}) =>
    api.get('/anonymous/posts', { params: { page, limit, category, sort, ...(search && { search }), ...(community && { community }) } }).then(unwrap),
  /** The signed-in student's own anonymous posts: { posts, pagination } */
  mine: ({ page = 1, limit = 10 } = {}) => api.get('/anonymous/me', { params: { page, limit } }).then(unwrap),
  get: (postId) => api.get(path(postId)).then(unwrapPost),

  /** fields: { category, title, content, visibility, community? }; images are optional (up to 4). */
  create: (fields, images = []) => {
    if (images.length === 0) return api.post('/anonymous/posts', fields).then(unwrapPost);
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined && value !== '') form.append(key, value);
    for (const image of images) form.append('images', image);
    return api.post('/anonymous/posts', form, { timeout: UPLOAD_TIMEOUT_MS }).then(unwrapPost);
  },
  /** Only title, content and category can change. */
  update: (postId, changes) => api.put(path(postId), changes).then(unwrapPost),
  remove: (postId) => api.delete(path(postId)).then(unwrap),
  like: (postId) => api.post(`${path(postId)}/like`).then(unwrap),
  unlike: (postId) => api.delete(`${path(postId)}/like`).then(unwrap),

  /** { comments, pagination }, oldest first */
  listComments: (postId, { page = 1, limit = 20 } = {}) => api.get(`${path(postId)}/comments`, { params: { page, limit } }).then(unwrap),
  /** { comment, commentCount } */
  addComment: (postId, content) => api.post(`${path(postId)}/comments`, { content }).then(unwrap),
  updateComment: (commentId, content) => api.put(commentPath(commentId), { content }).then((response) => response.data.data.comment),
  /** { id, postId, commentCount } */
  removeComment: (commentId) => api.delete(commentPath(commentId)).then(unwrap),
};
