import { MEDIA_PRESETS } from '../config/media.js';
import Opportunity from '../models/Opportunity.js';
import ApiError from '../utils/ApiError.js';
import { removeTempFile } from '../utils/tempFiles.js';
import { deliveryUrl, discardMedia, friendlyUploadError, uploadMedia } from './mediaService.js';
import { getOpportunity, loadForImages } from './opportunityService.js';

/** The two opportunity images and where each one is stored. Moderators/admins only (checked by the routes). */
const OPPORTUNITY_IMAGES = Object.freeze({
  image: { preset: 'opportunityImage', field: 'image' },
  logo: { preset: 'opportunityLogo', field: 'organizerLogo' },
});

const imageConfig = (kind) => {
  const config = OPPORTUNITY_IMAGES[kind];
  if (!config) throw new Error(`Unknown opportunity image kind: "${kind}"`);
  return { ...config, label: MEDIA_PRESETS[config.preset].label };
};

const changedElsewhere = (label) =>
  ApiError.conflict(`The ${label.toLowerCase()} was just changed somewhere else. Please refresh and try again.`);

/**
 * Uploads a new image or organizer logo. Order: 1) upload, 2) save only if the stored image is still the
 * one we started from, 3) delete the old file. If saving fails the upload is removed again.
 */
export async function replaceOpportunityImage(kind, opportunityId, viewer, filePath) {
  const { preset, field, label } = imageConfig(kind);
  try {
    const opportunity = await loadForImages(opportunityId);
    const previousPublicId = opportunity[field]?.publicId ?? null;

    let uploaded;
    try {
      uploaded = await uploadMedia(filePath, preset, { folder: `${MEDIA_PRESETS[preset].folder}/${opportunity.id}` });
    } catch (error) {
      throw friendlyUploadError(error, label);
    }

    let updated;
    try {
      updated = await Opportunity.findOneAndUpdate(
        { _id: opportunity._id, [`${field}.publicId`]: previousPublicId },
        { $set: { [field]: { url: deliveryUrl(uploaded.publicId, preset, uploaded.version), publicId: uploaded.publicId }, updatedBy: viewer._id } },
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
    return getOpportunity(opportunity.id, viewer);
  } finally {
    await removeTempFile(filePath);
  }
}

/** Removes the image or logo: database first, then Cloudinary (best effort). */
export async function removeOpportunityImage(kind, opportunityId, viewer) {
  const { field, label } = imageConfig(kind);
  const opportunity = await loadForImages(opportunityId);
  const publicId = opportunity[field]?.publicId ?? null;
  if (!publicId && !opportunity[field]?.url) return getOpportunity(opportunity.id, viewer);

  const updated = await Opportunity.findOneAndUpdate(
    { _id: opportunity._id, [`${field}.publicId`]: publicId },
    { $unset: { [field]: 1 }, $set: { updatedBy: viewer._id } },
  );
  if (!updated) throw changedElsewhere(label);
  await discardMedia(publicId);
  return getOpportunity(opportunity.id, viewer);
}
