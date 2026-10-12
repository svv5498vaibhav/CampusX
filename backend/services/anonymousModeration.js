import AnonymousComment from '../models/AnonymousComment.js';
import AnonymousPost from '../models/AnonymousPost.js';
import User, { ROLES } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { toObjectId } from '../utils/objectId.js';
import { writeAudit } from './moderationService.js';

/*
 * INTERNAL AND SENSITIVE. The only code that may reveal who wrote anonymous content, for CampusX
 * moderators and admins investigating abuse. Its only route is the admin control center's
 * POST /admin/moderation/:id/reveal-author (REVEAL_ANONYMOUS_AUTHOR permission, a reason, an open
 * moderation case about that content).
 *
 *   - Never import this from a student-facing route, controller or service.
 *   - Never put its result in a feed, search result, comment, notification or profile.
 *   - Every lookup is written to the audit log (ANONYMOUS_AUTHOR_REVEALED): who looked, at what, and why.
 *     The revealed identity itself is never logged.
 */

const STAFF = [ROLES.ADMIN, ROLES.MODERATOR];

function assertStaff(requester) {
  if (!requester || !STAFF.includes(requester.role)) throw ApiError.forbidden();
}

async function revealAuthor(authorId) {
  const user = await User.findById(authorId).select('firstName lastName email college branch semester rollNumber status');
  return user
    ? { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, college: user.college ?? null, branch: user.branch ?? null, semester: user.semester ?? null, rollNumber: user.rollNumber ?? null, accountStatus: user.status }
    : { id: authorId.toString(), deleted: true };
}

async function audit(kind, id, requester, reason, caseId) {
  logger.warn(`AUDIT anonymous-author-lookup ${kind}=${id} by=${requester.id} role=${requester.role}${reason ? ' (reason recorded)' : ''}`);
  await writeAudit({ actor: requester, action: 'ANONYMOUS_AUTHOR_REVEALED', targetType: kind === 'post' ? 'anonymousPost' : 'anonymousComment', targetId: id, reason: reason ?? '', caseId: caseId ?? null });
}

/** Who wrote an anonymous post (deleted ones included). `requester` must be a moderator or admin. */
export async function getAnonymousAuthorForModeration(postId, requester, { reason, caseId } = {}) {
  assertStaff(requester);
  const id = toObjectId(String(postId));
  const post = id ? await AnonymousPost.findById(id).select('+author').lean() : null;
  if (!post) throw ApiError.notFound('Post not found.');
  await audit('post', id, requester, reason, caseId);
  return { postId: id.toString(), author: await revealAuthor(post.author) };
}

/** Who wrote an anonymous comment (deleted ones included). `requester` must be a moderator or admin. */
export async function getAnonymousCommentAuthorForModeration(commentId, requester, { reason, caseId } = {}) {
  assertStaff(requester);
  const id = toObjectId(String(commentId));
  const comment = id ? await AnonymousComment.findById(id).select('+author').lean() : null;
  if (!comment) throw ApiError.notFound('Comment not found.');
  await audit('comment', id, requester, reason, caseId);
  return { commentId: id.toString(), postId: comment.post.toString(), author: await revealAuthor(comment.author) };
}
