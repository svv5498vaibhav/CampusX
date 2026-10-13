import mongoose from 'mongoose';
import { FOLLOW_RULES } from '../data/socialOptions.js';
import Block from '../models/Block.js';
import Follow from '../models/Follow.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import { emitToUser } from '../sockets/socket.js';
import { SOCKET_EVENTS } from '../sockets/socketEvents.js';
import ApiError from '../utils/ApiError.js';
import { toObjectId } from '../utils/objectId.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { getStudentSummaries } from './profileService.js';

/*
 * Follows and blocks: the only place they are written. Every action applies to the signed-in student
 * (`viewer`, req.user from the session) and names the other student by id; no request can change a
 * relationship between two other students.
 *
 * Rules:
 *   - only active accounts can be followed, blocked or listed; an unknown, malformed or inactive account
 *     looks the same as a missing one (404), as on profiles
 *   - nobody follows themselves
 *   - while a block exists in either direction, neither student can follow (or message) the other, and
 *     blocking ends any follow between them; the blocked student is never told
 *   - a relationship exists at most once (unique index), so repeated or simultaneous follow requests change
 *     nothing after the first, and counts are read from the relationships themselves
 *   - counts and lists include only active accounts (Follow.followerActive / followingActive)
 *
 * The relationship is saved first; then the follow notification (services/notificationEvents.js, from the
 * STUDENT_FOLLOWED event) and live updates over Socket.IO, which are delivery only.
 */

export const STUDENT_NOT_FOUND = "We couldn't find that student.";
const { ACTIVE } = ACCOUNT_STATUSES;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An active account by id, or a 404 (unknown, malformed and inactive ids all look the same). */
export async function loadActiveStudent(targetId) {
  const id = toObjectId(String(targetId ?? ''));
  const user = id ? await User.findById(id).select('status firstName lastName').lean() : null;
  if (!user || user.status !== ACTIVE) throw ApiError.notFound(STUDENT_NOT_FOUND);
  return user;
}

// ----------------------------------------------------------------------------- reading

/** Blocks between two students: { byViewer, byOther, any }. */
export async function blockStateBetween(viewerId, otherId) {
  const rows = await Block.find({
    $or: [
      { blocker: viewerId, blocked: otherId },
      { blocker: otherId, blocked: viewerId },
    ],
  })
    .select('blocker')
    .lean();
  const byViewer = rows.some((row) => row.blocker.equals(viewerId));
  const byOther = rows.some((row) => !row.blocker.equals(viewerId));
  return { byViewer, byOther, any: byViewer || byOther };
}

/** Ids (strings) among `otherIds` with a block in either direction with the viewer. */
export async function blockedAmong(viewerId, otherIds) {
  if (!otherIds.length) return new Set();
  const rows = await Block.find({
    $or: [
      { blocker: viewerId, blocked: { $in: otherIds } },
      { blocker: { $in: otherIds }, blocked: viewerId },
    ],
  })
    .select('blocker blocked')
    .lean();
  return new Set(rows.map((row) => (row.blocker.equals(viewerId) ? row.blocked : row.blocker).toString()));
}

/** Followers and following of one student, counting only active accounts. */
export async function getFollowCounts(userId) {
  const id = toObjectId(String(userId));
  if (!id) return { followersCount: 0, followingCount: 0 };
  const [followersCount, followingCount] = await Promise.all([
    Follow.countDocuments({ following: id, followerActive: true }),
    Follow.countDocuments({ follower: id, followingActive: true }),
  ]);
  return { followersCount, followingCount };
}

/**
 * How the viewer and another student are connected, as the viewer may see it. A block by the other student
 * is not named: it only shows as "can't follow / can't message".
 */
async function relationshipBetween(viewerId, otherId) {
  if (viewerId.equals(otherId)) {
    return { isFollowing: false, followsYou: false, blockedByYou: false, canFollow: false, canMessage: false };
  }
  const [isFollowing, followsYou, blocks] = await Promise.all([
    Follow.exists({ follower: viewerId, following: otherId }),
    Follow.exists({ follower: otherId, following: viewerId }),
    blockStateBetween(viewerId, otherId),
  ]);
  return {
    isFollowing: Boolean(isFollowing) && !blocks.any,
    followsYou: Boolean(followsYou) && !blocks.any,
    blockedByYou: blocks.byViewer,
    canFollow: !blocks.any,
    canMessage: !blocks.any,
  };
}

/** The follow part of a profile: counts, plus the viewer's relationship when it's someone else's profile. */
export async function getProfileSocial(viewer, profileUserId) {
  const id = toObjectId(String(profileUserId));
  const counts = await getFollowCounts(id);
  if (!id || viewer._id.equals(id)) return { ...counts, relationship: null };
  return { ...counts, relationship: await relationshipBetween(viewer._id, id) };
}

/**
 * The relationship with one student plus both sides' counts (the answer to every follow/block action).
 * `at` is when it was read, so an app can tell a late live update from a newer answer it already has.
 */
async function snapshot(viewer, otherId) {
  const at = Date.now();
  const [relationship, counts, viewerCounts] = await Promise.all([
    relationshipBetween(viewer._id, otherId),
    getFollowCounts(otherId),
    getFollowCounts(viewer._id),
  ]);
  return { userId: otherId.toString(), relationship, counts, viewerCounts, at };
}

/** Another student's relationship with the viewer (to refresh a profile after a live update). */
export async function getRelationship(viewer, targetId) {
  const target = await loadActiveStudent(targetId);
  return snapshot(viewer, target._id);
}

/**
 * Whether the viewer follows each of these students (cards in search results and recommendations).
 * Unknown or inactive ids are simply left out.
 */
export async function getFollowStatuses(viewer, ids) {
  const objectIds = [...new Set(ids)].slice(0, FOLLOW_RULES.statusBatchMax).map(toObjectId).filter(Boolean);
  if (!objectIds.length) return {};
  const [active, follows, blocked] = await Promise.all([
    User.find({ _id: { $in: objectIds }, status: ACTIVE }).select('_id').lean(),
    Follow.find({ follower: viewer._id, following: { $in: objectIds } }).select('following').lean(),
    blockedAmong(viewer._id, objectIds),
  ]);
  const following = new Set(follows.map((row) => row.following.toString()));
  return Object.fromEntries(
    active.map(({ _id }) => {
      const id = _id.toString();
      const self = _id.equals(viewer._id);
      return [id, { isFollowing: following.has(id) && !blocked.has(id), canFollow: !self && !blocked.has(id) }];
    }),
  );
}

/**
 * One page of a student's followers or of the students they follow, newest relationship first, as public
 * student summaries (never emails, roll numbers or account details) with the viewer's own follow state for
 * each. Cursor pagination: `cursor` is the last relationship id of the previous page. `search` matches the
 * start of first or last names (every word must match).
 */
async function listRelations(kind, viewer, targetId, { cursor, limit = FOLLOW_RULES.pageSize.default, search = '' } = {}) {
  const target = await loadActiveStudent(targetId);
  const listed = kind === 'followers' ? 'follower' : 'following';
  const base = kind === 'followers' ? { following: target._id, followerActive: true } : { follower: target._id, followingActive: true };
  const after = toObjectId(String(cursor ?? ''));
  const match = after ? { ...base, _id: { $lt: after } } : base;

  const words = String(search).trim().split(/\s+/).filter(Boolean).slice(0, 3);
  let rows;
  if (words.length) {
    const nameMatches = words.map((word) => {
      const pattern = new RegExp(`^${escapeRegex(word)}`, 'i');
      return { $or: [{ firstName: pattern }, { lastName: pattern }] };
    });
    rows = await Follow.aggregate([
      { $match: match },
      { $sort: { _id: -1 } },
      {
        $lookup: {
          from: User.collection.name,
          localField: listed,
          foreignField: '_id',
          as: 'student',
          pipeline: [{ $match: { status: ACTIVE, $and: nameMatches } }, { $project: { _id: 1 } }],
        },
      },
      { $match: { 'student.0': { $exists: true } } },
      { $limit: limit + 1 },
      { $project: { [listed]: 1, createdAt: 1 } },
    ]).option({ maxTimeMS: FOLLOW_RULES.searchTimeoutMs });
  } else {
    rows = await Follow.find(match).sort({ _id: -1 }).limit(limit + 1).select(`${listed} createdAt`).lean();
  }

  const page = rows.slice(0, limit);
  const ids = page.map((row) => row[listed]);
  const [summaries, viewerFollows, blocked, total] = await Promise.all([
    getStudentSummaries(ids),
    Follow.find({ follower: viewer._id, following: { $in: ids } }).select('following').lean(),
    blockedAmong(viewer._id, ids),
    Follow.countDocuments(base),
  ]);
  const following = new Set(viewerFollows.map((row) => row.following.toString()));

  const students = page
    .map((row) => {
      const id = row[listed].toString();
      const summary = summaries.get(id);
      if (!summary) return null;
      const isYou = id === viewer._id.toString();
      return {
        ...summary,
        isYou,
        isFollowing: following.has(id) && !blocked.has(id),
        canFollow: !isYou && !blocked.has(id),
        since: row.createdAt,
      };
    })
    .filter(Boolean);

  return {
    students,
    total,
    pagination: { limit, nextCursor: rows.length > limit ? page.at(-1)._id.toString() : null, hasMore: rows.length > limit },
  };
}

export const listFollowers = (viewer, targetId, options) => listRelations('followers', viewer, targetId, options);
export const listFollowing = (viewer, targetId, options) => listRelations('following', viewer, targetId, options);

// ----------------------------------------------------------------------------- live updates

/**
 * After a change: the viewer's open tabs get the new relationship and both sides' counts; the other student
 * only gets their own new counts (never who changed them).
 */
function deliver(viewer, result, { otherCountsChanged }) {
  emitToUser(viewer._id, SOCKET_EVENTS.RELATIONSHIP_UPDATED, result);
  if (otherCountsChanged) emitToUser(result.userId, SOCKET_EVENTS.FOLLOW_COUNTS, { ...result.counts, at: result.at });
}

// ----------------------------------------------------------------------------- following

const selfError = (action) => ApiError.unprocessable(`You can't ${action} yourself.`);

export async function followStudent(viewer, targetId) {
  const target = await loadActiveStudent(targetId);
  if (target._id.equals(viewer._id)) throw selfError('follow');
  if ((await blockStateBetween(viewer._id, target._id)).any) throw ApiError.forbidden("You can't follow this student.");

  let created = false;
  try {
    const result = await Follow.updateOne(
      { follower: viewer._id, following: target._id },
      { $setOnInsert: { followerActive: true, followingActive: true } },
      { upsert: true },
    );
    created = result.upsertedCount === 1;
  } catch (error) {
    // The same follow arriving at the same moment: the other request created it.
    if (error?.code !== 11000) throw error;
  }

  if (created) {
    // A block or a status change may have landed between the checks above and the insert: undo or correct.
    const [blockedNow, current] = await Promise.all([
      blockStateBetween(viewer._id, target._id),
      User.findById(target._id).select('status').lean(),
    ]);
    if (blockedNow.any) {
      await Follow.deleteOne({ follower: viewer._id, following: target._id });
      throw ApiError.forbidden("You can't follow this student.");
    }
    if (current?.status !== ACTIVE) await syncFollowVisibility(target._id);
    emitCampusEvent(CAMPUS_EVENTS.STUDENT_FOLLOWED, { followerId: viewer._id.toString(), followingId: target._id.toString() });
  }

  const result = { ...(await snapshot(viewer, target._id)), changed: created };
  deliver(viewer, result, { otherCountsChanged: created });
  return result;
}

export async function unfollowStudent(viewer, targetId) {
  const target = await loadActiveStudent(targetId);
  if (target._id.equals(viewer._id)) throw selfError('unfollow');

  const { deletedCount } = await Follow.deleteOne({ follower: viewer._id, following: target._id });
  if (deletedCount) emitCampusEvent(CAMPUS_EVENTS.STUDENT_UNFOLLOWED, { followerId: viewer._id.toString(), followingId: target._id.toString() });

  const result = { ...(await snapshot(viewer, target._id)), changed: deletedCount > 0 };
  deliver(viewer, result, { otherCountsChanged: deletedCount > 0 });
  return result;
}

// ----------------------------------------------------------------------------- blocking

/** Removes follows in both directions between two students (a block), announcing each one removed. */
async function endFollowsBetween(a, b) {
  const rows = await Follow.find({ $or: [{ follower: a, following: b }, { follower: b, following: a }] }).select('follower following').lean();
  if (!rows.length) return 0;
  const { deletedCount } = await Follow.deleteMany({ _id: { $in: rows.map((row) => row._id) } });
  for (const row of rows) emitCampusEvent(CAMPUS_EVENTS.STUDENT_UNFOLLOWED, { followerId: row.follower.toString(), followingId: row.following.toString() });
  return deletedCount;
}

export async function blockStudent(viewer, targetId) {
  const target = await loadActiveStudent(targetId);
  if (target._id.equals(viewer._id)) throw selfError('block');

  let created = false;
  try {
    await Block.create({ blocker: viewer._id, blocked: target._id });
    created = true;
  } catch (error) {
    // Already blocked (or the same block arriving at the same moment).
    if (error?.code !== 11000) throw error;
  }
  // Every time, not only on the first block: a follow that slipped in meanwhile is removed too.
  const removed = await endFollowsBetween(viewer._id, target._id);

  const result = { ...(await snapshot(viewer, target._id)), changed: created };
  deliver(viewer, result, { otherCountsChanged: removed > 0 });
  return result;
}

export async function unblockStudent(viewer, targetId) {
  const target = await loadActiveStudent(targetId);
  if (target._id.equals(viewer._id)) throw selfError('unblock');
  const { deletedCount } = await Block.deleteOne({ blocker: viewer._id, blocked: target._id });
  const result = { ...(await snapshot(viewer, target._id)), changed: deletedCount > 0 };
  deliver(viewer, result, { otherCountsChanged: false });
  return result;
}

// ----------------------------------------------------------------------------- account status

/**
 * Keeps a student's relationships counted (or not) after their account status changed: suspended, blocked
 * or closed accounts drop out of other students' counts and lists, and come back if the account is restored.
 * Called by services/admin/userManagementService.js after every status change.
 */
export async function syncFollowVisibility(userId) {
  const id = userId instanceof mongoose.Types.ObjectId ? userId : toObjectId(String(userId));
  if (!id) return;
  const user = await User.findById(id).select('status').lean();
  const active = user?.status === ACTIVE;
  await Promise.all([
    Follow.updateMany({ follower: id, followerActive: !active }, { $set: { followerActive: active } }),
    Follow.updateMany({ following: id, followingActive: !active }, { $set: { followingActive: active } }),
  ]);
}
