import api from './api';

const unwrap = (response) => response.data.data;
const unwrapProfile = (response) => response.data.data.profile;

// Photos can be several MB on a phone connection; give uploads far longer than normal requests.
const UPLOAD_TIMEOUT_MS = 120_000;

function uploadImage(path, field, file, onProgress) {
  const form = new FormData();
  form.append(field, file);
  return api
    .post(path, form, {
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
      },
    })
    .then(unwrapProfile);
}

/** Profile endpoints. Every change applies to the signed-in student; no call takes a user id to edit. */
export const profileApi = {
  getOwnProfile: () => api.get('/profile').then(unwrapProfile),
  getPublicProfile: (userId) => api.get(`/profile/${encodeURIComponent(userId)}`).then(unwrapProfile),
  /** Campus options, profile styles and upload limits for the editor. */
  getOptions: () => api.get('/profile/options').then(unwrap),
  updateProfile: (changes) => api.put('/profile', changes).then(unwrapProfile),
  uploadAvatar: (file, { onProgress } = {}) => uploadImage('/profile/avatar', 'photo', file, onProgress),
  deleteAvatar: () => api.delete('/profile/avatar').then(unwrapProfile),
  uploadCover: (file, { onProgress } = {}) => uploadImage('/profile/cover', 'cover', file, onProgress),
  deleteCover: () => api.delete('/profile/cover').then(unwrapProfile),
};
