import { matchedData } from 'express-validator';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getProfileSocial } from '../services/followService.js';
import { removeProfileImage, replaceProfileImage } from '../services/profileMediaService.js';
import * as profileService from '../services/profileService.js';

// Profiles change often and include private details for the owner: never cache them.
const noStore = (res) => res.set('Cache-Control', 'no-store');

export async function getOwnProfile(req, res) {
  noStore(res);
  const profile = await profileService.getOwnProfile(req.user.id);
  const social = await getProfileSocial(req.user, req.user._id);
  return sendSuccess(res, { message: 'Your profile', data: { profile: { ...profile, social } } });
}

/** Another student's profile, with follower counts and how the viewer is connected to them. */
export async function getPublicProfile(req, res) {
  noStore(res);
  const profile = await profileService.getPublicProfile(req.params.userId, req.user.id);
  const social = await getProfileSocial(req.user, profile.id);
  return sendSuccess(res, { message: 'Student profile', data: { profile: { ...profile, social } } });
}

export async function getEditorOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Profile options', data: await profileService.getProfileEditorOptions() });
}

export async function updateProfile(req, res) {
  // Only validated fields reach the service: userId, role, email, media fields and the like are
  // ignored, and the account is always the signed-in one.
  const changes = matchedData(req, { locations: ['body'] });
  if (Object.keys(changes).length === 0) {
    throw ApiError.unprocessable('There is nothing to update.');
  }
  noStore(res);
  const profile = await profileService.updateProfile(req.user.id, changes);
  return sendSuccess(res, { message: 'Profile updated', data: { profile } });
}

const imageHandlers = (kind, updatedMessage, removedMessage) => ({
  upload: async (req, res) => {
    noStore(res);
    const profile = await replaceProfileImage(kind, req.user.id, req.file.path);
    return sendSuccess(res, { message: updatedMessage, data: { profile } });
  },
  remove: async (req, res) => {
    noStore(res);
    const profile = await removeProfileImage(kind, req.user.id);
    return sendSuccess(res, { message: removedMessage, data: { profile } });
  },
});

export const avatar = imageHandlers('avatar', 'Profile photo updated', 'Profile photo removed');
export const cover = imageHandlers('cover', 'Cover image updated', 'Cover image removed');

/** Any attempt to change a profile by id is refused: students can only change their own, via /profile. */
export function refuseOtherProfiles(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return next(ApiError.forbidden('You can only change your own profile.'));
}
