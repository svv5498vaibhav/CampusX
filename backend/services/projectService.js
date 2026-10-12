import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { BYTES_PER_MB, MEDIA_PRESETS } from '../config/media.js';
import {
  PROJECT_CATEGORIES,
  PROJECT_FILTERS,
  PROJECT_RULES,
  PROJECT_STATUSES,
  SHOWCASE_VISIBILITY,
  TEAM_ROLES,
  TECH_SUGGESTIONS,
} from '../data/showcaseOptions.js';
import Project from '../models/Project.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { toObjectId } from '../utils/objectId.js';
import { slugify } from '../utils/slug.js';
import { getCache, setCache } from './cacheService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { deliveryUrl, discardMedia, friendlyUploadError, uploadMedia } from './mediaService.js';
import { analyzeProject, assertCanPublish, ownerModeration, recordOutcome, stricterStatus, trackEngagement } from './moderationService.js';
import { getStudentSummaries, searchStudents } from './profileService.js';
import { showcaseVisibleTo, splitUnset } from './showcaseAccess.js';

export const PROJECT_NOT_FOUND = 'Project not found.';
export const NOT_PROJECT_OWNER = 'You can only modify your own project.';
const URL_FIELDS = ['githubUrl', 'liveUrl', 'demoUrl'];
const VIEW_WINDOW_SECONDS = 6 * 60 * 60;

/*
 * Every function takes `viewer`: the signed-in student's user document (req.user). The owner is always
 * the viewer; owner ids, team statuses, views and likes in the request are never used.
 */

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const newSlug = (title) => `${slugify(title, 'project')}-${crypto.randomBytes(3).toString('hex')}`;

/** Projects the viewer may see. Teammates (invited or accepted) also see the projects they're on. */
export const projectVisibleTo = (viewer) => showcaseVisibleTo(viewer, [{ 'teamMembers.user': viewer._id }]);

// ----------------------------------------------------------------------------- presenting

const CARD_FIELDS = {
  owner: 1, title: 1, slug: 1, shortDescription: 1, category: 1, techStack: 1, status: 1, visibility: 1,
  featured: 1, views: 1, createdAt: 1, updatedAt: 1, moderationStatus: 1,
  thumbnail: { $first: '$images' },
  imageCount: { $size: { $ifNull: ['$images', []] } },
  teamMembers: 1,
};

const viewerState = (viewerId) => ({
  likeCount: { $size: { $ifNull: ['$likes', []] } },
  likedByCurrentUser: { $in: [viewerId, { $ifNull: ['$likes', []] }] },
});

const imageView = (image) => (image ? { id: image._id.toString(), url: image.url, width: image.width ?? null, height: image.height ?? null } : null);

/** Accepted teammates for everyone; invitations only for the owner and the invited student. */
function teamView(project, students, viewer, isOwner) {
  return (project.teamMembers ?? [])
    .filter((member) => member.status === 'accepted' || isOwner || member.user.equals(viewer._id))
    .filter((member) => students.has(member.user.toString()))
    .map((member) => ({ student: students.get(member.user.toString()), role: member.role, status: member.status }));
}

function toProjectCard(project, students, viewer) {
  const isOwner = project.owner.equals(viewer._id);
  const myTeam = (project.teamMembers ?? []).find((member) => member.user.equals(viewer._id));
  return {
    id: project._id.toString(),
    slug: project.slug,
    title: project.title,
    shortDescription: project.shortDescription,
    category: project.category,
    techStack: [...(project.techStack ?? [])],
    status: project.status,
    visibility: project.visibility,
    featured: Boolean(project.featured),
    thumbnail: imageView(project.thumbnail ?? project.images?.[0]),
    imageCount: project.imageCount ?? project.images?.length ?? 0,
    owner: students.get(project.owner.toString()),
    teamSize: 1 + (project.teamMembers ?? []).filter((member) => member.status === 'accepted').length,
    views: project.views ?? 0,
    likeCount: project.likeCount ?? 0,
    likedByCurrentUser: Boolean(project.likedByCurrentUser),
    isOwner,
    myTeamStatus: myTeam?.status ?? null,
    // Only the owner sees that their project is held for review.
    ...(isOwner && ownerModeration(project.moderationStatus) && { moderation: ownerModeration(project.moderationStatus) }),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Cards for a page of projects (aggregation, so the like list never leaves the database). */
export async function findProjectCards(match, viewer, { sort = { createdAt: -1, _id: -1 }, skip = 0, limit }) {
  const pipeline = [{ $match: match }, { $addFields: viewerState(viewer._id) }, { $sort: sort }];
  if (skip > 0) pipeline.push({ $skip: skip });
  if (limit) pipeline.push({ $limit: limit });
  pipeline.push({ $project: { ...CARD_FIELDS, likeCount: 1, likedByCurrentUser: 1 } });
  const projects = await Project.aggregate(pipeline);
  const students = await getStudentSummaries(projects.map((project) => project.owner));
  // Projects whose owner account is no longer active are left out.
  return projects.filter((project) => students.has(project.owner.toString())).map((project) => toProjectCard(project, students, viewer));
}

async function pageOfCards(match, viewer, { page, limit, sort }) {
  const [projects, total] = await Promise.all([
    findProjectCards(match, viewer, { sort, skip: (page - 1) * limit, limit }),
    Project.countDocuments(match),
  ]);
  return { projects, pagination: { page, limit, total, hasMore: page * limit < total } };
}

// ----------------------------------------------------------------------------- reading

const SORTS = {
  new: { createdAt: -1, _id: -1 },
  popular: { likeCount: -1, views: -1, createdAt: -1, _id: -1 },
};

/** Discovery: projects the viewer may see, with category / status filters and search. */
export async function listProjects(viewer, { search, category = 'all', status, sort = 'new', page = 1, limit = PROJECT_RULES.pageSize.default }) {
  const conditions = [projectVisibleTo(viewer), { status: { $ne: 'archived' } }];
  if (category !== 'all') conditions.push({ category });
  if (status) conditions.push({ status });
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    conditions.push({ $or: [{ title: pattern }, { shortDescription: pattern }, { description: pattern }, { techStack: pattern }] });
  }
  return pageOfCards({ $and: conditions }, viewer, { page, limit, sort: SORTS[sort] ?? SORTS.new });
}

/**
 * A student's projects for their profile: ones they own and ones they're an accepted teammate on,
 * as far as the viewer may see them. Featured first.
 */
export async function listUserProjects(userId, viewer, { page = 1, limit = 6 } = {}) {
  const id = toObjectId(userId);
  if (!id) throw ApiError.notFound("We couldn't find that student.");
  const match = {
    $and: [
      { $or: [{ owner: id }, { teamMembers: { $elemMatch: { user: id, status: 'accepted' } } }] },
      projectVisibleTo(viewer),
    ],
  };
  return pageOfCards(match, viewer, { page, limit, sort: { featured: -1, createdAt: -1, _id: -1 } });
}

/** The viewer's own projects (all visibility levels), team projects and pending invitations. */
export async function listMyProjects(viewer) {
  const [projects, teamProjects, invitations] = await Promise.all([
    findProjectCards({ owner: viewer._id, moderationStatus: { $ne: 'removed' } }, viewer, { sort: { featured: -1, createdAt: -1 }, limit: 100 }),
    findProjectCards({ teamMembers: { $elemMatch: { user: viewer._id, status: 'accepted' } } }, viewer, { limit: 100 }),
    findProjectCards({ teamMembers: { $elemMatch: { user: viewer._id, status: 'invited' } } }, viewer, { limit: 50 }),
  ]);
  return { projects, teamProjects, invitations };
}

/** Counts a view at most once per student every few hours; owners' own visits never count. */
async function countView(project, viewer) {
  if (project.owner.equals(viewer._id)) return false;
  const key = `project-view:${project._id}:${viewer._id}`;
  try {
    if (await getCache(key)) return false;
    await setCache(key, 1, VIEW_WINDOW_SECONDS);
    await Project.updateOne({ _id: project._id }, { $inc: { views: 1 } }, { timestamps: false });
    return true;
  } catch (error) {
    logger.warn(`Could not count a project view: ${error?.message ?? error}`);
    return false;
  }
}

/** One project with everything the detail page shows. 404 for projects the viewer can't see. */
export async function getProject(projectId, viewer, { recordView = false } = {}) {
  const id = toObjectId(projectId);
  const project = id ? await Project.findOne({ $and: [{ _id: id }, projectVisibleTo(viewer)] }).select('+likes') : null;
  if (!project) throw ApiError.notFound(PROJECT_NOT_FOUND);
  const counted = recordView ? await countView(project, viewer) : false;

  const students = await getStudentSummaries([project.owner, ...project.teamMembers.map((member) => member.user)]);
  if (!students.has(project.owner.toString())) throw ApiError.notFound(PROJECT_NOT_FOUND);
  const isOwner = project.owner.equals(viewer._id);
  const card = toProjectCard(
    {
      ...project.toObject(),
      likeCount: project.likes.length,
      likedByCurrentUser: project.likes.some((like) => like.equals(viewer._id)),
      views: project.views + (counted ? 1 : 0),
    },
    students,
    viewer,
  );
  return {
    ...card,
    description: project.description,
    githubUrl: project.githubUrl ?? null,
    liveUrl: project.liveUrl ?? null,
    demoUrl: project.demoUrl ?? null,
    images: project.images.map(imageView),
    team: teamView(project, students, viewer, isOwner),
  };
}

// ----------------------------------------------------------------------------- writing

/**
 * Team entries from the owner: real, active, onboarded students (never typed names), not the owner,
 * each once. Students already on the team keep their status; new ones are invited.
 */
async function resolveTeam(team, viewer, existing = []) {
  if (team.length > PROJECT_RULES.team.max) throw ApiError.unprocessable(`A project can have up to ${PROJECT_RULES.team.max} teammates.`);
  const ids = team.map((member) => member.user);
  if (new Set(ids).size !== ids.length) throw ApiError.unprocessable('Each teammate can only be added once.', [{ field: 'teamMembers', message: 'Each teammate can only be added once.' }]);
  if (ids.includes(viewer.id)) throw ApiError.unprocessable('You are already the owner of this project.', [{ field: 'teamMembers', message: 'You are already the owner.' }]);

  const found = await User.find({ _id: { $in: ids }, status: ACCOUNT_STATUSES.ACTIVE, onboardingCompleted: true }).select('_id');
  if (found.length !== ids.length) {
    throw ApiError.unprocessable('One of those teammates isn’t an active CampusX student.', [{ field: 'teamMembers', message: 'Choose teammates from CampusX students.' }]);
  }
  const previous = new Map(existing.map((member) => [member.user.toString(), member]));
  return team.map(({ user, role }) => ({ user: new mongoose.Types.ObjectId(user), role, status: previous.get(user)?.status ?? 'invited' }));
}

/** Creates a project owned by the signed-in student. Images are added afterwards (see addImages). */
export async function createProject(viewer, data) {
  if (!viewer.onboardingCompleted) throw ApiError.forbidden('Please finish setting up your campus profile first.');
  await assertCanPublish(viewer);
  const { teamMembers = [], ...fields } = data;
  const { set } = splitUnset(fields, URL_FIELDS); // empty links are simply not saved
  const verdict = await analyzeProject(viewer, fields);
  const project = await Project.create({
    ...set,
    teamMembers: await resolveTeam(teamMembers, viewer),
    owner: viewer._id,
    slug: newSlug(fields.title),
    audience: { college: viewer.college },
    moderationStatus: verdict.status,
  });
  await recordOutcome({ targetType: 'project', targetId: project._id, ownerId: viewer._id, verdict });
  emitCampusEvent(CAMPUS_EVENTS.PROJECT_CREATED, { projectId: project.id, ownerId: viewer.id });
  announceInvites(project, viewer);
  return getProject(project.id, viewer);
}

/** Tells listeners which students were just invited to the team (not those already on it). */
function announceInvites(project, viewer, previous = []) {
  const before = new Set(previous.map((member) => member.user.toString()));
  const userIds = project.teamMembers.filter((member) => member.status === 'invited' && !before.has(member.user.toString())).map((member) => member.user.toString());
  if (userIds.length) emitCampusEvent(CAMPUS_EVENTS.PROJECT_TEAM_INVITED, { projectId: project.id, ownerId: viewer.id, userIds });
}

/** The project, if the signed-in student owns it: 404 when it doesn't exist (or is hidden), 403 otherwise. */
export async function loadOwnProject(projectId, viewer) {
  const id = toObjectId(projectId);
  const project = id ? await Project.findById(id) : null;
  if (!project) throw ApiError.notFound(PROJECT_NOT_FOUND);
  if (!project.owner.equals(viewer._id)) throw ApiError.forbidden(NOT_PROJECT_OWNER);
  return project;
}

/** Edits the owner's project. `thumbnailImageId` moves that image to the front. */
export async function updateProject(projectId, viewer, changes) {
  const project = await loadOwnProject(projectId, viewer);
  if (project.moderationStatus === 'removed') throw ApiError.conflict('This project was removed and can’t be edited.');
  await assertCanPublish(viewer);
  const { teamMembers, thumbnailImageId, ...fields } = changes;
  const { set, unset } = splitUnset(fields, URL_FIELDS);
  // Edits are checked again; they can raise the moderation status but never lower it.
  const previousStatus = project.moderationStatus ?? 'approved';
  const merged = Object.fromEntries(['title', 'shortDescription', 'description', ...URL_FIELDS].map((field) => [field, fields[field] ?? project[field] ?? '']));
  const verdict = await analyzeProject(viewer, merged, { excludeId: project._id, isNew: false });
  set.moderationStatus = stricterStatus(previousStatus, verdict.status);
  if (fields.title && fields.title !== project.title) set.slug = newSlug(fields.title);
  if (teamMembers !== undefined) set.teamMembers = await resolveTeam(teamMembers, viewer, project.teamMembers);
  if (thumbnailImageId) {
    const index = project.images.findIndex((image) => image._id.toString() === thumbnailImageId);
    if (index === -1) throw ApiError.unprocessable('That image isn’t part of this project.', [{ field: 'thumbnailImageId', message: 'Choose one of the project’s images.' }]);
    const images = project.images.map((image) => image.toObject());
    set.images = [images[index], ...images.filter((_, i) => i !== index)];
  }
  // The owner's current college decides who "My college" reaches.
  set['audience.college'] = viewer.college;

  const updated = await Project.findOneAndUpdate(
    { _id: project._id, owner: viewer._id },
    { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) throw ApiError.notFound(PROJECT_NOT_FOUND);
  await recordOutcome({ targetType: 'project', targetId: project._id, ownerId: viewer._id, verdict: { ...verdict, status: set.moderationStatus }, previousStatus });
  emitCampusEvent(CAMPUS_EVENTS.PROJECT_UPDATED, { projectId: project.id, ownerId: viewer.id });
  if (teamMembers !== undefined) announceInvites(updated, viewer, project.teamMembers);
  return getProject(project.id, viewer);
}

/** Deletes the owner's project: its Cloudinary images first (failures logged), then the project. */
export async function deleteProject(projectId, viewer) {
  const project = await loadOwnProject(projectId, viewer);
  await Promise.all(project.images.map((image) => discardMedia(image.publicId, 'image')));
  const { deletedCount } = await Project.deleteOne({ _id: project._id, owner: viewer._id });
  if (deletedCount === 0) throw ApiError.notFound(PROJECT_NOT_FOUND);
  emitCampusEvent(CAMPUS_EVENTS.PROJECT_DELETED, { projectId: project.id, ownerId: viewer.id });
  return { id: project.id };
}

// ----------------------------------------------------------------------------- images

/**
 * Adds images to the owner's project. All uploads succeed or none are kept; the save only happens
 * while the project still has room, otherwise the uploads are deleted again (no orphans).
 */
export async function addImages(projectId, viewer, files) {
  const project = await loadOwnProject(projectId, viewer);
  const room = PROJECT_RULES.images.max - project.images.length;
  if (files.length > room) {
    throw ApiError.unprocessable(`A project can have up to ${PROJECT_RULES.images.max} images (${Math.max(room, 0)} more allowed).`, [{ field: 'images', message: 'Too many images.' }]);
  }

  const results = await Promise.allSettled(
    files.map((file) => uploadMedia(file.path, 'projectImage', { folder: `${MEDIA_PRESETS.projectImage.folder}/${project.id}` })),
  );
  const uploaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const discardAll = () => Promise.all(uploaded.map((item) => discardMedia(item.publicId, 'image')));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    await discardAll();
    throw friendlyUploadError(failure.reason, 'Project image');
  }

  const images = uploaded.map((item) => ({ url: deliveryUrl(item.publicId, 'projectImage', item.version), publicId: item.publicId, width: item.width, height: item.height }));
  let updated;
  try {
    updated = await Project.findOneAndUpdate(
      { _id: project._id, owner: viewer._id, $expr: { $lte: [{ $size: '$images' }, PROJECT_RULES.images.max - images.length] } },
      { $push: { images: { $each: images } } },
    );
  } catch (error) {
    await discardAll();
    throw error;
  }
  if (!updated) {
    await discardAll();
    throw ApiError.conflict('The project changed while uploading. Please refresh and try again.');
  }
  return getProject(project.id, viewer);
}

/** Removes one image: database first, then Cloudinary (best effort). */
export async function removeImage(projectId, imageId, viewer) {
  const project = await loadOwnProject(projectId, viewer);
  const image = project.images.find((item) => item._id.toString() === imageId);
  if (!image) throw ApiError.notFound('Image not found.');
  await Project.updateOne({ _id: project._id, owner: viewer._id }, { $pull: { images: { _id: image._id } } });
  await discardMedia(image.publicId, 'image');
  return getProject(project.id, viewer);
}

// ----------------------------------------------------------------------------- likes and team

/** Adds or removes the viewer's like. $addToSet keeps it to one per student. */
export async function setLike(projectId, viewer, liked) {
  const id = toObjectId(projectId);
  const { matchedCount, modifiedCount } = id
    ? await Project.updateOne(
        { $and: [{ _id: id }, projectVisibleTo(viewer)] },
        liked ? { $addToSet: { likes: viewer._id } } : { $pull: { likes: viewer._id } },
        { timestamps: false },
      )
    : { matchedCount: 0 };
  if (matchedCount === 0) throw ApiError.notFound(PROJECT_NOT_FOUND);
  if (modifiedCount) await trackEngagement({ userId: viewer._id, targetType: 'project', targetId: id, liked });
  if (modifiedCount) emitCampusEvent(liked ? CAMPUS_EVENTS.PROJECT_LIKED : CAMPUS_EVENTS.PROJECT_UNLIKED, { projectId, actorId: viewer.id });
  const [state] = await Project.aggregate([{ $match: { _id: id } }, { $project: viewerState(viewer._id) }]);
  return { likeCount: state.likeCount, likedByCurrentUser: state.likedByCurrentUser };
}

/** The invited student confirms they worked on the project. */
export async function acceptInvitation(projectId, viewer) {
  const id = toObjectId(projectId);
  const updated = id
    ? await Project.findOneAndUpdate(
        { _id: id, teamMembers: { $elemMatch: { user: viewer._id, status: 'invited' } } },
        { $set: { 'teamMembers.$.status': 'accepted' } },
        { timestamps: false },
      )
    : null;
  if (!updated) throw ApiError.notFound('There is no invitation to this project for you.');
  return getProject(projectId, viewer);
}

/** A teammate leaves (or declines an invitation). Only ever removes the signed-in student. */
export async function leaveTeam(projectId, viewer) {
  const id = toObjectId(projectId);
  const { modifiedCount } = id
    ? await Project.updateOne({ _id: id, 'teamMembers.user': viewer._id }, { $pull: { teamMembers: { user: viewer._id } } }, { timestamps: false })
    : { modifiedCount: 0 };
  if (modifiedCount === 0) throw ApiError.notFound('You aren’t on this project’s team.');
  return { id: projectId };
}

/** Students the owner might add as teammates (search by name). */
export async function findTeamCandidates(search, viewer) {
  return { students: await searchStudents(search, { excludeId: viewer._id }) };
}

// ----------------------------------------------------------------------------- options

const mediaRules = (presetName) => {
  const preset = MEDIA_PRESETS[presetName];
  return { maxBytes: preset.maxFileSize, maxMegabytes: preset.maxFileSize / BYTES_PER_MB, mimeTypes: preset.allowedMimeTypes };
};

export function getProjectOptions() {
  return {
    categories: PROJECT_CATEGORIES,
    statuses: PROJECT_STATUSES,
    visibility: SHOWCASE_VISIBILITY,
    teamRoles: TEAM_ROLES,
    techSuggestions: TECH_SUGGESTIONS,
    filters: PROJECT_FILTERS,
    rules: PROJECT_RULES,
    media: { image: mediaRules('projectImage') },
  };
}
