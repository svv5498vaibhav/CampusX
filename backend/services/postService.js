import mongoose from 'mongoose';
import { BYTES_PER_MB, MEDIA_PRESETS } from '../config/media.js';
import {
  DEFAULT_VISIBILITY,
  FEED_FILTERS,
  MEDIA_LIMIT_MESSAGE,
  POST_RULES,
  POST_TYPES,
  POST_VISIBILITY,
  REPORT_REASONS,
} from '../data/postOptions.js';
import { PUBLIC_STATUSES } from '../config/moderationConfig.js';
import Comment from '../models/Comment.js';
import Community from '../models/Community.js';
import Post from '../models/Post.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { toObjectId } from '../utils/objectId.js';
import { videoPosterUrl } from './mediaService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { MANAGER_ROLES, viewerMemberships } from './communityAccess.js';
import { analyzePost, assertCanPublish, ownerModeration, recordOutcome, stricterStatus, trackEngagement, writeAudit } from './moderationService.js';
import { discardPostMedia, uploadPostFiles } from './postMediaService.js';
import { getStudentSummaries } from './profileService.js';

export const POST_NOT_FOUND = 'Post not found.';
export const NOT_POST_OWNER = 'You can only modify your own post.';
export const EMPTY_POST = 'Post content cannot be empty.';
export const ALREADY_REPORTED = "You've already reported this post. Our team will take a look.";

/*
 * Every function takes `viewer`: the signed-in student's user document, loaded from the database
 * by authenticate (req.user). Author, college and branch always come from it, never from the client.
 */

// Re-exported for the services that already import it from here.
export { toObjectId };

// Moderation statuses other students see (config/moderationConfig.js). Authors also see their own posts
// while they're held for review (with an explanation), but never once they're removed.
const LISTED_STATUSES = PUBLIC_STATUSES;

/**
 * Posts the viewer may see:
 *   public     every CampusX student
 *   campus     students at the author's college
 *   branch     students in the author's branch at the author's college
 *   community  active members of the post's community
 * plus the viewer's own posts. Campus rules apply only when the viewer has a campus identity.
 */
export async function visibleTo(viewer) {
  const audiences = [{ visibility: 'public' }];
  if (viewer.college) {
    audiences.push({ visibility: 'campus', 'audience.college': viewer.college });
    if (viewer.branch) {
      audiences.push({ visibility: 'branch', 'audience.college': viewer.college, 'audience.branch': viewer.branch });
    }
  }
  const memberOf = [...(await viewerMemberships(viewer)).keys()].map((id) => new mongoose.Types.ObjectId(id));
  const listed = { moderationStatus: { $in: LISTED_STATUSES } };
  return {
    $or: [
      { author: viewer._id, moderationStatus: { $ne: 'removed' } },
      { ...listed, community: null, $or: audiences },
      ...(memberOf.length > 0 ? [{ ...listed, community: { $in: memberOf } }] : []),
    ],
  };
}

// ----------------------------------------------------------------------------- presenting posts

const POST_FIELDS = Object.freeze({
  author: 1,
  type: 1,
  content: 1,
  media: 1,
  visibility: 1,
  community: 1,
  commentsCount: 1,
  editedAt: 1,
  moderationStatus: 1,
  createdAt: 1,
  updatedAt: 1,
});

// Counts and the viewer's own like/save state, worked out in the database so the lists of
// student ids never leave it.
const viewerState = (viewerId) => ({
  likeCount: { $size: { $ifNull: ['$likes', []] } },
  likedByCurrentUser: { $in: [viewerId, { $ifNull: ['$likes', []] }] },
  savedByCurrentUser: { $in: [viewerId, { $ifNull: ['$saves', []] }] },
});

const toMediaView = (item) => ({
  id: item._id.toString(),
  type: item.type,
  url: item.url,
  width: item.width ?? null,
  height: item.height ?? null,
  ...(item.type === 'video' && { posterUrl: videoPosterUrl(item.publicId) }),
});

function toPostView(post, { author, community, viewer, viewerRole }) {
  const isOwner = post.author.equals(viewer._id);
  return {
    id: post._id.toString(),
    type: post.type,
    content: post.content ?? '',
    media: (post.media ?? []).map(toMediaView),
    visibility: post.visibility,
    // Set for posts shared inside a community.
    community: community ? { id: community._id.toString(), name: community.name, status: community.status } : null,
    author,
    likeCount: post.likeCount ?? 0,
    commentCount: post.commentsCount ?? 0,
    likedByCurrentUser: Boolean(post.likedByCurrentUser),
    savedByCurrentUser: Boolean(post.savedByCurrentUser),
    isOwner,
    // Community owners and moderators may remove other students' posts in their community.
    canModerate: !isOwner && Boolean(community) && MANAGER_ROLES.includes(viewerRole),
    // Only the author ever sees that their post is held for review (no scores or reasons).
    ...(isOwner && ownerModeration(post.moderationStatus) && { moderation: ownerModeration(post.moderationStatus) }),
    editedAt: post.editedAt ?? null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

/** Newest first. Posts whose author account is no longer active are left out. Also used by search. */
export async function findPosts(match, viewer, { skip = 0, limit } = {}) {
  const pipeline = [{ $match: match }, { $sort: { createdAt: -1, _id: -1 } }];
  if (skip > 0) pipeline.push({ $skip: skip });
  if (limit) pipeline.push({ $limit: limit });
  pipeline.push({ $project: { ...POST_FIELDS, ...viewerState(viewer._id) } });

  const posts = await Post.aggregate(pipeline);
  const communityIds = [...new Set(posts.filter((post) => post.community).map((post) => post.community.toString()))];
  const [authors, communities, roles] = await Promise.all([
    getStudentSummaries(posts.map((post) => post.author)),
    communityIds.length ? Community.find({ _id: { $in: communityIds } }).select('name status').lean() : [],
    viewerMemberships(viewer),
  ]);
  const communitiesById = new Map(communities.map((community) => [community._id.toString(), community]));
  return posts
    .filter((post) => authors.has(post.author.toString()))
    .map((post) => {
      const communityId = post.community?.toString();
      return toPostView(post, {
        author: authors.get(post.author.toString()),
        community: communityId ? communitiesById.get(communityId) : null,
        viewer,
        viewerRole: communityId ? roles.get(communityId) : null,
      });
    });
}

/** One post the viewer can see, or 404 (also for posts they aren't allowed to see). */
export async function getPost(postId, viewer) {
  const id = toObjectId(postId);
  const [post] = id ? await findPosts({ $and: [{ _id: id }, await visibleTo(viewer)] }, viewer) : [];
  if (!post) throw ApiError.notFound(POST_NOT_FOUND);
  return post;
}

async function feedMatch(viewer, filter) {
  // The campus feed: community posts live in their communities.
  const conditions = [await visibleTo(viewer), { community: null }];
  if (filter === 'branch') {
    // Posts shared from the viewer's own branch at their college (none without a campus identity).
    if (!viewer.college || !viewer.branch) return { _id: null };
    conditions.push({ 'audience.college': viewer.college, 'audience.branch': viewer.branch });
  } else if (filter && filter !== 'all') {
    conditions.push({ type: filter });
  }
  return { $and: conditions };
}

/** The campus feed, newest first, a page at a time. */
export async function listFeed(viewer, { page = 1, limit = POST_RULES.pageSize.default, filter = 'all' } = {}) {
  return pageOfPosts(await feedMatch(viewer, filter), viewer, { page, limit });
}

/**
 * A community's posts, newest first. The community service checks membership first; the visibility
 * filter checks it again, so a non-member never receives a community post.
 */
export async function listCommunityFeed(communityId, viewer, { page = 1, limit = POST_RULES.pageSize.default } = {}) {
  return pageOfPosts({ $and: [{ community: communityId }, await visibleTo(viewer)] }, viewer, { page, limit });
}

async function pageOfPosts(match, viewer, { page, limit }) {
  const [posts, total] = await Promise.all([
    findPosts(match, viewer, { skip: (page - 1) * limit, limit }),
    Post.countDocuments(match),
  ]);
  return { posts, pagination: { page, limit, total, hasMore: page * limit < total } };
}

// ----------------------------------------------------------------------------- writing posts

// Photo, video and plain posts are named after what they hold; other kinds keep the chosen type.
const FORMAT_TYPES = new Set(['text', 'photo', 'video']);
function resolveType(type, media) {
  if (!FORMAT_TYPES.has(type)) return type;
  if (media.some((item) => item.type === 'video')) return 'video';
  return media.length > 0 ? 'photo' : 'text';
}

/** Up to maxImages photos, or maxVideos videos, never both. */
function assertMediaMix(kinds) {
  const images = kinds.filter((kind) => kind === 'image').length;
  const videos = kinds.filter((kind) => kind === 'video').length;
  if (images > POST_RULES.media.maxImages || videos > POST_RULES.media.maxVideos || (images > 0 && videos > 0)) {
    throw ApiError.unprocessable(MEDIA_LIMIT_MESSAGE, [{ field: 'media', message: MEDIA_LIMIT_MESSAGE }]);
  }
}

const emptyPostError = () => ApiError.unprocessable(EMPTY_POST, [{ field: 'content', message: EMPTY_POST }]);

/**
 * Creates a post for the signed-in student. Files are uploaded first; if the post can't be
 * saved afterwards, they are deleted again, so a failed attempt leaves nothing behind.
 */
export async function createPost(
  viewer,
  { content = '', type = 'text', visibility = DEFAULT_VISIBILITY, community: communityId },
  files = [],
) {
  if (!viewer.onboardingCompleted || !viewer.college) {
    throw ApiError.forbidden('Please finish setting up your campus profile before posting.');
  }
  if (!content && files.length === 0) throw emptyPostError();
  assertMediaMix(files.map((file) => file.mediaKind));
  // Checked before anything is uploaded.
  await assertCanPublish(viewer);
  const community = communityId ? await assertCanPostIn(communityId, viewer) : null;
  // Trust & Safety: the post is saved with the status its analysis gives it (approved for nearly all).
  const verdict = await analyzePost(viewer, { content });

  const media = await uploadPostFiles(files, viewer._id);
  let post;
  try {
    post = await Post.create({
      author: viewer._id,
      type: resolveType(type, media),
      content,
      media,
      // Community posts are seen by the community's members only.
      visibility: community ? 'community' : visibility,
      community: community?._id ?? null,
      audience: { college: viewer.college, branch: viewer.branch },
      moderationStatus: verdict.status,
    });
  } catch (error) {
    await discardPostMedia(media);
    throw error;
  }

  await recordOutcome({ targetType: 'post', targetId: post._id, ownerId: viewer._id, verdict });
  emitCampusEvent(CAMPUS_EVENTS.POST_CREATED, { postId: post.id, authorId: viewer.id });
  return getPost(post.id, viewer);
}

/** Only active members may post in a community, and only while it is active. */
async function assertCanPostIn(communityId, viewer) {
  const id = toObjectId(String(communityId));
  const community = id ? await Community.findById(id).select('status') : null;
  if (!community) throw ApiError.notFound('Community not found.');
  if (!(await viewerMemberships(viewer)).has(community.id)) {
    throw ApiError.forbidden('Join this community to post in it.');
  }
  if (community.status !== 'active') throw ApiError.conflict('This community is archived, so new posts are closed.');
  return community;
}

/**
 * The post, if the signed-in student wrote it. 404 when it doesn't exist; 403 when it belongs
 * to someone else. Used before anything is uploaded or changed.
 */
export async function loadOwnPost(postId, viewer) {
  const id = toObjectId(postId);
  const post = id ? await Post.findById(id) : null;
  if (!post) throw ApiError.notFound(POST_NOT_FOUND);
  if (!post.author.equals(viewer._id)) throw ApiError.forbidden(NOT_POST_OWNER);
  return post;
}

/**
 * Edits the student's own post: content, type, visibility and media. `keepMedia` lists the ids
 * of existing photos/videos to keep (all are kept when it isn't sent); new files are added after
 * them. Removed files are deleted from Cloudinary only once the post has been saved.
 */
export async function updatePost(postId, viewer, changes, files = []) {
  const post = await loadOwnPost(postId, viewer);
  if (post.moderationStatus === 'removed') throw ApiError.conflict('This post was removed and can’t be edited.');
  await assertCanPublish(viewer);

  const kept = changes.keepMedia === undefined
    ? post.media
    : post.media.filter((item) => changes.keepMedia.includes(item._id.toString()));
  const removed = post.media.filter((item) => !kept.includes(item));
  const content = changes.content ?? post.content;

  if (!content && kept.length + files.length === 0) throw emptyPostError();
  assertMediaMix([...kept.map((item) => item.type), ...files.map((file) => file.mediaKind)]);

  // Edits are checked again; they can raise the moderation status but never lower it.
  const verdict = await analyzePost(viewer, { content }, { excludeId: post._id, isNew: false });
  const moderationStatus = stricterStatus(post.moderationStatus ?? 'approved', verdict.status);

  const uploaded = await uploadPostFiles(files, viewer._id);
  const media = [...kept.map((item) => item.toObject()), ...uploaded];

  let updated;
  try {
    // Matches only the author's post, and only if nobody edited it since it was loaded above.
    updated = await Post.findOneAndUpdate(
      { _id: post._id, author: viewer._id, editedAt: post.editedAt },
      {
        $set: {
          content,
          type: resolveType(changes.type ?? post.type, media),
          // A community post stays inside its community.
          visibility: post.community ? 'community' : (changes.visibility ?? post.visibility),
          media,
          moderationStatus,
          editedAt: new Date(),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  } catch (error) {
    await discardPostMedia(uploaded);
    throw error;
  }

  if (!updated) {
    await discardPostMedia(uploaded);
    if (!(await Post.exists({ _id: post._id }))) throw ApiError.notFound(POST_NOT_FOUND);
    throw ApiError.conflict('This post was just changed somewhere else. Please refresh and try again.');
  }

  await discardPostMedia(removed);
  await recordOutcome({ targetType: 'post', targetId: post._id, ownerId: viewer._id, verdict: { ...verdict, status: moderationStatus }, previousStatus: post.moderationStatus });
  emitCampusEvent(CAMPUS_EVENTS.POST_UPDATED, { postId: post.id, authorId: viewer.id });
  return getPost(post.id, viewer);
}

/**
 * The post, if the signed-in student may delete it: their own post, or (for community owners and
 * moderators) a post inside their community. Everyone else gets 403.
 */
async function loadDeletablePost(postId, viewer) {
  const id = toObjectId(postId);
  const post = id ? await Post.findById(id) : null;
  if (!post) throw ApiError.notFound(POST_NOT_FOUND);
  if (post.author.equals(viewer._id)) return { post, moderated: false };
  const role = post.community ? (await viewerMemberships(viewer)).get(post.community.toString()) : null;
  if (MANAGER_ROLES.includes(role)) return { post, moderated: true };
  throw ApiError.forbidden(NOT_POST_OWNER);
}

/**
 * Deletes a post: its Cloudinary files first, then the post and its comments. Students delete their
 * own posts; community owners and moderators may also remove posts in their community.
 * A file that can't be removed is logged for cleanup but never stops the delete.
 * Reports about the post are kept for the moderation team.
 */
export async function deletePost(postId, viewer) {
  const { post, moderated } = await loadDeletablePost(postId, viewer);

  try {
    await discardPostMedia(post.media);
    const { deletedCount } = await Post.deleteOne(moderated ? { _id: post._id, community: post.community } : { _id: post._id, author: viewer._id });
    if (deletedCount === 0) throw ApiError.notFound(POST_NOT_FOUND);
    await Comment.deleteMany({ post: post._id });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(`Deleting post ${post.id} failed: ${error?.message ?? error}`);
    throw new ApiError(500, 'Unable to delete post. Please try again.');
  }

  // A community owner or moderator removing someone's post is a moderation decision: it goes in the log.
  if (moderated) await writeAudit({ actor: { _id: viewer._id, auditRole: 'community' }, action: 'COMMUNITY_REMOVE', targetType: 'post', targetId: post._id, previousStatus: post.moderationStatus, newStatus: 'deleted', metadata: { community: post.community.toString(), author: post.author.toString() } });
  emitCampusEvent(CAMPUS_EVENTS.POST_DELETED, { postId: post.id, authorId: post.author.toString(), ...(moderated && { removedBy: viewer.id }) });
  return { id: post.id };
}

// ----------------------------------------------------------------------------- likes, saves, reports

/** Adds or removes the viewer in a post's likes/saves. $addToSet keeps it to one entry per student. */
async function setMembership(field, postId, viewer, add) {
  const id = toObjectId(postId);
  const { matchedCount, modifiedCount } = id
    ? await Post.updateOne(
        { $and: [{ _id: id }, await visibleTo(viewer)] },
        add ? { $addToSet: { [field]: viewer._id } } : { $pull: { [field]: viewer._id } },
        // A like or save is not an edit.
        { timestamps: false },
      )
    : { matchedCount: 0, modifiedCount: 0 };
  if (matchedCount === 0) throw ApiError.notFound(POST_NOT_FOUND);

  const [state] = await Post.aggregate([{ $match: { _id: id } }, { $project: viewerState(viewer._id) }]);
  if (!state) throw ApiError.notFound(POST_NOT_FOUND);
  // `changed`: the request really added or removed the student (a repeat changes nothing).
  return { ...state, changed: modifiedCount > 0 };
}

export async function setLike(postId, viewer, liked) {
  const { likeCount, likedByCurrentUser, changed } = await setMembership('likes', postId, viewer, liked);
  // Fake-engagement checks run first, so rankings already know whether this like counts. Only real
  // changes count: repeating a like that's already there is not "liking fast" or toggling.
  if (changed) await trackEngagement({ userId: viewer._id, targetType: 'post', targetId: postId, liked });
  emitCampusEvent(liked ? CAMPUS_EVENTS.POST_LIKED : CAMPUS_EVENTS.POST_UNLIKED, { postId, actorId: viewer.id });
  return { likeCount, likedByCurrentUser };
}

export async function setSave(postId, viewer, saved) {
  const { savedByCurrentUser } = await setMembership('saves', postId, viewer, saved);
  return { savedByCurrentUser };
}

// Reports go through services/reportService.js (Trust & Safety); POST /posts/:id/report still works.

// ----------------------------------------------------------------------------- options

const mediaRules = (presetName) => {
  const preset = MEDIA_PRESETS[presetName];
  return { maxBytes: preset.maxFileSize, maxMegabytes: preset.maxFileSize / BYTES_PER_MB, mimeTypes: preset.allowedMimeTypes };
};

/** Everything the composer and feed need, from the same lists the server validates against. */
export function getPostOptions() {
  return {
    types: POST_TYPES,
    visibility: POST_VISIBILITY,
    defaultVisibility: DEFAULT_VISIBILITY,
    filters: FEED_FILTERS,
    reportReasons: REPORT_REASONS,
    rules: POST_RULES,
    media: { image: mediaRules('postImage'), video: mediaRules('postVideo') },
  };
}
