import { OWNER_ONLY_STATUSES, PUBLIC_STATUSES } from '../config/moderationConfig.js';
import { LISTED_MODERATION_STATUSES } from '../data/anonymousOptions.js';
import AnonymousComment from '../models/AnonymousComment.js';
import AnonymousPost from '../models/AnonymousPost.js';
import ApiError from '../utils/ApiError.js';
import { toObjectId } from '../utils/objectId.js';
import { ANONYMOUS_POST_NOT_FOUND, loadReadablePost, readableBy } from './anonymousService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { analyzeAnonymousComment, assertCanPublish, ownerModeration, recordOutcome, stricterStatus } from './moderationService.js';

export const COMMENT_NOT_FOUND = 'Comment not found.';
export const NOT_COMMENT_OWNER = 'You can only modify your own comment.';

/*
 * Comments in the Anonymous Zone. Like campus comments, the author is always the signed-in student and
 * only they can edit or delete their comment; unlike campus comments, nobody else ever learns who wrote
 * it. Every comment is shown as "Anonymous Student".
 */

/** The only shape an anonymous comment is ever sent in. */
const toCommentView = (comment, viewer) => ({
  id: comment._id.toString(),
  postId: comment.post.toString(),
  anonymous: true,
  content: comment.content,
  isOwner: comment.author.equals(viewer._id),
  edited: Boolean(comment.editedAt),
  editedAt: comment.editedAt ?? null,
  createdAt: comment.createdAt,
  // Only the author sees that their comment is held for review.
  ...(comment.author.equals(viewer._id) && ownerModeration(comment.moderationStatus) && { moderation: ownerModeration(comment.moderationStatus) }),
});

const commentCountOf = async (postId) => (await AnonymousPost.findById(postId).select('commentsCount').lean())?.commentsCount ?? 0;
const LISTED = { status: 'active', moderationStatus: { $in: LISTED_MODERATION_STATUSES } };
// What a reader sees: listed comments, plus their own while held for review.
const shownTo = (viewer) => ({ status: 'active', $or: [{ moderationStatus: { $in: LISTED_MODERATION_STATUSES } }, { author: viewer._id, moderationStatus: { $in: OWNER_ONLY_STATUSES } }] });
const isPublic = (status) => PUBLIC_STATUSES.includes(status ?? 'approved');

/** Oldest first, so a conversation reads top to bottom. */
export async function listComments(postId, viewer, { page = 1, limit = 20 } = {}) {
  const post = await loadReadablePost(postId, viewer, '_id');
  const match = { post: post._id, ...shownTo(viewer) };
  const [comments, total] = await Promise.all([
    AnonymousComment.find(match).select('+author').sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    AnonymousComment.countDocuments(match),
  ]);
  return { comments: comments.map((comment) => toCommentView(comment, viewer)), pagination: { page, limit, total, hasMore: page * limit < total } };
}

export async function addComment(postId, viewer, content) {
  const post = await loadReadablePost(postId, viewer, '_id');
  await assertCanPublish(viewer);
  const verdict = await analyzeAnonymousComment(viewer, { content });
  const comment = await AnonymousComment.create({ post: post._id, author: viewer._id, content, moderationStatus: verdict.status });
  // If the post was deleted or hidden meanwhile, take the comment back out. Held comments aren't counted.
  const { matchedCount } = await AnonymousPost.updateOne({ _id: post._id, status: 'active' }, { $inc: { commentsCount: isPublic(verdict.status) ? 1 : 0 } }, { timestamps: false });
  if (matchedCount === 0) {
    await AnonymousComment.deleteOne({ _id: comment._id });
    throw ApiError.notFound(ANONYMOUS_POST_NOT_FOUND);
  }
  await recordOutcome({ targetType: 'anonymousComment', targetId: comment._id, ownerId: viewer._id, verdict });
  // Ids only: a later notification says "Someone commented on your anonymous post", never who.
  emitCampusEvent(CAMPUS_EVENTS.ANONYMOUS_POST_COMMENTED, { postId: post._id.toString(), commentId: comment.id });
  return { comment: toCommentView(comment, viewer), commentCount: await commentCountOf(post._id) };
}

/**
 * The comment, if the signed-in student wrote it: 404 when it doesn't exist or its post isn't readable
 * for them, 403 when it is someone else's.
 */
async function loadOwnComment(commentId, viewer) {
  const id = toObjectId(commentId);
  const comment = id ? await AnonymousComment.findOne({ _id: id, status: { $ne: 'deleted' } }).select('+author') : null;
  if (!comment) throw ApiError.notFound(COMMENT_NOT_FOUND);
  if (!comment.author.equals(viewer._id)) {
    if (!(await AnonymousPost.exists({ $and: [{ _id: comment.post }, await readableBy(viewer)] }))) throw ApiError.notFound(COMMENT_NOT_FOUND);
    throw ApiError.forbidden(NOT_COMMENT_OWNER);
  }
  return comment;
}

export async function updateComment(commentId, viewer, content) {
  const comment = await loadOwnComment(commentId, viewer);
  if (comment.moderationStatus === 'removed') throw ApiError.conflict('This comment was removed and can’t be edited.');
  await assertCanPublish(viewer);
  const previousStatus = comment.moderationStatus ?? 'approved';
  const verdict = await analyzeAnonymousComment(viewer, { content }, { excludeId: comment._id, isNew: false });
  const moderationStatus = stricterStatus(previousStatus, verdict.status);
  const updated = await AnonymousComment.findOneAndUpdate(
    { _id: comment._id, author: viewer._id, status: { $ne: 'deleted' } },
    { $set: { content, moderationStatus, editedAt: new Date() } },
    { returnDocument: 'after', runValidators: true },
  ).select('+author');
  if (!updated) throw ApiError.notFound(COMMENT_NOT_FOUND);
  if (isPublic(previousStatus) && !isPublic(moderationStatus)) {
    await AnonymousPost.updateOne({ _id: comment.post, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } }, { timestamps: false });
  }
  await recordOutcome({ targetType: 'anonymousComment', targetId: comment._id, ownerId: viewer._id, verdict: { ...verdict, status: moderationStatus }, previousStatus });
  return toCommentView(updated, viewer);
}

/** Soft delete: gone for everyone, kept for safety reviews. */
export async function deleteComment(commentId, viewer) {
  const comment = await loadOwnComment(commentId, viewer);
  const { matchedCount } = await AnonymousComment.updateOne(
    { _id: comment._id, author: viewer._id, status: { $ne: 'deleted' } },
    { $set: { status: 'deleted', deletedAt: new Date() } },
  );
  if (matchedCount === 0) throw ApiError.notFound(COMMENT_NOT_FOUND);
  if (isPublic(comment.moderationStatus)) await AnonymousPost.updateOne({ _id: comment.post, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } }, { timestamps: false });
  return { id: comment.id, postId: comment.post.toString(), commentCount: await commentCountOf(comment.post) };
}

/** A visible comment on a post the viewer may read (with its author, for the report checks). */
export async function loadReadableComment(commentId, viewer) {
  const id = toObjectId(commentId);
  const comment = id ? await AnonymousComment.findOne({ _id: id, ...LISTED }).select('+author').lean() : null;
  if (!comment || !(await AnonymousPost.exists({ $and: [{ _id: comment.post }, await readableBy(viewer)] }))) {
    throw ApiError.notFound(COMMENT_NOT_FOUND);
  }
  return comment;
}
