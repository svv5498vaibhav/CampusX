import { BYTES_PER_MB, MEDIA_PRESETS } from '../config/media.js';
import {
  ACHIEVEMENT_FILTERS,
  ACHIEVEMENT_RULES,
  ACHIEVEMENT_TYPES,
  SHOWCASE_VISIBILITY,
} from '../data/showcaseOptions.js';
import Achievement from '../models/Achievement.js';
import ApiError from '../utils/ApiError.js';
import { toObjectId } from '../utils/objectId.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { deliveryUrl, discardMedia, friendlyUploadError, uploadMedia } from './mediaService.js';
import { analyzeAchievement, assertCanPublish, ownerModeration, recordOutcome, stricterStatus } from './moderationService.js';
import { getStudentSummaries } from './profileService.js';
import { showcaseVisibleTo, splitUnset } from './showcaseAccess.js';

export const ACHIEVEMENT_NOT_FOUND = 'Achievement not found.';
export const NOT_ACHIEVEMENT_OWNER = 'You can only modify your own achievement.';

// Changing any of these on a reviewed achievement sends it back for review.
const CLAIM_FIELDS = ['title', 'description', 'type', 'organization', 'eventName', 'date', 'rank', 'certificateUrl'];

/*
 * Every function takes `viewer`: the signed-in student's user document (req.user). The owner is always
 * the viewer. verificationStatus is never taken from a request: it only changes through
 * the proof flow below and through moderator review (reviewAchievement).
 */

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The status after the student changes a claim or its proof: reviewed achievements need a new review. */
const statusAfterChange = (proofCount) => (proofCount > 0 ? 'pending' : 'unverified');
const resetReview = { 'verification.reviewedBy': null, 'verification.reviewedAt': null, 'verification.note': null };

// ----------------------------------------------------------------------------- presenting

const proofView = (item) => ({ id: item._id.toString(), url: item.url, kind: item.kind, width: item.width ?? null, height: item.height ?? null });

function toAchievementView(achievement, owner, viewer, { detail = false } = {}) {
  const isOwner = achievement.owner.equals(viewer._id);
  return {
    id: achievement._id.toString(),
    title: achievement.title,
    type: achievement.type,
    organization: achievement.organization ?? '',
    eventName: achievement.eventName ?? '',
    date: achievement.date,
    rank: achievement.rank ?? '',
    skills: [...(achievement.skills ?? [])],
    verificationStatus: achievement.verificationStatus,
    visibility: achievement.visibility,
    proofCount: achievement.proof?.length ?? 0,
    hasCertificateLink: Boolean(achievement.certificateUrl),
    owner,
    isOwner,
    // Only the owner sees that their achievement is held for review.
    ...(isOwner && ownerModeration(achievement.moderationStatus) && { moderation: ownerModeration(achievement.moderationStatus) }),
    createdAt: achievement.createdAt,
    updatedAt: achievement.updatedAt,
    ...(detail && {
      description: achievement.description ?? '',
      certificateUrl: achievement.certificateUrl ?? null,
      proof: (achievement.proof ?? []).map(proofView),
      // The reviewer's note is for the owner only.
      verification: {
        reviewedAt: achievement.verification?.reviewedAt ?? null,
        ...(isOwner && { note: achievement.verification?.note ?? null }),
      },
    }),
  };
}

export async function presentAchievements(achievements, viewer, options) {
  const owners = await getStudentSummaries(achievements.map((item) => item.owner));
  // Achievements whose owner account is no longer active are left out.
  return achievements
    .filter((item) => owners.has(item.owner.toString()))
    .map((item) => toAchievementView(item, owners.get(item.owner.toString()), viewer, options));
}

async function pageOf(match, viewer, { page, limit }) {
  const [achievements, total] = await Promise.all([
    Achievement.find(match).sort({ date: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Achievement.countDocuments(match),
  ]);
  return { achievements: await presentAchievements(achievements, viewer), pagination: { page, limit, total, hasMore: page * limit < total } };
}

// ----------------------------------------------------------------------------- reading

/** Discovery: achievements the viewer may see. `verified` uses verificationStatus = verified only. */
export async function listAchievements(viewer, { type = 'all', verified = false, search, page = 1, limit = ACHIEVEMENT_RULES.pageSize.default }) {
  const conditions = [showcaseVisibleTo(viewer)];
  if (type !== 'all') conditions.push({ type });
  if (verified) conditions.push({ verificationStatus: 'verified' });
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    conditions.push({ $or: [{ title: pattern }, { organization: pattern }, { eventName: pattern }, { skills: pattern }] });
  }
  return pageOf({ $and: conditions }, viewer, { page, limit });
}

/** A student's achievements for their profile, as far as the viewer may see them. */
export async function listUserAchievements(userId, viewer, { page = 1, limit = 6 } = {}) {
  const id = toObjectId(userId);
  if (!id) throw ApiError.notFound("We couldn't find that student.");
  return pageOf({ $and: [{ owner: id }, showcaseVisibleTo(viewer)] }, viewer, { page, limit });
}

/** The viewer's own achievements, every visibility level. */
export async function listMyAchievements(viewer, { page = 1, limit = 50 } = {}) {
  return pageOf({ owner: viewer._id, moderationStatus: { $ne: 'removed' } }, viewer, { page, limit });
}

export async function getAchievement(achievementId, viewer) {
  const id = toObjectId(achievementId);
  const achievement = id ? await Achievement.findOne({ $and: [{ _id: id }, showcaseVisibleTo(viewer)] }).lean() : null;
  if (!achievement) throw ApiError.notFound(ACHIEVEMENT_NOT_FOUND);
  const [view] = await presentAchievements([achievement], viewer, { detail: true });
  if (!view) throw ApiError.notFound(ACHIEVEMENT_NOT_FOUND);
  return view;
}

// ----------------------------------------------------------------------------- writing

/** Creates an achievement for the signed-in student. It always starts unverified. */
export async function createAchievement(viewer, data) {
  if (!viewer.onboardingCompleted) throw ApiError.forbidden('Please finish setting up your campus profile first.');
  await assertCanPublish(viewer);
  const { set } = splitUnset(data, ['certificateUrl']);
  // Trust & Safety checks the claim's text; verification stays a separate, moderator-only process.
  const verdict = await analyzeAchievement(viewer, data);
  const achievement = await Achievement.create({
    ...set,
    owner: viewer._id,
    verificationStatus: 'unverified',
    audience: { college: viewer.college },
    moderationStatus: verdict.status,
  });
  await recordOutcome({ targetType: 'achievement', targetId: achievement._id, ownerId: viewer._id, verdict });
  emitCampusEvent(CAMPUS_EVENTS.ACHIEVEMENT_CREATED, { achievementId: achievement.id, ownerId: viewer.id });
  return getAchievement(achievement.id, viewer);
}

/** The achievement, if the signed-in student owns it: 404 when it doesn't exist, 403 otherwise. */
export async function loadOwnAchievement(achievementId, viewer) {
  const id = toObjectId(achievementId);
  const achievement = id ? await Achievement.findById(id) : null;
  if (!achievement) throw ApiError.notFound(ACHIEVEMENT_NOT_FOUND);
  if (!achievement.owner.equals(viewer._id)) throw ApiError.forbidden(NOT_ACHIEVEMENT_OWNER);
  return achievement;
}

const sameValue = (a, b) => (a instanceof Date || b instanceof Date ? new Date(a ?? 0).getTime() === new Date(b ?? 0).getTime() : (a ?? '') === (b ?? ''));

export async function updateAchievement(achievementId, viewer, changes) {
  const achievement = await loadOwnAchievement(achievementId, viewer);
  if (achievement.moderationStatus === 'removed') throw ApiError.conflict('This achievement was removed and can’t be edited.');
  await assertCanPublish(viewer);
  const { set, unset } = splitUnset(changes, ['certificateUrl']);
  set['audience.college'] = viewer.college;
  // Edits are checked again; they can raise the moderation status but never lower it.
  const previousStatus = achievement.moderationStatus ?? 'approved';
  const merged = Object.fromEntries(['title', 'description', 'organization', 'eventName', 'date', 'certificateUrl'].map((field) => [field, changes[field] ?? achievement[field] ?? '']));
  const verdict = await analyzeAchievement(viewer, merged, { excludeId: achievement._id, isNew: false });
  set.moderationStatus = stricterStatus(previousStatus, verdict.status);

  // A reviewed (or pending) claim that changes needs a fresh review.
  const claimChanged = CLAIM_FIELDS.some((field) => field in changes && !sameValue(changes[field] || null, achievement[field] || null));
  if (claimChanged && achievement.verificationStatus !== 'unverified') {
    Object.assign(set, { verificationStatus: statusAfterChange(achievement.proof.length), ...resetReview });
  }

  const updated = await Achievement.findOneAndUpdate(
    { _id: achievement._id, owner: viewer._id },
    { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) throw ApiError.notFound(ACHIEVEMENT_NOT_FOUND);
  await recordOutcome({ targetType: 'achievement', targetId: achievement._id, ownerId: viewer._id, verdict: { ...verdict, status: set.moderationStatus }, previousStatus });
  emitCampusEvent(CAMPUS_EVENTS.ACHIEVEMENT_UPDATED, { achievementId: achievement.id, ownerId: viewer.id });
  return getAchievement(achievement.id, viewer);
}

/** Deletes the owner's achievement: proof files first (failures logged), then the achievement. */
export async function deleteAchievement(achievementId, viewer) {
  const achievement = await loadOwnAchievement(achievementId, viewer);
  await Promise.all(achievement.proof.map((item) => discardMedia(item.publicId, item.resourceType)));
  const { deletedCount } = await Achievement.deleteOne({ _id: achievement._id, owner: viewer._id });
  if (deletedCount === 0) throw ApiError.notFound(ACHIEVEMENT_NOT_FOUND);
  emitCampusEvent(CAMPUS_EVENTS.ACHIEVEMENT_DELETED, { achievementId: achievement.id, ownerId: viewer.id });
  return { id: achievement.id };
}

// ----------------------------------------------------------------------------- proof

async function uploadProofFile(file, achievementId) {
  const preset = file.presetName; // achievementProofImage | achievementProofPdf
  const uploaded = await uploadMedia(file.path, preset, { folder: `${MEDIA_PRESETS[preset].folder}/${achievementId}` });
  const isPdf = preset === 'achievementProofPdf';
  return {
    url: isPdf ? uploaded.url : deliveryUrl(uploaded.publicId, preset, uploaded.version),
    publicId: uploaded.publicId,
    kind: isPdf ? 'pdf' : 'image',
    resourceType: isPdf ? 'raw' : 'image',
    width: uploaded.width,
    height: uploaded.height,
  };
}

/**
 * Adds proof (certificate, result screenshot, photo) to the owner's achievement and submits it for
 * review: the status becomes "pending". All uploads succeed or none are kept.
 */
export async function addProof(achievementId, viewer, files) {
  const achievement = await loadOwnAchievement(achievementId, viewer);
  const room = ACHIEVEMENT_RULES.proof.max - achievement.proof.length;
  if (files.length > room) {
    throw ApiError.unprocessable(`An achievement can have up to ${ACHIEVEMENT_RULES.proof.max} proof files (${Math.max(room, 0)} more allowed).`, [{ field: 'proof', message: 'Too many proof files.' }]);
  }

  const results = await Promise.allSettled(files.map((file) => uploadProofFile(file, achievement.id)));
  const uploaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const discardAll = () => Promise.all(uploaded.map((item) => discardMedia(item.publicId, item.resourceType)));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    await discardAll();
    throw friendlyUploadError(failure.reason, 'Proof');
  }

  let updated;
  try {
    updated = await Achievement.findOneAndUpdate(
      { _id: achievement._id, owner: viewer._id, $expr: { $lte: [{ $size: '$proof' }, ACHIEVEMENT_RULES.proof.max - uploaded.length] } },
      { $push: { proof: { $each: uploaded } }, $set: { verificationStatus: 'pending', ...resetReview } },
    );
  } catch (error) {
    await discardAll();
    throw error;
  }
  if (!updated) {
    await discardAll();
    throw ApiError.conflict('The achievement changed while uploading. Please refresh and try again.');
  }
  emitCampusEvent(CAMPUS_EVENTS.ACHIEVEMENT_UPDATED, { achievementId: achievement.id, ownerId: viewer.id });
  return getAchievement(achievement.id, viewer);
}

/** Removes one proof file. Changing the proof of a reviewed achievement sends it back for review. */
export async function removeProof(achievementId, proofId, viewer) {
  const achievement = await loadOwnAchievement(achievementId, viewer);
  const item = achievement.proof.find((proof) => proof._id.toString() === proofId);
  if (!item) throw ApiError.notFound('Proof file not found.');
  const remaining = achievement.proof.length - 1;
  await Achievement.updateOne(
    { _id: achievement._id, owner: viewer._id },
    {
      $pull: { proof: { _id: item._id } },
      ...(achievement.verificationStatus !== 'unverified' && { $set: { verificationStatus: statusAfterChange(remaining), ...resetReview } }),
    },
  );
  await discardMedia(item.publicId, item.resourceType);
  emitCampusEvent(CAMPUS_EVENTS.ACHIEVEMENT_UPDATED, { achievementId: achievement.id, ownerId: viewer.id });
  return getAchievement(achievement.id, viewer);
}

// ----------------------------------------------------------------------------- review (moderators)

/**
 * The only way an achievement becomes verified or rejected: a CampusX moderator or admin reviews a
 * pending achievement (the route checks the role). Nobody reviews their own achievement.
 * The admin dashboard (later phase) will use this.
 */
export async function reviewAchievement(achievementId, reviewer, { status, note = '' }) {
  const id = toObjectId(achievementId);
  const achievement = id ? await Achievement.findById(id) : null;
  if (!achievement) throw ApiError.notFound(ACHIEVEMENT_NOT_FOUND);
  if (achievement.owner.equals(reviewer._id)) throw ApiError.forbidden('You can’t review your own achievement.');
  if (achievement.verificationStatus !== 'pending') throw ApiError.conflict('Only achievements with submitted proof (pending) can be reviewed.');

  const updated = await Achievement.findOneAndUpdate(
    { _id: achievement._id, verificationStatus: 'pending' },
    { $set: { verificationStatus: status, 'verification.reviewedBy': reviewer._id, 'verification.reviewedAt': new Date(), 'verification.note': note } },
    { returnDocument: 'after', lean: true },
  );
  if (!updated) throw ApiError.conflict('This achievement changed meanwhile. Please reload it.');
  // Reviewers see the result even for achievements whose visibility would hide them.
  const owners = await getStudentSummaries([updated.owner]);
  emitCampusEvent(CAMPUS_EVENTS.ACHIEVEMENT_REVIEWED, { achievementId: updated._id.toString(), ownerId: updated.owner.toString() });
  return toAchievementView(updated, owners.get(updated.owner.toString()) ?? null, reviewer, { detail: true });
}

// ----------------------------------------------------------------------------- options

const mediaRules = (presetNames) => ({
  maxBytes: Math.max(...presetNames.map((name) => MEDIA_PRESETS[name].maxFileSize)),
  maxMegabytes: Math.max(...presetNames.map((name) => MEDIA_PRESETS[name].maxFileSize)) / BYTES_PER_MB,
  mimeTypes: presetNames.flatMap((name) => MEDIA_PRESETS[name].allowedMimeTypes),
});

export function getAchievementOptions() {
  return {
    types: ACHIEVEMENT_TYPES,
    visibility: SHOWCASE_VISIBILITY,
    filters: ACHIEVEMENT_FILTERS,
    rules: ACHIEVEMENT_RULES,
    media: { proof: mediaRules(['achievementProofImage', 'achievementProofPdf']) },
  };
}
