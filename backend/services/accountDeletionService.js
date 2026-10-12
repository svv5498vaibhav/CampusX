import mongoose from 'mongoose';
import { PUBLIC_STATUSES } from '../config/moderationConfig.js';
import { ACCOUNT_DELETION } from '../config/securityConfig.js';
import AccountDeletion from '../models/AccountDeletion.js';
import Achievement from '../models/Achievement.js';
import Comment from '../models/Comment.js';
import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';
import Notification from '../models/Notification.js';
import NotificationPreference from '../models/NotificationPreference.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import PointTransaction from '../models/PointTransaction.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import RecommendationFeedback from '../models/RecommendationFeedback.js';
import RecommendationInteraction from '../models/RecommendationInteraction.js';
import RecommendationProfile from '../models/RecommendationProfile.js';
import SearchHistory from '../models/SearchHistory.js';
import Session, { REVOKE_REASONS } from '../models/Session.js';
import StudentGamification from '../models/StudentGamification.js';
import StudentRoadmapProgress from '../models/StudentRoadmapProgress.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { createKeyedLock } from '../utils/keyedQueue.js';
import logger from '../utils/logger.js';
import { setCache } from './cacheService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { settled as gamificationSettled } from './gamificationEvents.js';
import { RANKING_CACHE_VERSION_KEY } from './gamificationService.js';
import { deleteMedia } from './mediaService.js';
import { settled as notificationsSettled } from './notificationEvents.js';
import { createNotification } from './notificationService.js';
import { settled as recommendationsSettled } from './recommendationEvents.js';
import { recordSecurityEvent } from './securityService.js';

/*
 * Deleting a student's own account (DELETE /auth/account; authService.deleteAccount checks the password
 * first). Rules in config/securityConfig.js ACCOUNT_DELETION.
 *
 * What happens to the account's data:
 *   deleted     the account itself, its sessions, campus posts (with the comments on them, as when a post is
 *               deleted), its comments, projects, achievements, community memberships, opportunity tracking,
 *               roadmap progress, points ledger and gamification record, notifications it received or caused,
 *               notification settings, search history and recommendation data; its likes, saves and places
 *               on other students' project teams are removed
 *   files       profile photo and cover, post photos/videos, project images and achievement proof are removed
 *               from Cloudinary once no database record points at them (retried by jobs/accountDeletionCleanup.js)
 *   handed on   a community the account owned alone passes to its longest-serving moderator, or is archived
 *               (content kept, read-only) when it has none; communities it created no longer name it
 *   kept        moderation and safety records: reports it filed, reports, cases and audit rows about it or its
 *               content (ids only, nothing that names it once the account is gone); the ACCOUNT_DELETED audit row
 *   untouched   everything in the Anonymous Zone (its anonymous posts, comments, likes and reports). They were
 *               never linked to the student in public, and changing them at the moment the account disappears
 *               would tell other students which anonymous posts were theirs
 *
 * Safety of the process:
 *   1. The account is locked first (status "deleting", only while the checked password is still current):
 *      every request, refresh and socket of the account is refused from then on.
 *   2. Everything is removed in one MongoDB transaction when the server supports them (replica sets, Atlas).
 *      If it fails nothing was removed: the account is reopened and the student keeps their session.
 *      Without transactions (a standalone server) the same steps run one by one; each is safe to repeat, so an
 *      interrupted deletion is finished by the cleanup job and the account stays locked meanwhile.
 *   3. The user document goes last. Only then is the request answered "deleted".
 *   4. Follow-up: live connections closed, other students' points and counts reconciled, the deletion audited,
 *      files removed, and a final sweep for anything an in-flight request or listener added meanwhile.
 */

const MINUTE_MS = 60_000;
const { DELETING, ACTIVE } = ACCOUNT_STATUSES;

export const DELETION_CONFLICT = 'Your account changed while we were checking. Please try again.';
export const DELETION_FAILED = "We couldn't delete your account right now, so nothing was removed. Please try again in a few minutes.";

const oid = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);
const describe = (error) => String(error?.message ?? error).slice(0, 200);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

// Deletions of the same account run one after another in this process (the request and the cleanup job).
const withLock = createKeyedLock();
const lockKey = (id) => `account-deletion:${id}`;

// ----------------------------------------------------------------------------- transactions

let transactionSupport = null;

/** Replica sets and sharded clusters (MongoDB Atlas) support transactions; a standalone server doesn't. */
export async function supportsTransactions() {
  if (transactionSupport !== null) return transactionSupport;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionSupport = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch {
    return false;
  }
  return transactionSupport;
}

// ----------------------------------------------------------------------------- the purge

/** Comment counts of other students' posts, recalculated from the comments that remain (safe to repeat). */
async function recountComments(postIds, options) {
  if (!postIds?.length) return;
  const rows = await Comment.aggregate([
    { $match: { post: { $in: postIds }, moderationStatus: { $in: [...PUBLIC_STATUSES, null] } } },
    { $group: { _id: '$post', count: { $sum: 1 } } },
  ]).session(options.session ?? null);
  const counts = new Map(rows.map((row) => [row._id.toString(), row.count]));
  await Post.bulkWrite(
    postIds.map((postId) => ({ updateOne: { filter: { _id: postId }, update: { $set: { commentsCount: counts.get(postId.toString()) ?? 0 } }, timestamps: false } })),
    options,
  );
}

/** Member counts of communities, recalculated from the active memberships that remain. */
async function recountMembers(communityIds, options) {
  if (!communityIds?.length) return;
  const rows = await CommunityMember.aggregate([
    { $match: { community: { $in: communityIds }, status: 'active' } },
    { $group: { _id: '$community', count: { $sum: 1 } } },
  ]).session(options.session ?? null);
  const counts = new Map(rows.map((row) => [row._id.toString(), row.count]));
  await Community.bulkWrite(
    communityIds.map((communityId) => ({ updateOne: { filter: { _id: communityId }, update: { $set: { memberCount: counts.get(communityId.toString()) ?? 0 } }, timestamps: false } })),
    options,
  );
}

const mediaOf = (user, posts, projects, achievements) =>
  [
    ...[user?.avatarPublicId, user?.coverImagePublicId].map((publicId) => ({ publicId, resourceType: 'image' })),
    ...posts.flatMap((post) => post.media.map((item) => ({ publicId: item.publicId, resourceType: item.type === 'video' ? 'video' : 'image' }))),
    ...projects.flatMap((project) => project.images.map((image) => ({ publicId: image.publicId, resourceType: 'image' }))),
    ...achievements.flatMap((achievement) => achievement.proof.map((item) => ({ publicId: item.publicId, resourceType: item.resourceType }))),
  ].filter((item) => item.publicId);

/**
 * Removes everything the account owns (see the top of this file), the user document last. Every step is
 * safe to repeat and filtered on the account id only, so it can run again after an interruption, and once
 * more after the account is gone (the final sweep). Inside a transaction when `session` is given; the
 * operations then run one after another, as transactions require.
 *
 * Refuses an account that exists and isn't locked for deletion. Returns how many records it removed.
 */
export async function purgeAccountData(userId, { session = null } = {}) {
  const id = oid(userId);
  if (!id) throw new Error('purgeAccountData needs an account id');
  const options = session ? { session } : {};
  // Likes, counts and memberships changing isn't an edit by the other student.
  const quiet = { ...options, timestamps: false };
  const now = new Date();

  const user = await User.findById(id).select('status +avatarPublicId +coverImagePublicId').session(session).lean();
  if (user && user.status !== DELETING) throw new Error(`Refusing to purge account ${id}: it is not being deleted`);

  await AccountDeletion.updateOne({ user: id }, { $setOnInsert: { requestedAt: now } }, { ...options, upsert: true });
  const track = (update) => AccountDeletion.updateOne({ user: id }, update, options);
  const summary = { posts: 0, comments: 0, projects: 0, achievements: 0, communitiesArchived: 0, communitiesHandedOver: 0 };
  let removed = 0;
  const count = (key, result) => {
    if (key) summary[key] += result.deletedCount;
    removed += result.deletedCount ?? 0;
    return result;
  };

  // 1. Files are listed before the records that point at them go; only these records are deleted below, so
  //    nothing created meanwhile can lose its files unnoticed (the final sweep lists those first).
  const posts = await Post.find({ author: id }).select('media').session(session).lean();
  const projects = await Project.find({ owner: id }).select('images').session(session).lean();
  const achievements = await Achievement.find({ owner: id }).select('proof').session(session).lean();
  const media = mediaOf(user, posts, projects, achievements);
  if (media.length) await track({ $addToSet: { media: { $each: media } }, $set: { completedAt: null } });

  // 2. Own campus posts, with the comments on them (as when a student deletes a post). Comments go first,
  //    so a repeat still finds the posts they belong to.
  const postIds = posts.map((post) => post._id);
  if (postIds.length) {
    count(null, await Comment.deleteMany({ post: { $in: postIds } }, options));
    count('posts', await Post.deleteMany({ _id: { $in: postIds }, author: id }, options));
  }

  // 3. Comments on other students' posts. The posts are recorded first: their counts and the authors'
  //    points are reconciled from them even if this is interrupted and resumed.
  const commentedPosts = await Comment.distinct('post', { author: id }).session(session);
  if (commentedPosts.length) await track({ $addToSet: { 'affected.commentedPosts': { $each: commentedPosts } } });
  count('comments', await Comment.deleteMany({ author: id }, options));

  // 4. Likes and saves on posts, likes on projects, places on other students' project teams.
  const likedPosts = await Post.distinct('_id', { likes: id }).session(session);
  if (likedPosts.length) await track({ $addToSet: { 'affected.likedPosts': { $each: likedPosts } } });
  await Post.updateMany({ $or: [{ likes: id }, { saves: id }] }, { $pull: { likes: id, saves: id } }, quiet);
  await Project.updateMany({ likes: id }, { $pull: { likes: id } }, quiet);
  await Project.updateMany({ 'teamMembers.user': id }, { $pull: { teamMembers: { user: id } } }, quiet);

  // 5. Own projects and achievements (their files were listed in step 1).
  count('projects', await Project.deleteMany({ _id: { $in: projects.map((project) => project._id) }, owner: id }, options));
  count('achievements', await Achievement.deleteMany({ _id: { $in: achievements.map((achievement) => achievement._id) }, owner: id }, options));

  // 6. Communities. One the account owned alone passes to its longest-serving moderator, or is archived.
  const memberships = await CommunityMember.find({ user: id }).select('community role status').session(session).lean();
  if (memberships.length) await track({ $addToSet: { 'affected.communities': { $each: memberships.map((row) => row.community) } } });
  for (const { community } of memberships.filter((row) => row.status === 'active' && row.role === 'owner')) {
    const coOwner = await CommunityMember.exists({ community, status: 'active', role: 'owner', user: { $ne: id } }).session(session);
    if (coOwner) continue;
    const successor = await CommunityMember.findOne({ community, status: 'active', role: 'moderator', user: { $ne: id } })
      .sort({ joinedAt: 1, _id: 1 })
      .select('user')
      .session(session)
      .lean();
    if (successor) {
      const { modifiedCount } = await CommunityMember.updateOne({ _id: successor._id, status: 'active', role: 'moderator' }, { $set: { role: 'owner' } }, options);
      if (modifiedCount) {
        summary.communitiesHandedOver += 1;
        await track({ $addToSet: { 'affected.newOwners': { community, user: successor.user } } });
      }
    } else {
      const { modifiedCount } = await Community.updateOne({ _id: community, status: 'active', official: { $ne: true } }, { $set: { status: 'archived' } }, options);
      if (modifiedCount) {
        summary.communitiesArchived += 1;
        await track({ $addToSet: { 'affected.archivedCommunities': community } });
      }
    }
  }
  count(null, await CommunityMember.deleteMany({ user: id }, options));
  const recorded = await AccountDeletion.findOne({ user: id }).select('affected.communities affected.commentedPosts').session(session).lean();
  await recountMembers(recorded?.affected?.communities, options);
  await recountComments(recorded?.affected?.commentedPosts, options);
  await Community.updateMany({ createdBy: id }, { $set: { createdBy: null } }, quiet);

  // 7. Private records: tracking, roadmap, points, notifications (received, and caused for others: they quote
  //    removed content and name a removed account), settings, search history, recommendation data, sessions.
  for (const [model, filter] of [
    [OpportunityApplication, { user: id }],
    [StudentRoadmapProgress, { user: id }],
    [PointTransaction, { user: id }],
    [StudentGamification, { user: id }],
    [Notification, { $or: [{ recipient: id }, { actor: id }] }],
    [NotificationPreference, { user: id }],
    [SearchHistory, { user: id }],
    [RecommendationProfile, { user: id }],
    [RecommendationFeedback, { user: id }],
    [RecommendationInteraction, { user: id }],
    [Session, { user: id }],
  ]) {
    count(null, await model.deleteMany(filter, options));
  }

  // 8. Purged, then the account itself (marked first: if this is interrupted, the locked account is found
  //    again and the purge repeats; files are only removed once `purgedAt` is set).
  await track({ $set: { purgedAt: now }, $inc: Object.fromEntries(Object.entries(summary).map(([key, value]) => [`summary.${key}`, value])) });
  if (user) count(null, await User.deleteOne({ _id: id, status: DELETING }, options));
  return { removed: removed + media.length };
}

// ----------------------------------------------------------------------------- after the purge

/** Lets the students a community was handed to know they now own it. */
async function notifyNewOwners(newOwners = []) {
  if (!newOwners.length) return;
  const names = new Map((await Community.find({ _id: { $in: newOwners.map((row) => row.community) } }).select('name').lean()).map((row) => [row._id.toString(), row.name]));
  for (const { community, user } of newOwners) {
    const name = names.get(community.toString());
    if (!name) continue;
    await createNotification({
      recipient: user,
      type: 'COMMUNITY_ACTIVITY',
      message: `You're now an owner of ${name}. Its only owner deleted their CampusX account.`,
      entityType: 'community',
      entityId: community,
      metadata: { role: 'owner' },
    });
  }
}

/** Other students' points, counts and notifications follow what changed (the listeners reconcile from the database). */
function announceChanges(userId, affected = {}) {
  for (const postId of affected.likedPosts ?? []) emitCampusEvent(CAMPUS_EVENTS.POST_UNLIKED, { postId: postId.toString(), actorId: userId });
  for (const postId of affected.commentedPosts ?? []) emitCampusEvent(CAMPUS_EVENTS.COMMENT_DELETED, { postId: postId.toString(), commentId: null, actorId: userId });
  for (const communityId of affected.archivedCommunities ?? []) emitCampusEvent(CAMPUS_EVENTS.COMMUNITY_ARCHIVED, { communityId: communityId.toString(), actorId: null });
}

/** Finished: no files left and the follow-up has run. */
const completeIfDone = (userId, now = new Date()) =>
  AccountDeletion.updateOne({ user: oid(userId), finishedAt: { $ne: null }, completedAt: null, media: { $size: 0 } }, { $set: { completedAt: now } });

/**
 * The follow-up of a purged account, once (the first caller claims it): close its live connections,
 * reconcile what it touched, tell new community owners, refresh the leaderboards and audit the deletion.
 * Resolves to false when there is nothing to do.
 */
export async function finishDeletion(userId, { ip = null } = {}) {
  const id = oid(userId);
  const job = await AccountDeletion.findOneAndUpdate({ user: id, purgedAt: { $ne: null }, finishedAt: null }, { $set: { finishedAt: new Date() } }, { returnDocument: 'before' }).lean();
  if (!job) return false;
  const key = id.toString();

  emitCampusEvent(CAMPUS_EVENTS.AUTH_ACCOUNT_DELETED, { userId: key });
  announceChanges(key, job.affected);
  try {
    await notifyNewOwners(job.affected?.newOwners);
  } catch (error) {
    logger.warn(`Account deletion: new community owners of ${key} were not notified (${describe(error)})`);
  }
  // Leaderboards are cached: drop the account from them now.
  await setCache(RANKING_CACHE_VERSION_KEY, Date.now());
  // Counts only: nothing about the Anonymous Zone, no names, no content.
  await recordSecurityEvent('ACCOUNT_DELETED', { userId: key, ip, metadata: { ...job.summary, files: job.media?.length ?? 0 } });
  await AccountDeletion.updateOne({ _id: job._id }, { $unset: { affected: 1 } });
  await completeIfDone(id);
  return true;
}

const retryDelayMs = (attempts) => {
  const { firstRetryMinutes, maxRetryHours } = ACCOUNT_DELETION.media;
  return Math.min(firstRetryMinutes * 2 ** Math.max(0, attempts - 1) * MINUTE_MS, maxRetryHours * 60 * MINUTE_MS);
};

/**
 * Removes the deleted account's files from Cloudinary, a few at a time. Each removed file leaves the list at
 * once; failures are tried again later with a growing delay and, after ACCOUNT_DELETION.media.maxAttempts,
 * logged for manual cleanup. Only after the purge (`purgedAt`), so no live record can lose its file.
 * Returns { removed, left }.
 */
export async function cleanupDeletedMedia(userId, now = new Date()) {
  const job = await AccountDeletion.findOne({ user: oid(userId), purgedAt: { $ne: null }, completedAt: null, mediaGaveUpAt: null }).lean();
  if (!job) return { removed: 0, left: 0 };
  const { concurrency, maxAttempts } = ACCOUNT_DELETION.media;
  const failed = [];
  let removed = 0;
  let lastError = null;
  for (let index = 0; index < job.media.length; index += concurrency) {
    await Promise.all(
      job.media.slice(index, index + concurrency).map(async (item) => {
        try {
          // "not found" counts as removed (deleteMedia returns true for it).
          if (!(await deleteMedia(item.publicId, item.resourceType))) throw new Error('Cloudinary did not confirm the removal');
          await AccountDeletion.updateOne({ _id: job._id }, { $pull: { media: { publicId: item.publicId, resourceType: item.resourceType } } });
          removed += 1;
        } catch (error) {
          failed.push(item);
          lastError = describe(error);
        }
      }),
    );
  }

  if (!failed.length) {
    await AccountDeletion.updateOne({ _id: job._id }, { $set: { lastError: null, nextMediaAttemptAt: null } });
    await completeIfDone(job.user, now);
    return { removed, left: 0 };
  }
  const attempts = (job.mediaAttempts ?? 0) + 1;
  if (attempts >= maxAttempts) {
    logger.error(`Account deletion: gave up removing ${failed.length} Cloudinary file(s) of deleted account ${job.user} after ${attempts} attempts; remove them manually: ${failed.map((item) => `${item.resourceType}:${item.publicId}`).join(', ')}`);
    await AccountDeletion.updateOne({ _id: job._id }, { $set: { mediaAttempts: attempts, mediaGaveUpAt: now, lastError, nextMediaAttemptAt: null, ...(job.finishedAt && { completedAt: now }) } });
  } else {
    logger.warn(`Account deletion: ${failed.length} Cloudinary file(s) of deleted account ${job.user} could not be removed yet (attempt ${attempts}): ${lastError}`);
    await AccountDeletion.updateOne({ _id: job._id }, { $set: { mediaAttempts: attempts, nextMediaAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)), lastError } });
  }
  return { removed, left: failed.length };
}

/** Waits (at most settleTimeoutMs) for queued point, notification and recommendation updates. */
const waitForListeners = () =>
  Promise.race([Promise.allSettled([gamificationSettled(), notificationsSettled(), recommendationsSettled()]), sleep(ACCOUNT_DELETION.settleTimeoutMs)]);

/**
 * Runs once the purge is done: removes the files, then (after queued listeners have caught up) sweeps the
 * account once more for anything a request that was already in flight, or a listener, added meanwhile.
 */
async function followUp(userId) {
  const id = oid(userId);
  await cleanupDeletedMedia(id);
  await waitForListeners();
  if (await User.exists({ _id: id })) return;
  const { removed } = await withLock(lockKey(id), () => purgeAccountData(id));
  if (!removed) return;
  logger.warn(`Account deletion: the final sweep of deleted account ${id} removed ${removed} late record(s)`);
  const job = await AccountDeletion.findOneAndUpdate({ user: id }, { $unset: { affected: 1 } }, { returnDocument: 'before' }).lean();
  announceChanges(id.toString(), job?.affected);
  await cleanupDeletedMedia(id);
}

// Background follow-ups started by requests, so shutdown and tests can wait for them.
const running = new Set();
function inBackground(promise, label) {
  const tracked = promise
    .catch((error) => logger.error(`Account deletion: ${label} failed (${describe(error)}); the cleanup job will retry`))
    .finally(() => running.delete(tracked));
  running.add(tracked);
}

/** Resolves once every background follow-up has finished. */
export async function settled() {
  while (running.size) await Promise.allSettled([...running]);
}

// ----------------------------------------------------------------------------- the request

/** Ends every session of the account and closes its live connections (best effort: it is locked anyway). */
async function closeLiveAccess(id) {
  try {
    await Session.updateMany({ user: id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: REVOKE_REASONS.ACCOUNT_DELETED } });
  } catch (error) {
    logger.warn(`Account deletion: sessions of ${id} could not be revoked (${describe(error)}); the account is locked`);
  }
  emitCampusEvent(CAMPUS_EVENTS.AUTH_ACCOUNT_DELETED, { userId: id.toString() });
}

/** Purges in a transaction when the server supports one. Resolves to 'deleted', 'rolled-back' or 'interrupted'. */
async function purgeOnce(id) {
  if (await supportsTransactions()) {
    try {
      await mongoose.connection.transaction((session) => purgeAccountData(id, { session }));
      return 'deleted';
    } catch (error) {
      // A commit whose acknowledgement was lost still counts.
      if (!(await User.exists({ _id: id }))) return 'deleted';
      logger.error(`Account deletion: the transaction for ${id} failed and was rolled back (${describe(error)})`);
      return 'rolled-back';
    }
  }
  try {
    await purgeAccountData(id);
    return 'deleted';
  } catch (error) {
    logger.error(`Account deletion: ${id} was interrupted (${describe(error)}); the cleanup job will finish it`);
    return 'interrupted';
  }
}

/**
 * Deletes the signed-in student's account. `user` is the account document with its `passwordHash`, already
 * checked by authService.deleteAccount. Resolves to { status: 'deleted' } (everything is gone) or
 * { status: 'scheduled' } (no transactions and the purge was interrupted: the account is locked, signed out
 * everywhere, and the cleanup job finishes it). Throws 409 if the account changed since the password was
 * checked, and 500 if the transaction failed (nothing was removed; the account is open again).
 */
export async function deleteAccount(user, { ip = null } = {}) {
  const id = user._id;
  // Only while the account is active and the password just checked is still its password.
  const { modifiedCount } = await User.updateOne({ _id: id, status: ACTIVE, passwordHash: user.passwordHash }, { $set: { status: DELETING } });
  if (!modifiedCount) throw ApiError.conflict(DELETION_CONFLICT);

  return withLock(lockKey(id), async () => {
    const outcome = await purgeOnce(id);
    if (outcome === 'rolled-back') {
      await User.updateOne({ _id: id, status: DELETING }, { $set: { status: ACTIVE } }).catch((error) => logger.error(`Account deletion: ${id} could not be reopened (${describe(error)}); the cleanup job will finish deleting it`));
      throw new ApiError(500, DELETION_FAILED);
    }
    if (outcome === 'interrupted') {
      await closeLiveAccess(id);
      return { status: 'scheduled' };
    }
    try {
      await finishDeletion(id, { ip });
    } catch (error) {
      // Everything is already gone: a follow-up step failing must not report the deletion as failed. If the
      // follow-up never started, the cleanup job runs it.
      logger.error(`Account deletion: the follow-up for ${id} failed (${describe(error)})`);
    }
    inBackground(followUp(id), `follow-up of ${id}`);
    return { status: 'deleted' };
  });
}

// ----------------------------------------------------------------------------- the cleanup job

/**
 * One round of jobs/accountDeletionCleanup.js: finishes locked accounts whose deletion was interrupted (left
 * alone for resumeAfterMinutes), runs follow-ups that never ran, and retries files that are due.
 * Returns { resumed, finished, mediaRemoved }.
 */
export async function resumeDeletions(now = new Date()) {
  const cutoff = new Date(now.getTime() - ACCOUNT_DELETION.resumeAfterMinutes * MINUTE_MS);
  const result = { resumed: 0, finished: 0, mediaRemoved: 0 };
  // One account's problem never stops the others; it is simply tried again next round.
  const forEach = async (rows, idOf, work) => {
    for (const row of rows) {
      const id = idOf(row);
      try {
        await withLock(lockKey(id), () => work(id));
      } catch (error) {
        logger.error(`Account deletion cleanup: ${id} failed this round (${describe(error)})`);
      }
    }
  };

  const stuck = await User.find({ status: DELETING, updatedAt: { $lt: cutoff } }).select('_id').limit(50).lean();
  await forEach(stuck, (row) => row._id, async (id) => {
    if ((await purgeOnce(id)) !== 'deleted') return;
    result.resumed += 1;
    await finishDeletion(id);
    await cleanupDeletedMedia(id, now);
  });

  const unfinished = await AccountDeletion.find({ purgedAt: { $ne: null }, finishedAt: null, updatedAt: { $lt: cutoff } }).select('user').limit(50).lean();
  await forEach(unfinished, (row) => row.user, async (id) => {
    if (await finishDeletion(id)) result.finished += 1;
  });

  const due = await AccountDeletion.find({
    purgedAt: { $ne: null },
    completedAt: null,
    mediaGaveUpAt: null,
    'media.0': { $exists: true },
    $or: [{ nextMediaAttemptAt: null }, { nextMediaAttemptAt: { $lte: now } }],
  })
    .select('user')
    .limit(50)
    .lean();
  await forEach(due, (row) => row.user, async (id) => {
    result.mediaRemoved += (await cleanupDeletedMedia(id, now)).removed;
  });

  await AccountDeletion.updateMany({ finishedAt: { $ne: null }, completedAt: null, media: { $size: 0 } }, { $set: { completedAt: now } });
  return result;
}
