import {
  BADGES,
  GAMIFICATION_RULES,
  LEVELS,
  NOT_REWARDED,
  POINT_RULES,
  QUALITY_RULES,
  RANKING_PERIODS,
  RANKING_SCOPES,
  TIE_BREAKERS,
} from '../data/gamificationOptions.js';
import env from '../config/env.js';
import PointTransaction from '../models/PointTransaction.js';
import StudentGamification from '../models/StudentGamification.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import logger from '../utils/logger.js';
import { periodsOf } from '../utils/periods.js';
import { setCache } from './cacheService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';

/*
 * The single source of truth for points, levels, badges and streaks. Only this module writes
 * PointTransaction and StudentGamification, and only from server-side events (see
 * gamificationEvents.js); no request can add points, change a level or grant a badge.
 *
 *   awardPoints    +points for an event, once (unique reward key; a reversed award can be reinstated)
 *   reversePoints  takes an award back when its event stops counting
 *   calculateLevel level and progress for a point total
 *   checkAndAwardBadges  grants badges whose requirements are met (each once)
 */

export const RANKING_CACHE_VERSION_KEY = 'ranking:version';
const rewardKeyOf = (userId, action, sourceType, sourceId) => `${userId}:${action}:${sourceType}:${sourceId}`;
const isEligible = (user) => user?.status === ACCOUNT_STATUSES.ACTIVE && Boolean(user.onboardingCompleted);
const STUDENT_FIELDS = 'status onboardingCompleted profileCompletedAt college branch semester';

// ----------------------------------------------------------------------------- levels

/** Level and progress for a point total. The frontend shows these values; it never calculates them. */
export function calculateLevel(totalPoints) {
  const points = Math.max(0, Math.floor(Number(totalPoints) || 0));
  let index = 0;
  LEVELS.forEach((entry, i) => {
    if (points >= entry.minPoints) index = i;
  });
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  const currentLevelPoints = points - current.minPoints;
  return {
    level: current.level,
    name: current.name,
    minPoints: current.minPoints,
    nextLevel: next?.level ?? null,
    nextLevelName: next?.name ?? null,
    nextLevelAt: next?.minPoints ?? null,
    currentLevelPoints,
    pointsToNextLevel: next ? next.minPoints - points : 0,
    progressPercentage: next ? Math.floor((currentLevelPoints / (next.minPoints - current.minPoints)) * 100) : 100,
    isMaxLevel: !next,
  };
}

// ----------------------------------------------------------------------------- the student record

/** Leaderboard pages are cached under a version that changes whenever any points change. */
const touchRankings = () => setCache(RANKING_CACHE_VERSION_KEY, Date.now());

/**
 * Applies a point change to the student's record in one atomic update: totals, the weekly and monthly
 * counters (restarted when a new period begins), the per-action counts, the streak (own activity only)
 * and the campus fields leaderboards filter on. Level fields follow the new total.
 */
async function applyDelta(user, { action, delta, countDelta, own, now }) {
  const period = periodsOf(now);
  const value = (field) => ({ $ifNull: [`$${field}`, 0] });
  const inPeriod = (keyField, key, pointsField) => ({ $cond: [{ $eq: [`$${keyField}`, key] }, { $add: [value(pointsField), delta] }, delta] });
  const activity = own && delta > 0;
  const pipeline = [
    {
      $set: {
        totalPoints: { $max: [0, { $add: [value('totalPoints'), delta] }] },
        lifetimePoints: { $add: [value('lifetimePoints'), Math.max(delta, 0)] },
        totalReachedAt: now,
        weeklyPoints: inPeriod('weekKey', period.week, 'weeklyPoints'),
        weekKey: { $literal: period.week },
        weeklyReachedAt: now,
        monthlyPoints: inPeriod('monthKey', period.month, 'monthlyPoints'),
        monthKey: { $literal: period.month },
        monthlyReachedAt: now,
        [`counts.${action}`]: { $max: [0, { $add: [{ $ifNull: [`$counts.${action}`, 0] }, countDelta] }] },
        verifiedAchievements: { $max: [0, { $add: [value('verifiedAchievements'), action === 'ACHIEVEMENT_VERIFIED' ? countDelta : 0] }] },
        badges: { $ifNull: ['$badges', []] },
        createdAt: { $ifNull: ['$createdAt', now] },
        updatedAt: now,
        ...(user.status && { campus: { $literal: { college: user.college ?? null, branch: user.branch ?? null, semester: user.semester ?? null } }, eligible: isEligible(user) }),
        ...(activity && {
          'streak.current': {
            $switch: {
              branches: [
                { case: { $eq: ['$streak.lastDay', period.day] }, then: { $max: [1, value('streak.current')] } },
                { case: { $eq: ['$streak.lastDay', period.yesterday] }, then: { $add: [value('streak.current'), 1] } },
              ],
              default: 1,
            },
          },
          'streak.lastDay': { $literal: period.day },
          lastActivityAt: now,
        }),
      },
    },
    ...(activity ? [{ $set: { 'streak.longest': { $max: [value('streak.longest'), '$streak.current'] } } }] : []),
  ];
  const before = await StudentGamification.findOneAndUpdate({ user: user._id }, pipeline, { upsert: true, updatePipeline: true, returnDocument: 'before', lean: true });
  const after = await StudentGamification.findOne({ user: user._id }).select('totalPoints').lean();
  const level = calculateLevel(after.totalPoints);
  // Written only if no other change landed meanwhile (that change then writes its own level).
  await StudentGamification.updateOne(
    { user: user._id, totalPoints: after.totalPoints },
    { $set: { level: level.level, currentLevelPoints: level.currentLevelPoints, pointsToNextLevel: level.pointsToNextLevel } },
  );
  if (level.level > calculateLevel(before?.totalPoints ?? 0).level) {
    emitCampusEvent(CAMPUS_EVENTS.GAMIFICATION_LEVEL_REACHED, { userId: user._id.toString(), level: level.level });
  }
}

async function settle(user, { action, delta, countDelta, now }) {
  await applyDelta(user, { action, delta, countDelta, own: POINT_RULES[action].own, now });
  if (delta > 0) await checkAndAwardBadges(user._id);
  await touchRankings();
  if (delta > 0) emitCampusEvent(CAMPUS_EVENTS.GAMIFICATION_POINTS_EARNED, { userId: user._id.toString() });
}

/**
 * Records a ranking milestone if it beats the student's best on that leaderboard (smaller tier = better).
 * Atomic, so the same milestone is never recorded twice. Returns whether it was new.
 */
export async function recordRankMilestone(userId, leaderboard, tier) {
  const field = `rankMilestones.${leaderboard}`;
  const { modifiedCount } = await StudentGamification.updateOne(
    { user: userId, $or: [{ [field]: { $exists: false } }, { [field]: { $gt: tier } }] },
    { $set: { [field]: tier } },
  );
  return modifiedCount > 0;
}

/** Whether a daily, weekly or lifetime cap for this action is already used up. */
async function capReached(userId, action, now) {
  const caps = POINT_RULES[action].caps;
  if (!caps) return false;
  const period = periodsOf(now);
  const windows = [
    caps.perDay && [period.dayStart, caps.perDay],
    caps.perWeek && [period.weekStart, caps.perWeek],
    caps.lifetime && [null, caps.lifetime],
  ].filter(Boolean);
  for (const [since, max] of windows) {
    const count = await PointTransaction.countDocuments({ user: userId, action, kind: 'award', reversed: false, ...(since && { createdAt: { $gte: since } }) });
    if (count >= max) return true;
  }
  return false;
}

// ----------------------------------------------------------------------------- awarding and reversing

/**
 * Awards the points for one rewardable event. Never twice: the reward key (student + action + source)
 * is unique in the ledger, so simultaneous requests can't both succeed. An award that was reversed is
 * reinstated instead. Refused for inactive or not-onboarded accounts and once a cap is reached.
 * Returns { awarded, reason? }.
 */
export async function awardPoints({ userId, action, sourceType, sourceId, parentId, metadata }) {
  const rule = POINT_RULES[action];
  if (!rule) throw new Error(`Unknown point action: ${action}`);
  const user = await User.findById(userId).select(STUDENT_FIELDS).lean();
  if (!isEligible(user)) return { awarded: false, reason: 'not-eligible' };

  const rewardKey = rewardKeyOf(userId, action, sourceType, sourceId);
  const existing = await PointTransaction.findOne({ rewardKey }).select('reversed').lean();
  if (existing && !existing.reversed) return { awarded: false, reason: 'duplicate' };
  const now = new Date();
  if (await capReached(user._id, action, now)) return { awarded: false, reason: 'cap' };

  if (existing) {
    const award = await PointTransaction.findOneAndUpdate({ _id: existing._id, reversed: true }, { $set: { reversed: false }, $unset: { reversedAt: 1 } }, { returnDocument: 'after', lean: true });
    if (!award) return { awarded: false, reason: 'duplicate' };
    await PointTransaction.create({ user: user._id, points: award.points, action, kind: 'reinstatement', sourceType, sourceId: String(sourceId), parentId: award.parentId, description: `${rule.label} (counts again)`, award: award._id });
    await settle(user, { action, delta: award.points, countDelta: 1, now });
    return { awarded: true, reinstated: true };
  }

  try {
    await PointTransaction.create({
      user: user._id,
      points: rule.points,
      action,
      kind: 'award',
      sourceType,
      sourceId: String(sourceId),
      ...(parentId && { parentId: String(parentId) }),
      description: rule.label,
      ...(metadata && { metadata }),
      rewardKey,
      reversed: false,
    });
  } catch (error) {
    if (error?.code === 11000) return { awarded: false, reason: 'duplicate' };
    throw error;
  }
  await settle(user, { action, delta: rule.points, countDelta: 1, now });
  return { awarded: true };
}

/** Takes back an award whose event no longer counts (deleted, made private, unliked, ...). */
export async function reversePoints({ userId, action, sourceType, sourceId, reason }) {
  const rule = POINT_RULES[action];
  if (!rule) throw new Error(`Unknown point action: ${action}`);
  const now = new Date();
  const award = await PointTransaction.findOneAndUpdate(
    { rewardKey: rewardKeyOf(userId, action, sourceType, sourceId), reversed: false },
    { $set: { reversed: true, reversedAt: now } },
    { returnDocument: 'after', lean: true },
  );
  if (!award) return { reversed: false };
  await PointTransaction.create({
    user: award.user,
    points: -award.points,
    action,
    kind: 'reversal',
    sourceType,
    sourceId: award.sourceId,
    ...(award.parentId && { parentId: award.parentId }),
    description: reason ? `${rule.label} (${reason})` : `${rule.label} (no longer counts)`,
    award: award._id,
  });
  const user = (await User.findById(award.user).select(STUDENT_FIELDS).lean()) ?? { _id: award.user };
  await settle(user, { action, delta: -award.points, countDelta: -1, now });
  return { reversed: true };
}

/** Reverses every current award attached to a piece of content, e.g. the likes and comments of a deleted post. */
export async function reverseByParent(parentId, reason) {
  const awards = await PointTransaction.find({ parentId: String(parentId), kind: 'award', reversed: false }).select('user action sourceType sourceId').lean();
  for (const award of awards) {
    await reversePoints({ userId: award.user.toString(), action: award.action, sourceType: award.sourceType, sourceId: award.sourceId, reason });
  }
}

// ----------------------------------------------------------------------------- badges

function badgeProgress(badge, record) {
  const counts = record?.counts ?? {};
  switch (badge.requirementType) {
    case 'action':
      return counts[badge.requirement] ?? 0;
    case 'interactions':
      return (counts.POST_LIKE_RECEIVED ?? 0) + (counts.COMMENT_RECEIVED ?? 0);
    case 'level':
      return calculateLevel(record?.totalPoints ?? 0).level;
    case 'points':
      return record?.totalPoints ?? 0;
    case 'streak':
      return record?.streak?.longest ?? 0;
    default:
      return 0;
  }
}

/** Grants every badge whose requirement is now met. Each badge is earned once and then kept. */
export async function checkAndAwardBadges(userId) {
  const record = await StudentGamification.findOne({ user: userId }).lean();
  if (!record) return [];
  const earned = new Set(record.badges.map((badge) => badge.key));
  const granted = [];
  for (const badge of BADGES) {
    if (earned.has(badge.key) || badgeProgress(badge, record) < badge.value) continue;
    const { modifiedCount } = await StudentGamification.updateOne(
      { user: userId, 'badges.key': { $ne: badge.key } },
      { $push: { badges: { key: badge.key, earnedAt: new Date() } } },
    );
    if (modifiedCount) granted.push(badge.key);
  }
  if (granted.length) emitCampusEvent(CAMPUS_EVENTS.GAMIFICATION_BADGES_EARNED, { userId: userId.toString(), badges: granted });
  return granted;
}

// ----------------------------------------------------------------------------- the student's profile

/**
 * Brings a student's record in line with their profile: campus fields and eligibility for leaderboards,
 * plus the one-off onboarding and profile rewards (so accounts that finished them before this feature
 * existed are counted too).
 */
export async function syncStudent(userId) {
  const user = await User.findById(userId).select(STUDENT_FIELDS).lean();
  if (!user) return;
  const { modifiedCount } = await StudentGamification.updateOne(
    { user: user._id },
    { $set: { campus: { college: user.college ?? null, branch: user.branch ?? null, semester: user.semester ?? null }, eligible: isEligible(user) } },
  );
  if (modifiedCount) await touchRankings();
  if (user.onboardingCompleted) await awardPoints({ userId: user._id, action: 'ONBOARDING_COMPLETED', sourceType: 'user', sourceId: user._id });
  if (user.profileCompletedAt) await awardPoints({ userId: user._id, action: 'PROFILE_COMPLETED', sourceType: 'user', sourceId: user._id });
}

const badgeView = (badge, record) => {
  const earned = record?.badges?.find((item) => item.key === badge.key);
  return {
    key: badge.key,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    rarity: badge.rarity,
    earned: Boolean(earned),
    earnedAt: earned?.earnedAt ?? null,
    progress: { current: Math.min(badgeProgress(badge, record), badge.value), target: badge.value },
  };
};

/** The streak still counts if the student was active today or yesterday. */
function liveStreak(record, period) {
  const streak = record?.streak ?? {};
  const alive = streak.lastDay === period.day || streak.lastDay === period.yesterday;
  return { current: alive ? streak.current ?? 0 : 0, longest: streak.longest ?? 0, activeToday: streak.lastDay === period.day };
}

export async function loadRecord(userId) {
  return StudentGamification.findOne({ user: userId }).lean();
}

/** Points, level, streak and badges for the signed-in student. */
export async function getGamificationProfile(viewer) {
  await syncStudent(viewer._id);
  const record = await loadRecord(viewer._id);
  const period = periodsOf();
  const earned = BADGES.filter((badge) => record?.badges?.some((item) => item.key === badge.key));
  return {
    totalPoints: record?.totalPoints ?? 0,
    lifetimePoints: record?.lifetimePoints ?? 0,
    level: calculateLevel(record?.totalPoints ?? 0),
    weeklyPoints: record?.weekKey === period.week ? record.weeklyPoints : 0,
    monthlyPoints: record?.monthKey === period.month ? record.monthlyPoints : 0,
    streak: liveStreak(record, period),
    badges: { earned: earned.map((badge) => badgeView(badge, record)), earnedCount: earned.length, total: BADGES.length },
    verifiedAchievements: record?.verifiedAchievements ?? 0,
    lastActivityAt: record?.lastActivityAt ?? null,
  };
}

/** Every badge with the student's earned state and progress. */
export async function listBadges(viewer) {
  await syncStudent(viewer._id);
  const record = await loadRecord(viewer._id);
  const badges = BADGES.map((badge) => badgeView(badge, record));
  return { badges, earnedCount: badges.filter((badge) => badge.earned).length, total: badges.length };
}

// Where a ledger row's activity can be opened. Likes and comments link to the post only, never to who
// reacted.
const LINK_TYPES = {
  post: (row) => ({ type: 'post', id: row.sourceId }),
  'post-like': (row) => ({ type: 'post', id: row.parentId }),
  'post-comment': (row) => ({ type: 'post', id: row.parentId }),
  project: (row) => ({ type: 'project', id: row.sourceId }),
  achievement: (row) => ({ type: 'achievement', id: row.sourceId }),
  community: (row) => ({ type: 'community', id: row.sourceId }),
  'community-membership': (row) => ({ type: 'community', id: row.sourceId }),
  opportunity: (row) => ({ type: 'opportunity', id: row.sourceId }),
  user: () => ({ type: 'profile', id: null }),
};

/** The signed-in student's own point history, newest first. */
export async function listTransactions(viewer, { page = 1, limit = GAMIFICATION_RULES.transactionPageSize.default } = {}) {
  const match = { user: viewer._id };
  const [rows, total] = await Promise.all([
    PointTransaction.find(match).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PointTransaction.countDocuments(match),
  ]);
  return {
    transactions: rows.map((row) => ({
      id: row._id.toString(),
      kind: row.kind,
      action: row.action,
      label: POINT_RULES[row.action]?.label ?? row.action,
      description: row.description,
      points: row.points,
      // A reversed award stays in the history; its reversal is its own row.
      reversed: row.kind === 'award' ? Boolean(row.reversed) : undefined,
      link: LINK_TYPES[row.sourceType]?.(row) ?? null,
      createdAt: row.createdAt,
    })),
    pagination: { page, limit, total, hasMore: page * limit < total },
  };
}

/** The rules, shown to students so they can see exactly how points work. */
export function getRules() {
  return {
    points: Object.entries(POINT_RULES).map(([action, rule]) => ({ action, points: rule.points, label: rule.label, caps: rule.caps ?? null })),
    quality: QUALITY_RULES,
    notRewarded: NOT_REWARDED,
    levels: LEVELS,
    badges: BADGES.map(({ key, name, description, icon, rarity }) => ({ key, name, description, icon, rarity })),
    scopes: RANKING_SCOPES,
    periods: RANKING_PERIODS,
    tieBreakers: TIE_BREAKERS,
    timezone: env.gamificationTimezone,
    pageSizes: { leaderboard: GAMIFICATION_RULES.leaderboardPageSize, transactions: GAMIFICATION_RULES.transactionPageSize },
  };
}

export const logGamificationError = (what, error) => logger.warn(`Gamification: ${what} failed: ${error?.message ?? error}`);
