import { BADGES, GAMIFICATION_RULES, RANK_MILESTONES, RANKING_PERIODS, RANKING_SCOPES } from '../data/gamificationOptions.js';
import StudentGamification from '../models/StudentGamification.js';
import User from '../models/User.js';
import { periodsOf } from '../utils/periods.js';
import { getCache, setCache } from './cacheService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { getBranch, getCollege, getSemester } from './campusOptionsService.js';
import { RANKING_CACHE_VERSION_KEY, calculateLevel, loadRecord, recordRankMilestone, syncStudent } from './gamificationService.js';
import { getStudentSummaries } from './profileService.js';

/*
 * Leaderboards. Scopes come from the signed-in student's own profile (never from the request):
 *   overall   every CampusX student
 *   college   students at their college
 *   branch    their branch at their college
 *   semester  their semester in that branch at that college
 * Periods: all time (totalPoints), this month and this week (points earned in the current calendar
 * month / week, see utils/periods.js). Only students with points in the period are listed.
 *
 * Order (deterministic, never random): points ↓, verified achievements ↓, reached that score earlier ↑,
 * account id ↑.
 *
 * Pages are cached (Redis when connected, memory otherwise) under a version key that changes whenever
 * any points change, so a cached page is never older than the last change or GAMIFICATION_RULES.cacheSeconds.
 */

const PERIOD_FIELDS = {
  all: { points: 'totalPoints', reachedAt: 'totalReachedAt', match: () => ({}) },
  month: { points: 'monthlyPoints', reachedAt: 'monthlyReachedAt', match: (period) => ({ monthKey: period.month }) },
  week: { points: 'weeklyPoints', reachedAt: 'weeklyReachedAt', match: (period) => ({ weekKey: period.week }) },
};

/** The filter for a scope from the student's own profile, or null when their profile lacks it. */
function scopeFilter(scope, viewer) {
  if (scope === 'overall') return {};
  if (!viewer.college) return null;
  if (scope === 'college') return { 'campus.college': viewer.college };
  if (!viewer.branch) return null;
  if (scope === 'branch') return { 'campus.college': viewer.college, 'campus.branch': viewer.branch };
  if (!viewer.semester) return null;
  return { 'campus.college': viewer.college, 'campus.branch': viewer.branch, 'campus.semester': viewer.semester };
}

async function scopeLabel(scope, viewer) {
  if (scope === 'overall') return 'All of CampusX';
  const [college, branch] = await Promise.all([getCollege(viewer.college), getBranch(viewer.branch)]);
  const collegeName = college ? college.aliases?.[0] ?? college.name : null;
  if (scope === 'college') return collegeName;
  if (scope === 'branch') return [branch?.shortName, collegeName].filter(Boolean).join(' · ');
  return [getSemester(viewer.semester)?.label, branch?.shortName, collegeName].filter(Boolean).join(' · ');
}

const periodValue = (record, period, keys) => {
  if (!record) return 0;
  if (period === 'week') return record.weekKey === keys.week ? record.weeklyPoints ?? 0 : 0;
  if (period === 'month') return record.monthKey === keys.month ? record.monthlyPoints ?? 0 : 0;
  return record.totalPoints ?? 0;
};

/**
 * The viewer's position in a leaderboard: how many eligible students in the scope rank above them, plus
 * one. Null rank when they have no points in that period (they aren't listed yet).
 */
async function rankOf(viewer, record, scope, period, keys) {
  const points = periodValue(record, period, keys);
  const filter = scopeFilter(scope, viewer);
  if (!record || !record.eligible || points <= 0 || !filter) return { rank: null, points };
  const fields = PERIOD_FIELDS[period];
  const verified = record.verifiedAchievements ?? 0;
  const reachedAt = record[fields.reachedAt];
  const above = await StudentGamification.countDocuments({
    eligible: true,
    ...filter,
    ...fields.match(keys),
    $or: [
      { [fields.points]: { $gt: points } },
      { [fields.points]: points, verifiedAchievements: { $gt: verified } },
      { [fields.points]: points, verifiedAchievements: verified, [fields.reachedAt]: { $lt: reachedAt } },
      { [fields.points]: points, verifiedAchievements: verified, [fields.reachedAt]: reachedAt, user: { $lt: record.user } },
    ],
  });
  return { rank: above + 1, points };
}

const latestBadge = (record) => {
  const last = [...(record.badges ?? [])].sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt))[0];
  const badge = last && BADGES.find((item) => item.key === last.key);
  return badge ? { key: badge.key, name: badge.name, icon: badge.icon, rarity: badge.rarity } : null;
};

/** One page of a leaderboard (cached), without anything about the viewer. */
async function leaderboardPage(match, fields, { page, limit, cacheKey }) {
  const version = (await getCache(RANKING_CACHE_VERSION_KEY)) ?? 0;
  const key = `ranking:${version}:${cacheKey}:${page}:${limit}`;
  const cached = await getCache(key);
  if (cached) return cached;

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    StudentGamification.find(match)
      .sort({ [fields.points]: -1, verifiedAchievements: -1, [fields.reachedAt]: 1, user: 1 })
      .skip(skip)
      .limit(limit)
      .select(`user totalPoints ${fields.points} verifiedAchievements badges`)
      .lean(),
    StudentGamification.countDocuments(match),
  ]);
  // Public summaries only (name, photo, college, branch, semester); inactive accounts have none.
  const students = await getStudentSummaries(rows.map((row) => row.user));
  const gone = rows.filter((row) => !students.has(row.user.toString())).map((row) => row.user);
  if (gone.length) {
    // Accounts that were suspended or closed leave the rankings for good (until they are active again).
    await StudentGamification.updateMany({ user: { $in: gone } }, { $set: { eligible: false } });
  }
  const entries = rows
    .map((row, index) => ({ row, rank: skip + index + 1 }))
    .filter(({ row }) => students.has(row.user.toString()))
    .map(({ row, rank }) => {
      const level = calculateLevel(row.totalPoints);
      return {
        rank,
        student: students.get(row.user.toString()),
        points: row[fields.points],
        totalPoints: row.totalPoints,
        level: { level: level.level, name: level.name },
        badgeCount: row.badges?.length ?? 0,
        latestBadge: latestBadge(row),
      };
    });
  const result = { entries, total };
  await setCache(key, result, GAMIFICATION_RULES.cacheSeconds);
  return result;
}

/** A leaderboard page plus the viewer's own position in it. */
export async function getLeaderboard(viewer, { scope = 'overall', period = 'all', page = 1, limit = GAMIFICATION_RULES.leaderboardPageSize.default } = {}) {
  await syncStudent(viewer._id);
  const keys = periodsOf();
  const fields = PERIOD_FIELDS[period];
  const filter = scopeFilter(scope, viewer);
  const meta = {
    scope: { id: scope, label: RANKING_SCOPES.find((item) => item.id === scope).label, name: filter ? await scopeLabel(scope, viewer) : null, available: Boolean(filter) },
    period: { id: period, label: RANKING_PERIODS.find((item) => item.id === period).label, key: period === 'week' ? keys.week : period === 'month' ? keys.month : null },
  };
  if (!filter) {
    return { ...meta, leaderboard: [], pagination: { page, limit, total: 0, hasMore: false }, currentUser: null };
  }

  const match = { eligible: true, ...filter, ...fields.match(keys), [fields.points]: { $gt: 0 } };
  const scopeKey = Object.values(filter).join(':') || 'all';
  const periodKey = meta.period.key ?? 'all';
  const [{ entries, total }, record] = await Promise.all([
    leaderboardPage(match, fields, { page, limit, cacheKey: `${scope}:${scopeKey}:${period}:${periodKey}` }),
    loadRecord(viewer._id),
  ]);
  return {
    ...meta,
    leaderboard: entries,
    pagination: { page, limit, total, hasMore: page * limit < total },
    currentUser: await rankOf(viewer, record, scope, period, keys),
  };
}

/** Every rank of the signed-in student, plus points and level, for "Your Campus Position". */
export async function getMyRanks(viewer) {
  await syncStudent(viewer._id);
  const [record, keys] = [await loadRecord(viewer._id), periodsOf()];
  const scopes = ['overall', 'college', 'branch', 'semester'];
  const [ranks, weekly, monthly, names] = await Promise.all([
    Promise.all(scopes.map((scope) => rankOf(viewer, record, scope, 'all', keys))),
    rankOf(viewer, record, 'overall', 'week', keys),
    rankOf(viewer, record, 'overall', 'month', keys),
    Promise.all(scopes.map((scope) => (scopeFilter(scope, viewer) ? scopeLabel(scope, viewer) : null))),
  ]);
  return {
    totalPoints: record?.totalPoints ?? 0,
    level: calculateLevel(record?.totalPoints ?? 0),
    ranks: Object.fromEntries(scopes.map((scope, index) => [scope, { rank: ranks[index].rank, scopeName: names[index] }])),
    weekly,
    monthly,
    badgeCount: record?.badges?.length ?? 0,
    eligible: record?.eligible ?? true,
  };
}

/**
 * After a student gains points: records any ranking milestone (RANK_MILESTONES) that beats their best on
 * the CampusX or college all-time leaderboard, using the same ranking rules as the leaderboards, and
 * announces it (a notification follows). Never called with a rank that went down.
 */
export async function checkRankMilestones(userId) {
  const [student, record] = await Promise.all([User.findById(userId).select('college branch semester').lean(), loadRecord(userId)]);
  if (!student || !record?.eligible) return [];
  const keys = periodsOf();
  const reached = [];
  for (const scope of RANK_MILESTONES.scopes) {
    const filter = scopeFilter(scope, student);
    if (!filter) continue;
    const { rank } = await rankOf(student, record, scope, 'all', keys);
    if (!rank) continue;
    const ranked = await StudentGamification.countDocuments({ eligible: true, ...filter, totalPoints: { $gt: 0 } });
    if (ranked < RANK_MILESTONES.minStudents) continue;
    const tier = [...RANK_MILESTONES.tiers].sort((a, b) => a - b).find((size) => rank <= size && ranked > size);
    if (!tier) continue;
    const leaderboard = scope === 'overall' ? 'overall' : `${scope}:${student.college}`;
    if (await recordRankMilestone(student._id, leaderboard, tier)) {
      reached.push({ scope, tier, rank, scopeName: await scopeLabel(scope, student) });
    }
  }
  for (const milestone of reached) emitCampusEvent(CAMPUS_EVENTS.GAMIFICATION_RANK_MILESTONE, { userId: String(userId), ...milestone });
  return reached;
}
