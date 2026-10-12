import { MEDIA_PRESETS } from '../config/media.js';
import Community from '../models/Community.js';
import ApiError from '../utils/ApiError.js';
import { removeTempFile } from '../utils/tempFiles.js';
import { assertCommunityOwner, getCommunity } from './communityService.js';
import { deliveryUrl, discardMedia, friendlyUploadError, uploadMedia } from './mediaService.js';

/** The two community images and where each one is stored. */
const COMMUNITY_IMAGES = Object.freeze({
  icon: { preset: 'communityIcon', urlField: 'iconUrl', idField: 'iconPublicId' },
  cover: { preset: 'communityCover', urlField: 'coverImageUrl', idField: 'coverImagePublicId' },
});

const imageConfig = (kind) => {
  const config = COMMUNITY_IMAGES[kind];
  if (!config) throw new Error(`Unknown community image kind: "${kind}"`);
  return { ...config, label: MEDIA_PRESETS[config.preset].label };
};

const changedElsewhere = (label) =>
  ApiError.conflict(`The ${label.toLowerCase()} was just changed somewhere else. Please refresh and try again.`);

/**
 * Uploads a new icon or cover (owners only). Order: 1) upload, 2) save only if the stored image is
 * still the one we started from, 3) delete the old file. If saving fails the upload is removed, so a
 * community never points at a missing file and no orphan is left.
 */
export async function replaceCommunityImage(kind, communityId, viewer, filePath) {
  const { preset, urlField, idField, label } = imageConfig(kind);
  try {
    const community = await assertCommunityOwner(communityId, viewer);
    const current = await Community.findById(community._id).select(`+${idField}`);
    const previousPublicId = current?.[idField] ?? null;

    let uploaded;
    try {
      uploaded = await uploadMedia(filePath, preset, { folder: `${MEDIA_PRESETS[preset].folder}/${community.id}` });
    } catch (error) {
      throw friendlyUploadError(error, label);
    }

    let updated;
    try {
      updated = await Community.findOneAndUpdate(
        { _id: community._id, [idField]: previousPublicId },
        { $set: { [urlField]: deliveryUrl(uploaded.publicId, preset, uploaded.version), [idField]: uploaded.publicId } },
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
    return getCommunity(community.id, viewer);
  } finally {
    await removeTempFile(filePath);
  }
}

/** Removes the icon or cover: database first, then Cloudinary (best effort). */
export async function removeCommunityImage(kind, communityId, viewer) {
  const { urlField, idField, label } = imageConfig(kind);
  const community = await assertCommunityOwner(communityId, viewer);
  const current = await Community.findById(community._id).select(`+${idField}`);
  const publicId = current?.[idField] ?? null;
  if (!publicId && !current?.[urlField]) return getCommunity(community.id, viewer);

  const updated = await Community.findOneAndUpdate({ _id: community._id, [idField]: publicId }, { $unset: { [urlField]: 1, [idField]: 1 } });
  if (!updated) throw changedElsewhere(label);
  await discardMedia(publicId);
  return getCommunity(community.id, viewer);
}
