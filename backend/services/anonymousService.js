import mongoose from 'mongoose';
import { BYTES_PER_MB, MEDIA_PRESETS } from '../config/media.js';
import {
  ANONYMOUS_AUTHOR_LABEL,
  ANONYMOUS_CATEGORIES,
  ANONYMOUS_FILTERS,
  ANONYMOUS_RATE_LIMITS,
  ANONYMOUS_REPORT_REASONS,
  ANONYMOUS_RULES,
  ANONYMOUS_SORTS,
  ANONYMOUS_VISIBILITY,
  DEFAULT_ANONYMOUS_VISIBILITY,
  LISTED_MODERATION_STATUSES,
} from '../data/anonymousOptions.js';
import AnonymousPost from '../models/AnonymousPost.js';
import Community from '../models/Community.js';
import ApiError from '../utils/ApiError.js';
import { ImageMetadataError, stripImageMetadata } from '../utils/imageMetadata.js';
import { toObjectId } from '../utils/objectId.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { viewerMemberships } from './communityAccess.js';
import { deliveryUrl, discardMedia, friendlyUploadError, uploadMedia } from './mediaService.js';
import { analyzeAnonymousPost, assertCanPublish, recordOutcome, stricterStatus, trackEngagement } from './moderationService.js';

export const ANONYMOUS_POST_NOT_FOUND = 'Post not found.';
export const NOT_ANONYMOUS_POST_OWNER = 'You can only modify your own anonymous post.';

/*
 * Every function takes `viewer`: the signed-in student's user document (req.user). The author of a new
 * post is always the viewer; college, branch and memberships are read from the viewer, never from the
 * request. Responses are built from an allow-list: the author, the college a post was shared from, and
 * the list of who liked it never leave the server. The only place that may reveal an author is
 * anonymousModeration.js, for moderators and admins.
 */

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ----------------------------------------------------------------------------- who can read what

/** Posts the viewer may read: active, not removed by moderators, and in an audience they belong to. */
export async function readableBy(viewer) {
  const memberOf = [...(await viewerMemberships(viewer)).keys()].map((id) => new mongoose.Types.ObjectId(id));
  const audiences = [{ visibility: 'campus' }];
  if (viewer.college) audiences.push({ visibility: 'college', 'audience.college': viewer.college });
  if (memberOf.length) audiences.push({ visibility: 'community', community: { $in: memberOf } });
  return { status: 'active', moderationStatus: { $in: LISTED_MODERATION_STATUSES }, $or: audiences };
}

/** Readable posts, plus the viewer's own (unless they deleted it) so they can always manage them. */
async function openableBy(viewer) {
  return { $or: [await readableBy(viewer), { author: viewer._id, status: { $ne: 'deleted' } }] };
}

// ----------------------------------------------------------------------------- presenting

const VIEW_FIELDS = Object.freeze({
  category: 1,
  title: 1,
  content: 1,
  media: 1,
  visibility: 1,
  community: 1,
  commentsCount: 1,
  editedAt: 1,
  createdAt: 1,
  status: 1,
  moderationStatus: 1,
});

// Worked out in the database, so neither the author nor the like list ever leaves it.
const viewerState = (viewerId) => ({
  likeCount: { $size: { $ifNull: ['$likes', []] } },
  likedByCurrentUser: { $in: [viewerId, { $ifNull: ['$likes', []] }] },
  isOwner: { $eq: ['$author', viewerId] },
});

const SORTS = {
  recent: { createdAt: -1, _id: -1 },
  discussed: { commentsCount: -1, createdAt: -1, _id: -1 },
};

/** The only shape an anonymous post is ever sent in. */
function toAnonymousPostView(post, community) {
  return {
    id: post._id.toString(),
    anonymous: true,
    category: post.category,
    title: post.title,
    content: post.content,
    media: (post.media ?? []).map((item) => ({ id: item._id.toString(), url: item.url, width: item.width ?? null, height: item.height ?? null })),
    visibility: post.visibility,
    community: community ? { id: community._id.toString(), name: community.name } : null,
    likeCount: post.likeCount ?? 0,
    commentCount: post.commentsCount ?? 0,
    likedByCurrentUser: Boolean(post.likedByCurrentUser),
    isOwner: Boolean(post.isOwner),
    edited: Boolean(post.editedAt),
    editedAt: post.editedAt ?? null,
    createdAt: post.createdAt,
    // Only the author sees whether moderators have acted on their post.
    ...(post.isOwner && { status: post.status, moderationStatus: post.moderationStatus }),
  };
}

/** Views (never the author) for a match, also used by search. */
export async function findPosts(match, viewer, { sort = SORTS.recent, skip = 0, limit } = {}) {
  const pipeline = [{ $match: match }, { $sort: sort }];
  if (skip > 0) pipeline.push({ $skip: skip });
  if (limit) pipeline.push({ $limit: limit });
  pipeline.push({ $project: { ...VIEW_FIELDS, ...viewerState(viewer._id) } });
  const posts = await AnonymousPost.aggregate(pipeline);
  const communityIds = [...new Set(posts.filter((post) => post.community).map((post) => post.community.toString()))];
  const communities = communityIds.length ? await Community.find({ _id: { $in: communityIds } }).select('name').lean() : [];
  const byId = new Map(communities.map((community) => [community._id.toString(), community]));
  return posts.map((post) => toAnonymousPostView(post, post.community ? byId.get(post.community.toString()) : null));
}

async function pageOf(match, viewer, { sort, page, limit }) {
  const [posts, total] = await Promise.all([
    findPosts(match, viewer, { sort: SORTS[sort] ?? SORTS.recent, skip: (page - 1) * limit, limit }),
    AnonymousPost.countDocuments(match),
  ]);
  return { posts, pagination: { page, limit, total, hasMore: page * limit < total } };
}

// ----------------------------------------------------------------------------- reading

/**
 * The Anonymous Zone feed: posts the viewer may read, newest (or most discussed) first. Search looks at
 * titles and content only, inside the same visibility rules. `community` narrows it to one of the
 * viewer's own communities.
 */
export async function listAnonymousPosts(viewer, { search, category = 'all', sort = 'recent', community, page = 1, limit = ANONYMOUS_RULES.pageSize.default } = {}) {
  const conditions = [await readableBy(viewer)];
  if (category !== 'all') conditions.push({ category });
  if (community) {
    const id = toObjectId(community);
    if (!id || !(await viewerMemberships(viewer)).has(community)) throw ApiError.forbidden('Join this community to read its anonymous posts.');
    conditions.push({ community: id });
  }
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    conditions.push({ $or: [{ title: pattern }, { content: pattern }] });
  }
  return pageOf({ $and: conditions }, viewer, { sort, page, limit });
}

/** The viewer's own anonymous posts (not deleted ones), so they can edit or delete them. */
export async function listMyAnonymousPosts(viewer, { page = 1, limit = ANONYMOUS_RULES.pageSize.default } = {}) {
  return pageOf({ author: viewer._id, status: { $ne: 'deleted' } }, viewer, { sort: 'recent', page, limit });
}

export async function getAnonymousPost(postId, viewer) {
  const id = toObjectId(postId);
  const [post] = id ? await findPosts({ $and: [{ _id: id }, await openableBy(viewer)] }, viewer) : [];
  if (!post) throw ApiError.notFound(ANONYMOUS_POST_NOT_FOUND);
  return post;
}

/** A post the viewer may read (lean, without its author), or 404. */
export async function loadReadablePost(postId, viewer, select) {
  const id = toObjectId(postId);
  const query = id ? AnonymousPost.findOne({ $and: [{ _id: id }, await readableBy(viewer)] }) : null;
  const post = query ? await (select ? query.select(select) : query).lean() : null;
  if (!post) throw ApiError.notFound(ANONYMOUS_POST_NOT_FOUND);
  return post;
}

// ----------------------------------------------------------------------------- images

/**
 * Uploads a new post's photos: metadata (including any GPS location) is removed first, files go to a
 * folder named after the post (never the student), and either all succeed or none are kept.
 */
async function uploadImages(files, postId) {
  if (!files?.length) return [];
  for (const file of files) {
    try {
      await stripImageMetadata(file.path, file.detectedType);
    } catch (error) {
      if (!(error instanceof ImageMetadataError)) throw error;
      throw ApiError.unprocessable('We couldn’t read one of those images. Please choose a different one.', [{ field: 'images', message: 'Please choose a different image.' }]);
    }
  }
  const folder = `${MEDIA_PRESETS.anonymousImage.folder}/${postId}`;
  const results = await Promise.allSettled(files.map((file) => uploadMedia(file.path, 'anonymousImage', { folder })));
  const uploaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    await discardImages(uploaded);
    throw friendlyUploadError(failure.reason, 'Image');
  }
  return uploaded.map((item) => ({ url: deliveryUrl(item.publicId, 'anonymousImage', item.version), publicId: item.publicId, width: item.width, height: item.height }));
}

const discardImages = (items) => Promise.all(items.map((item) => discardMedia(item.publicId, 'image')));

// ----------------------------------------------------------------------------- writing

/** Only active members may post in a community, and only while it is active. */
async function assertCanPostIn(communityId, viewer) {
  const id = toObjectId(String(communityId));
  const community = id ? await Community.findById(id).select('status').lean() : null;
  if (!community) throw ApiError.notFound('Community not found.');
  if (!(await viewerMemberships(viewer)).has(id.toString())) throw ApiError.forbidden('Join this community to post in it.');
  if (community.status !== 'active') throw ApiError.conflict('This community is archived, so new posts are closed.');
  return community;
}

/**
 * Creates an anonymous post. The author is always the signed-in student; nothing in the request can
 * name another. A community post goes to members only, and only if the student is one.
 */
export async function createAnonymousPost(viewer, data, files = []) {
  if (!viewer.onboardingCompleted || !viewer.college) {
    throw ApiError.forbidden('Please finish setting up your campus profile before posting.');
  }
  // Anonymous doesn't mean unrestricted: the same Trust & Safety checks apply (the author stays internal).
  await assertCanPublish(viewer);
  let visibility = data.visibility ?? DEFAULT_ANONYMOUS_VISIBILITY;
  let community = null;
  if (data.community || visibility === 'community') {
    if (!data.community) throw ApiError.unprocessable('Choose one of your communities.', [{ field: 'community', message: 'Choose one of your communities.' }]);
    // Checked before anything is uploaded.
    community = await assertCanPostIn(data.community, viewer);
    visibility = 'community';
  }

  const verdict = await analyzeAnonymousPost(viewer, { title: data.title, content: data.content });
  const postId = new mongoose.Types.ObjectId();
  const media = await uploadImages(files, postId);
  try {
    await AnonymousPost.create({
      _id: postId,
      author: viewer._id,
      category: data.category,
      title: data.title,
      content: data.content,
      media,
      visibility,
      community: community?._id ?? null,
      audience: { college: viewer.college },
      moderationStatus: verdict.status,
    });
  } catch (error) {
    await discardImages(media);
    throw error;
  }
  await recordOutcome({ targetType: 'anonymousPost', targetId: postId, ownerId: viewer._id, verdict });

  // Ids only: listeners (later phases) must never reveal the author.
  emitCampusEvent(CAMPUS_EVENTS.ANONYMOUS_POST_CREATED, { postId: postId.toString() });
  return getAnonymousPost(postId.toString(), viewer);
}

/**
 * The post, if the signed-in student wrote it (and hasn't deleted it). 404 when it doesn't exist or
 * isn't readable for them; 403 when they can read it but it isn't theirs.
 */
export async function loadOwnPost(postId, viewer) {
  const id = toObjectId(postId);
  const post = id ? await AnonymousPost.findOne({ _id: id, status: { $ne: 'deleted' } }).select('+author') : null;
  if (!post) throw ApiError.notFound(ANONYMOUS_POST_NOT_FOUND);
  if (!post.author.equals(viewer._id)) {
    if (!(await AnonymousPost.exists({ $and: [{ _id: id }, await readableBy(viewer)] }))) throw ApiError.notFound(ANONYMOUS_POST_NOT_FOUND);
    throw ApiError.forbidden(NOT_ANONYMOUS_POST_OWNER);
  }
  return post;
}

/** The author edits the title, content or category. Visibility, community and moderation stay as they are. */
export async function updateAnonymousPost(postId, viewer, changes) {
  const post = await loadOwnPost(postId, viewer);
  if (post.moderationStatus === 'removed') throw ApiError.conflict('This post was removed and can’t be edited.');
  await assertCanPublish(viewer);
  const set = {};
  for (const field of ['title', 'content', 'category']) if (changes[field] !== undefined) set[field] = changes[field];
  // Edits are checked again; they can raise the moderation status but never lower it.
  const previousStatus = post.moderationStatus ?? 'approved';
  const verdict = await analyzeAnonymousPost(viewer, { title: set.title ?? post.title, content: set.content ?? post.content }, { excludeId: post._id, isNew: false });
  set.moderationStatus = stricterStatus(previousStatus, verdict.status);
  const { matchedCount } = await AnonymousPost.updateOne(
    { _id: post._id, author: viewer._id, status: { $ne: 'deleted' } },
    { $set: { ...set, editedAt: new Date() } },
    { runValidators: true },
  );
  if (matchedCount === 0) throw ApiError.notFound(ANONYMOUS_POST_NOT_FOUND);
  await recordOutcome({ targetType: 'anonymousPost', targetId: post._id, ownerId: viewer._id, verdict: { ...verdict, status: set.moderationStatus }, previousStatus });
  emitCampusEvent(CAMPUS_EVENTS.ANONYMOUS_POST_UPDATED, { postId: post.id });
  return getAnonymousPost(post.id, viewer);
}

/**
 * The author deletes their post. It disappears for everyone at once but is kept (status "deleted") with
 * its comments, reports and photos, so moderators can still look into abuse.
 */
export async function deleteAnonymousPost(postId, viewer) {
  const post = await loadOwnPost(postId, viewer);
  const { matchedCount } = await AnonymousPost.updateOne(
    { _id: post._id, author: viewer._id, status: { $ne: 'deleted' } },
    { $set: { status: 'deleted', deletedAt: new Date() } },
  );
  if (matchedCount === 0) throw ApiError.notFound(ANONYMOUS_POST_NOT_FOUND);
  emitCampusEvent(CAMPUS_EVENTS.ANONYMOUS_POST_DELETED, { postId: post.id });
  return { id: post.id };
}

/** Adds or removes the viewer's like. Only the count and the viewer's own state are returned. */
export async function setLike(postId, viewer, liked) {
  const id = toObjectId(postId);
  const { matchedCount, modifiedCount } = id
    ? await AnonymousPost.updateOne(
        { $and: [{ _id: id }, await readableBy(viewer)] },
        liked ? { $addToSet: { likes: viewer._id } } : { $pull: { likes: viewer._id } },
        { timestamps: false },
      )
    : { matchedCount: 0 };
  if (matchedCount === 0) throw ApiError.notFound(ANONYMOUS_POST_NOT_FOUND);
  if (modifiedCount) await trackEngagement({ userId: viewer._id, targetType: 'anonymousPost', targetId: id, liked });
  // A new like from someone other than the author. The event carries the post id only, never who liked.
  if (liked && modifiedCount && !(await AnonymousPost.exists({ _id: id, author: viewer._id }))) {
    emitCampusEvent(CAMPUS_EVENTS.ANONYMOUS_POST_LIKED, { postId: id.toString() });
  }
  const { likeCount, likedByCurrentUser } = viewerState(viewer._id);
  const [state] = await AnonymousPost.aggregate([{ $match: { _id: id } }, { $project: { _id: 0, likeCount, likedByCurrentUser } }]);
  return state;
}

// ----------------------------------------------------------------------------- options

export function getAnonymousOptions() {
  const image = MEDIA_PRESETS.anonymousImage;
  return {
    authorLabel: ANONYMOUS_AUTHOR_LABEL,
    categories: ANONYMOUS_CATEGORIES,
    filters: ANONYMOUS_FILTERS,
    visibility: ANONYMOUS_VISIBILITY,
    defaultVisibility: DEFAULT_ANONYMOUS_VISIBILITY,
    sorts: ANONYMOUS_SORTS,
    reportReasons: ANONYMOUS_REPORT_REASONS,
    rules: ANONYMOUS_RULES,
    rateLimits: Object.fromEntries(Object.entries(ANONYMOUS_RATE_LIMITS).map(([kind, { windowMinutes, max }]) => [kind, { windowMinutes, max }])),
    media: { image: { maxBytes: image.maxFileSize, maxMegabytes: image.maxFileSize / BYTES_PER_MB, mimeTypes: image.allowedMimeTypes, maxImages: ANONYMOUS_RULES.media.maxImages } },
  };
}
