import mongoose from 'mongoose';
import { QUALITY_RULES } from '../data/gamificationOptions.js';
import Achievement from '../models/Achievement.js';
import Comment from '../models/Comment.js';
import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { createKeyedQueue } from '../utils/keyedQueue.js';
import { CAMPUS_EVENTS, campusEvents } from './campusEvents.js';
import { awardPoints, logGamificationError, reverseByParent, reversePoints, syncStudent } from './gamificationService.js';
import { engagementCounts } from './moderationService.js';
import { checkRankMilestones } from './rankingService.js';
import { ROADMAP_SEMESTER_NUMBERS, completedSemestersOf } from './roadmapService.js';

/*
 * Turns campus events into points. Every handler looks at the current state of the content in the
 * database and makes the student's awards match it: award when the activity counts, reverse when it
 * no longer does (deleted, private, unliked, moderated), reinstate when it counts again. That makes the
 * handlers safe to repeat and independent of event order. Handlers for the same thing run one after
 * another, so a quick like/unlike can't interleave.
 *
 * Not rewarded on purpose: anything in the Anonymous Zone (points could hint at who posted there),
 * giving likes, and self-likes / self-comments.
 *
 * Trust & Safety (Phase 13): only content in good standing ("approved") counts, so flagged, held or removed
 * content earns nothing and loses what it had (CONTENT_MODERATED); likes and comments from a student whose
 * engagement looks fake (services/moderationService.js engagementCounts) don't count while that lasts.
 */

const oid = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);
const COUNTED = 'approved'; // only content in good standing counts
// Older documents saved before a model had a moderation status count as approved.
const inGoodStanding = (doc) => (doc?.moderationStatus ?? COUNTED) === COUNTED;
const GOOD_STANDING = { $in: [COUNTED, null] };

/** Award when `counts` is true, reverse otherwise. */
const settleAward = (counts, reward, reason) => (counts ? awardPoints(reward) : reversePoints({ ...reward, reason }));

// ----------------------------------------------------------------------------- rules per kind of content

export async function reconcilePost(postId, authorId) {
  const post = await Post.findById(oid(postId)).select('author content media moderationStatus').lean();
  const author = post?.author?.toString() ?? authorId;
  if (!author) return;
  const meaningful = Boolean(post) && ((post.content ?? '').trim().length >= QUALITY_RULES.postMinLength || (post.media ?? []).length > 0);
  const counts = meaningful && post.moderationStatus === COUNTED;
  await settleAward(counts, { userId: author, action: 'POST_CREATED', sourceType: 'post', sourceId: postId }, post ? 'post no longer counts' : 'post deleted');
}

export async function reversePostRewards(postId, authorId, reason = 'post deleted') {
  if (authorId) await reversePoints({ userId: authorId, action: 'POST_CREATED', sourceType: 'post', sourceId: postId, reason });
  await reverseByParent(postId, reason);
}

/** A like from another student on a post in good standing earns the author points. */
export async function reconcileLike(postId, likerId) {
  const post = await Post.findOne({ _id: oid(postId) }).select('author moderationStatus').lean();
  if (!post) return reverseByParent(postId, 'post deleted');
  const liked = Boolean(await Post.exists({ _id: post._id, likes: oid(likerId) }));
  const counts = liked && post.moderationStatus === COUNTED && !post.author.equals(oid(likerId)) && (await engagementCounts(likerId));
  return settleAward(counts, { userId: post.author.toString(), action: 'POST_LIKE_RECEIVED', sourceType: 'post-like', sourceId: `${postId}:${likerId}`, parentId: postId }, 'like removed');
}

/** One meaningful comment per other student per post counts for the post's author. */
export async function reconcileComment(postId, commenterId) {
  const post = await Post.findOne({ _id: oid(postId) }).select('author moderationStatus').lean();
  if (!post) return reverseByParent(postId, 'post deleted');
  const meaningful = await Comment.exists({
    post: post._id,
    author: oid(commenterId),
    moderationStatus: GOOD_STANDING,
    $expr: { $gte: [{ $strLenCP: '$content' }, QUALITY_RULES.commentMinLength] },
  });
  const counts = Boolean(meaningful) && post.moderationStatus === COUNTED && !post.author.equals(oid(commenterId)) && (await engagementCounts(commenterId));
  return settleAward(counts, { userId: post.author.toString(), action: 'COMMENT_RECEIVED', sourceType: 'post-comment', sourceId: `${postId}:${commenterId}`, parentId: postId }, 'comment removed');
}

/** Shared (non-private) projects count; completing one counts once more. */
export async function reconcileProject(projectId, ownerId) {
  const project = await Project.findById(oid(projectId)).select('owner visibility status moderationStatus').lean();
  const owner = project?.owner?.toString() ?? ownerId;
  if (!owner) return;
  const shared = Boolean(project) && project.visibility !== 'private' && inGoodStanding(project);
  const reason = project ? 'project made private' : 'project deleted';
  await settleAward(shared, { userId: owner, action: 'PROJECT_CREATED', sourceType: 'project', sourceId: projectId }, reason);
  await settleAward(shared && project.status === 'completed', { userId: owner, action: 'PROJECT_COMPLETED', sourceType: 'project', sourceId: projectId }, project ? 'project no longer completed' : reason);
}

/** Shared achievements count; a moderator-verified one counts extra (until it changes and needs review again). */
export async function reconcileAchievement(achievementId, ownerId) {
  const achievement = await Achievement.findById(oid(achievementId)).select('owner visibility verificationStatus moderationStatus').lean();
  const owner = achievement?.owner?.toString() ?? ownerId;
  if (!owner) return;
  const reason = achievement ? 'achievement made private or moderated' : 'achievement deleted';
  await settleAward(Boolean(achievement) && achievement.visibility !== 'private' && inGoodStanding(achievement), { userId: owner, action: 'ACHIEVEMENT_ADDED', sourceType: 'achievement', sourceId: achievementId }, reason);
  await settleAward(achievement?.verificationStatus === 'verified' && inGoodStanding(achievement), { userId: owner, action: 'ACHIEVEMENT_VERIFIED', sourceType: 'achievement', sourceId: achievementId }, achievement ? 'verification under review again' : reason);
}

/** Joining an active community counts once per community (the owner gets the "created" reward instead). */
export async function reconcileMembership(communityId, userId) {
  const [member, community] = await Promise.all([
    CommunityMember.findOne({ community: oid(communityId), user: oid(userId), status: 'active' }).select('role').lean(),
    Community.findById(oid(communityId)).select('status').lean(),
  ]);
  const counts = Boolean(member) && member.role !== 'owner' && community?.status === 'active';
  await settleAward(counts, { userId, action: 'COMMUNITY_JOINED', sourceType: 'community-membership', sourceId: communityId }, 'left the community');
}

/** A student-created community counts while it is active (official ones are created by CampusX). */
export async function reconcileCommunity(communityId) {
  const community = await Community.findById(oid(communityId)).select('createdBy official status moderationStatus').lean();
  if (!community?.createdBy || community.official) return;
  await settleAward(community.status === 'active' && inGoodStanding(community), { userId: community.createdBy.toString(), action: 'COMMUNITY_CREATED', sourceType: 'community', sourceId: communityId }, 'community archived');
}

/** Saving and (self-reported) applying to an opportunity, while the student still tracks it. */
export async function reconcileTracking(opportunityId, userId) {
  const record = await OpportunityApplication.findOne({ opportunity: oid(opportunityId), user: oid(userId) }).select('appliedAt').lean();
  await settleAward(Boolean(record), { userId, action: 'OPPORTUNITY_SAVED', sourceType: 'opportunity', sourceId: opportunityId }, 'removed from My Opportunities');
  await settleAward(Boolean(record?.appliedAt), { userId, action: 'OPPORTUNITY_APPLIED', sourceType: 'opportunity', sourceId: opportunityId }, 'no longer marked as applied');
}

/**
 * Semester Roadmap: a semester counts while every required milestone in it is complete, once per semester
 * number however often it is undone and redone (an undone semester loses the points, finishing it again
 * reinstates the same award). Students without a roadmap record have nothing to settle.
 */
export async function reconcileRoadmap(userId, semesters = ROADMAP_SEMESTER_NUMBERS) {
  const user = await User.findById(oid(userId)).select('branch semester interests').lean();
  const completed = user && (await completedSemestersOf(user._id, user));
  if (!completed) return;
  for (const semester of semesters) {
    await settleAward(completed[semester], { userId: user._id.toString(), action: 'ROADMAP_SEMESTER_COMPLETED', sourceType: 'roadmap-semester', sourceId: String(semester) }, 'semester roadmap no longer complete');
  }
}

/**
 * Trust & Safety changed a moderation status: make the awards match again. A post that stops counting
 * loses the points it earned and those of its likes and comments; one that counts again gets them back.
 * Anonymous Zone content never had points.
 */
export async function reconcileModerated({ targetType, targetId, ownerId, parentId }) {
  switch (targetType) {
    case 'post': {
      await reconcilePost(targetId, ownerId);
      const post = await Post.findById(oid(targetId)).select('moderationStatus +likes').lean();
      if (!post || post.moderationStatus !== COUNTED) return reverseByParent(targetId, 'post moderated');
      for (const liker of post.likes ?? []) await reconcileLike(targetId, liker.toString());
      const commenters = await Comment.distinct('author', { post: post._id });
      for (const commenter of commenters) await reconcileComment(targetId, commenter.toString());
      return undefined;
    }
    case 'comment':
      return parentId && ownerId ? reconcileComment(parentId, ownerId) : undefined;
    case 'project':
      return reconcileProject(targetId, ownerId);
    case 'achievement':
      return reconcileAchievement(targetId, ownerId);
    case 'community':
      return reconcileCommunity(targetId);
    default:
      return undefined;
  }
}

// ----------------------------------------------------------------------------- wiring

// Tasks with the same key run one after another; failures are logged and never reach the request.
const queue = createKeyedQueue(logGamificationError);

/** Resolves once every queued gamification task has finished (used by shutdown and tests). */
export const settled = () => queue.settled();

let registered = false;

export function registerGamificationListeners() {
  if (registered) return;
  registered = true;
  const on = (events, keyOf, handler) => {
    for (const event of [].concat(events)) campusEvents.on(event, (payload) => queue.run(keyOf(payload), () => handler(payload)));
  };
  const E = CAMPUS_EVENTS;
  on(E.STUDENT_PROFILE_CHANGED, (p) => `student:${p.userId}`, (p) => syncStudent(p.userId));
  // A new branch can change which milestones a semester needs.
  on(E.STUDENT_PROFILE_CHANGED, (p) => `roadmap:${p.userId}`, (p) => reconcileRoadmap(p.userId));
  on(E.ROADMAP_PROGRESS_CHANGED, (p) => `roadmap:${p.userId}`, (p) => reconcileRoadmap(p.userId, p.semesters));
  on([E.POST_CREATED, E.POST_UPDATED], (p) => `post:${p.postId}`, (p) => reconcilePost(p.postId, p.authorId));
  on(E.POST_DELETED, (p) => `post:${p.postId}`, (p) => reversePostRewards(p.postId, p.authorId, p.removedBy ? 'post removed by community moderators' : 'post deleted'));
  on([E.POST_LIKED, E.POST_UNLIKED], (p) => `like:${p.postId}:${p.actorId}`, (p) => reconcileLike(p.postId, p.actorId));
  on([E.POST_COMMENTED, E.COMMENT_DELETED], (p) => `comment:${p.postId}:${p.actorId}`, (p) => reconcileComment(p.postId, p.actorId));
  on([E.PROJECT_CREATED, E.PROJECT_UPDATED, E.PROJECT_DELETED], (p) => `project:${p.projectId}`, (p) => reconcileProject(p.projectId, p.ownerId));
  on([E.ACHIEVEMENT_CREATED, E.ACHIEVEMENT_UPDATED, E.ACHIEVEMENT_DELETED, E.ACHIEVEMENT_REVIEWED], (p) => `achievement:${p.achievementId}`, (p) => reconcileAchievement(p.achievementId, p.ownerId));
  on([E.COMMUNITY_MEMBER_JOINED, E.COMMUNITY_MEMBER_LEFT, E.COMMUNITY_MEMBER_REMOVED], (p) => `member:${p.communityId}:${p.userId}`, (p) => reconcileMembership(p.communityId, p.userId));
  on([E.COMMUNITY_CREATED, E.COMMUNITY_UPDATED, E.COMMUNITY_ARCHIVED], (p) => `community:${p.communityId}`, (p) => reconcileCommunity(p.communityId));
  on(E.OPPORTUNITY_TRACKING_CHANGED, (p) => `tracking:${p.opportunityId}:${p.userId}`, (p) => reconcileTracking(p.opportunityId, p.userId));
  on(E.GAMIFICATION_POINTS_EARNED, (p) => `ranks:${p.userId}`, (p) => checkRankMilestones(p.userId));
  // Same keys as the content's own events, so a moderation change never interleaves with them.
  on(E.CONTENT_MODERATED, (p) => (p.targetType === 'comment' ? `comment:${p.parentId}:${p.ownerId}` : `${p.targetType}:${p.targetId}`), (p) => reconcileModerated(p));
}
