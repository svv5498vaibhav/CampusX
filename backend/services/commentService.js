import { OWNER_ONLY_STATUSES, PUBLIC_STATUSES } from '../config/moderationConfig.js';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import ApiError from '../utils/ApiError.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { analyzeComment, assertCanPublish, ownerModeration, recordOutcome, stricterStatus } from './moderationService.js';
import { POST_NOT_FOUND, toObjectId, visibleTo } from './postService.js';
import { getStudentSummaries } from './profileService.js';

export const COMMENT_NOT_FOUND = 'Comment not found.';
export const NOT_COMMENT_OWNER = 'You can only modify your own comment.';

const toCommentView = (comment, author, viewer) => ({
  id: comment._id.toString(),
  postId: comment.post.toString(),
  content: comment.content,
  author,
  isOwner: comment.author.equals(viewer._id),
  editedAt: comment.editedAt ?? null,
  createdAt: comment.createdAt,
  // Only the author sees that their comment is held for review.
  ...(comment.author.equals(viewer._id) && ownerModeration(comment.moderationStatus) && { moderation: ownerModeration(comment.moderationStatus) }),
});

// Comments other students see (older comments have no status: approved), plus the viewer's own held ones.
const isPublic = (status) => PUBLIC_STATUSES.includes(status ?? 'approved');
const shownTo = (viewer) => ({ $or: [{ moderationStatus: { $in: [...PUBLIC_STATUSES, null] } }, { author: viewer._id, moderationStatus: { $in: OWNER_ONLY_STATUSES } }] });

/** Comments from accounts that are no longer active are left out. */
async function present(comments, viewer) {
  const authors = await getStudentSummaries(comments.map((comment) => comment.author));
  return comments
    .filter((comment) => authors.has(comment.author.toString()))
    .map((comment) => toCommentView(comment, authors.get(comment.author.toString()), viewer));
}

async function assertPostVisible(postId, viewer) {
  const id = toObjectId(postId);
  if (!id || !(await Post.exists({ $and: [{ _id: id }, await visibleTo(viewer)] }))) {
    throw ApiError.notFound(POST_NOT_FOUND);
  }
  return id;
}

const commentCountOf = async (postId) => (await Post.findById(postId).select('commentsCount').lean())?.commentsCount ?? 0;

/** Newest first, a page at a time, for a post the viewer can see. */
export async function listComments(postId, viewer, { page, limit }) {
  const id = await assertPostVisible(postId, viewer);
  const match = { $and: [{ post: id }, shownTo(viewer)] };
  const [comments, total] = await Promise.all([
    Comment.find(match).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Comment.countDocuments(match),
  ]);
  return {
    comments: await present(comments, viewer),
    pagination: { page, limit, total, hasMore: page * limit < total },
  };
}

export async function addComment(postId, viewer, content) {
  const id = await assertPostVisible(postId, viewer);
  await assertCanPublish(viewer);
  const verdict = await analyzeComment(viewer, { content });
  const comment = await Comment.create({ post: id, author: viewer._id, content, moderationStatus: verdict.status });

  // If the post was deleted meanwhile, take the comment back out. Held comments don't count (others can't see them).
  const { matchedCount } = await Post.updateOne({ _id: id }, { $inc: { commentsCount: isPublic(verdict.status) ? 1 : 0 } }, { timestamps: false });
  if (matchedCount === 0) {
    await Comment.deleteOne({ _id: comment._id });
    throw ApiError.notFound(POST_NOT_FOUND);
  }

  await recordOutcome({ targetType: 'comment', targetId: comment._id, ownerId: viewer._id, verdict });
  emitCampusEvent(CAMPUS_EVENTS.POST_COMMENTED, { postId: id.toString(), commentId: comment.id, actorId: viewer.id });
  const [view] = await present([comment], viewer);
  return { comment: view, commentCount: await commentCountOf(id) };
}

/** The comment, if the signed-in student wrote it: 404 when missing, 403 when it's someone else's. */
async function loadOwnComment(commentId, viewer) {
  const id = toObjectId(commentId);
  const comment = id ? await Comment.findById(id) : null;
  if (!comment) throw ApiError.notFound(COMMENT_NOT_FOUND);
  if (!comment.author.equals(viewer._id)) throw ApiError.forbidden(NOT_COMMENT_OWNER);
  return comment;
}

export async function updateComment(commentId, viewer, content) {
  const comment = await loadOwnComment(commentId, viewer);
  if (comment.moderationStatus === 'removed') throw ApiError.conflict('This comment was removed and can’t be edited.');
  await assertCanPublish(viewer);
  const previousStatus = comment.moderationStatus ?? 'approved';
  const verdict = await analyzeComment(viewer, { content }, { excludeId: comment._id, isNew: false });
  const moderationStatus = stricterStatus(previousStatus, verdict.status);
  const updated = await Comment.findOneAndUpdate(
    { _id: comment._id, author: viewer._id },
    { $set: { content, moderationStatus, editedAt: new Date() } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) throw ApiError.notFound(COMMENT_NOT_FOUND);
  if (isPublic(previousStatus) && !isPublic(moderationStatus)) {
    await Post.updateOne({ _id: comment.post, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } }, { timestamps: false });
  }
  await recordOutcome({ targetType: 'comment', targetId: comment._id, ownerId: viewer._id, verdict: { ...verdict, status: moderationStatus }, previousStatus });
  const [view] = await present([updated], viewer);
  return view;
}

export async function deleteComment(commentId, viewer) {
  const comment = await loadOwnComment(commentId, viewer);
  const { deletedCount } = await Comment.deleteOne({ _id: comment._id, author: viewer._id });
  if (deletedCount === 0) throw ApiError.notFound(COMMENT_NOT_FOUND);

  // Only comments others could see were counted.
  if (isPublic(comment.moderationStatus)) {
    await Post.updateOne(
      { _id: comment.post, commentsCount: { $gt: 0 } },
      { $inc: { commentsCount: -1 } },
      { timestamps: false },
    );
  }
  emitCampusEvent(CAMPUS_EVENTS.COMMENT_DELETED, { postId: comment.post.toString(), commentId: comment.id, actorId: viewer.id });
  return { id: comment.id, postId: comment.post.toString(), commentCount: await commentCountOf(comment.post) };
}
