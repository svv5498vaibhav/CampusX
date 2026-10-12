import { MEDIA_PRESETS } from '../config/media.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { removeTempFile } from '../utils/tempFiles.js';
import { deliveryUrl, discardMedia, friendlyUploadError, uploadMedia } from './mediaService.js';
import { syncProfileCompletion, toOwnProfile } from './profileService.js';

/** The two profile images and where each one is stored on the user. */
const PROFILE_IMAGES = Object.freeze({
  avatar: { preset: 'profilePhoto', urlField: 'avatarUrl', idField: 'avatarPublicId' },
  cover: { preset: 'coverImage', urlField: 'coverImageUrl', idField: 'coverImagePublicId' },
});

const imageConfig = (kind) => {
  const config = PROFILE_IMAGES[kind];
  if (!config) throw new Error(`Unknown profile image kind: "${kind}"`);
  return { ...config, label: MEDIA_PRESETS[config.preset].label };
};

const changedElsewhere = (label) =>
  ApiError.conflict(`Your ${label.toLowerCase()} was just changed somewhere else. Please refresh and try again.`);

/**
 * Uploads a new avatar or cover for the signed-in student.
 * Order matters: 1) upload the new image, 2) save it, 3) only then delete the old one.
 * If saving fails, or another tab changed the image meanwhile, the new upload is removed again.
 */
export async function replaceProfileImage(kind, userId, filePath) {
  const { preset, urlField, idField, label } = imageConfig(kind);

  try {
    const user = await User.findById(userId).select(`+${idField}`);
    if (!user) throw ApiError.unauthorized('Please log in to continue.');
    const previousPublicId = user[idField] ?? null;

    let uploaded;
    try {
      uploaded = await uploadMedia(filePath, preset, { folder: `${MEDIA_PRESETS[preset].folder}/${userId}` });
    } catch (error) {
      throw friendlyUploadError(error, label);
    }

    let updated;
    try {
      // Only swap if the stored image is still the one we started from.
      updated = await User.findOneAndUpdate(
        { _id: userId, [idField]: previousPublicId },
        { $set: { [urlField]: deliveryUrl(uploaded.publicId, preset, uploaded.version), [idField]: uploaded.publicId } },
        { returnDocument: 'after' },
      );
    } catch (error) {
      await discardMedia(uploaded.publicId);
      throw error;
    }

    if (!updated) {
      await discardMedia(uploaded.publicId);
      throw changedElsewhere(label);
    }

    await discardMedia(previousPublicId);
    await syncProfileCompletion(updated);
    return toOwnProfile(updated);
  } finally {
    // Usually already removed after the upload; this covers every early exit too.
    await removeTempFile(filePath);
  }
}

/**
 * Removes the signed-in student's avatar or cover. The database is cleared first, so the
 * profile never points at a deleted file; the Cloudinary copy is deleted afterwards (best effort).
 * Removing an image that isn't there simply returns the profile.
 */
export async function removeProfileImage(kind, userId) {
  const { urlField, idField, label } = imageConfig(kind);

  const user = await User.findById(userId).select(`+${idField}`);
  if (!user) throw ApiError.unauthorized('Please log in to continue.');

  const publicId = user[idField] ?? null;
  if (!publicId && !user[urlField]) return toOwnProfile(user);

  const updated = await User.findOneAndUpdate(
    { _id: userId, [idField]: publicId },
    { $unset: { [urlField]: 1, [idField]: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) throw changedElsewhere(label);

  await discardMedia(publicId);
  await syncProfileCompletion(updated);
  return toOwnProfile(updated);
}
