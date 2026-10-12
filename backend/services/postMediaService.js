import { MEDIA_PRESETS } from '../config/media.js';
import { deliveryUrl, discardMedia, friendlyUploadError, uploadMedia } from './mediaService.js';

const PRESET_FOR_KIND = Object.freeze({ image: 'postImage', video: 'postVideo' });

async function uploadOne(file, authorId) {
  const preset = PRESET_FOR_KIND[file.mediaKind];
  const uploaded = await uploadMedia(file.path, preset, { folder: `${MEDIA_PRESETS[preset].folder}/${authorId}` });
  const isVideo = file.mediaKind === 'video';

  return {
    url: deliveryUrl(uploaded.publicId, preset, uploaded.version, isVideo ? { format: uploaded.format } : {}),
    publicId: uploaded.publicId,
    type: file.mediaKind,
    width: uploaded.width,
    height: uploaded.height,
  };
}

/** Removes a post's files from Cloudinary (best effort; failures are logged for manual cleanup). */
export async function discardPostMedia(items = []) {
  await Promise.all(items.map((item) => discardMedia(item.publicId, item.type === 'video' ? 'video' : 'image')));
}

/**
 * Uploads checked files (from uploadPostMedia) and returns media entries for a post.
 * All or nothing: if any upload fails, the ones that succeeded are deleted again and a friendly
 * error is thrown, so a post is never saved with missing media and no orphan files are left.
 */
export async function uploadPostFiles(files, authorId) {
  if (!files?.length) return [];

  const results = await Promise.allSettled(files.map((file) => uploadOne(file, authorId)));
  const uploaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failure = results.find((result) => result.status === 'rejected');

  if (failure) {
    await discardPostMedia(uploaded);
    throw friendlyUploadError(failure.reason, 'Media');
  }
  return uploaded;
}
