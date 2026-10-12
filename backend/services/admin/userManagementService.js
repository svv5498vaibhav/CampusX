import { PERMISSIONS, USER_STATUS_ACTIONS, hasPermission } from '../../config/adminConfig.js';
import { ENFORCEMENT, REPORT_REASONS } from '../../config/moderationConfig.js';
import Achievement from '../../models/Achievement.js';
import Comment from '../../models/Comment.js';
import Community from '../../models/Community.js';
import CommunityMember from '../../models/CommunityMember.js';
import ModerationCase from '../../models/ModerationCase.js';
import OpportunityApplication from '../../models/OpportunityApplication.js';
import Post from '../../models/Post.js';
import Project from '../../models/Project.js';
import Report from '../../models/Report.js';
import Session, { REVOKE_REASONS } from '../../models/Session.js';
import StudentGamification from '../../models/StudentGamification.js';
import User, { ACCOUNT_STATUSES, ROLES } from '../../models/User.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/objectId.js';
import { CAMPUS_EVENTS, emitCampusEvent } from '../campusEvents.js';
import { getOnboardingOptions } from '../campusOptionsService.js';
import { revokeSessionById } from '../sessionService.js';
import { assertPermission, campusLabels, escapeRegex, pageOf } from './adminAccess.js';
import { historyFor, recordAdminAction } from './auditService.js';

/*
 * Student management for admins (MANAGE_USERS). Accounts are read through explicit allow-lists
 * (aggregation $project / select), never whole documents, so password hashes, login counters, IP
 * addresses and Cloudinary ids can't leak even if the schema grows.
 *
 * Anonymous Zone privacy: nothing here counts, lists or links a student's anonymous posts or comments.
 * Cases and reports about anonymous content are left out of a student's history on purpose.
 */

const ANONYMOUS_TYPES = ['anonymousPost', 'anonymousComment'];
const REASON_LABELS = new Map(REPORT_REASONS.map((reason) => [reason.id, reason.label]));
const DAY = 24 * 60 * 60 * 1000;

/** The only account fields the user list ever reads. */
const LIST_PROJECTION = {
  firstName: 1,
  lastName: 1,
  email: 1,
  avatarUrl: 1,
  college: 1,
  branch: 1,
  semester: 1,
  role: 1,
  status: 1,
  emailVerified: 1,
  isVerified: 1,
  onboardingCompleted: 1,
  createdAt: 1,
  lastLoginAt: 1,
  riskLevel: '$moderation.riskLevel',
};

/** "vnit", "Computer Science", "CSE" → matching college and branch ids (names, aliases, short names). */
function campusIdsMatching(pattern, { colleges, branches }) {
  return {
    colleges: colleges.filter((college) => [college.name, college.city, ...(college.aliases ?? [])].some((text) => text && pattern.test(text))).map((college) => college.id),
    branches: branches.filter((branch) => [branch.name, branch.shortName].some((text) => text && pattern.test(text))).map((branch) => branch.id),
  };
}

async function userFilter({ search, status, role, college, branch }) {
  const conditions = [];
  if (status) conditions.push({ status });
  if (role) conditions.push({ role });
  if (college) conditions.push({ college });
  if (branch) conditions.push({ branch });
  if (search) {
    const options = await getOnboardingOptions();
    const words = search.split(/\s+/).filter(Boolean).slice(0, 4);
    // Every word must match something: a name, the email, or a college/branch name.
    for (const word of words) {
      const pattern = new RegExp(escapeRegex(word), 'i');
      const campus = campusIdsMatching(pattern, options);
      conditions.push({
        $or: [
          { firstName: pattern },
          { lastName: pattern },
          { email: pattern },
          ...(campus.colleges.length ? [{ college: { $in: campus.colleges } }] : []),
          ...(campus.branches.length ? [{ branch: { $in: campus.branches } }] : []),
        ],
      });
    }
  }
  return conditions.length ? { $and: conditions } : {};
}

const SORTS = { newest: { createdAt: -1, _id: -1 }, oldest: { createdAt: 1, _id: 1 }, name: { firstName: 1, lastName: 1, _id: 1 }, lastLogin: { lastLoginAt: -1, _id: -1 } };

async function toListView(user) {
  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
    ...(await campusLabels(user.college, user.branch)),
    semester: user.semester ?? null,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerified),
    isVerified: Boolean(user.isVerified),
    onboardingCompleted: Boolean(user.onboardingCompleted),
    riskLevel: user.riskLevel ?? 'low',
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

/** GET /admin/users: search (name, email, college, branch), filters, sorting, pages. */
export async function listUsers(actor, { sort = 'newest', page = 1, limit = 20, ...filters } = {}) {
  assertPermission(actor, PERMISSIONS.MANAGE_USERS);
  const match = await userFilter(filters);
  const [rows, total, byStatus] = await Promise.all([
    User.aggregate([{ $match: match }, { $sort: SORTS[sort] ?? SORTS.newest }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: LIST_PROJECTION }]),
    User.countDocuments(match),
    User.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(Object.values(ACCOUNT_STATUSES).map((value) => [value, 0]));
  for (const row of byStatus) counts[row._id] = row.count;
  counts.all = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { users: await Promise.all(rows.map(toListView)), counts, pagination: pageOf(page, limit, total) };
}

// ----------------------------------------------------------------------------- one student

async function loadAccount(userId) {
  const id = toObjectId(String(userId));
  const rows = id
    ? await User.aggregate([
        { $match: { _id: id } },
        { $project: { ...LIST_PROJECTION, rollNumber: 1, bio: 1, interests: 1, skills: 1, profileCompleted: 1, onboardingCompletedAt: 1, trust: '$moderation' } },
      ])
    : [];
  if (!rows.length) throw ApiError.notFound('Student not found.');
  return rows[0];
}

const recent = (dates) => (dates ?? []).filter((date) => new Date(date).getTime() >= Date.now() - ENFORCEMENT.windowDays * DAY).length;

/** What status changes an admin can make on this account right now. */
function statusActionsFor(account, actor) {
  if (account._id.equals(actor._id) || account.role === ROLES.ADMIN) return [];
  if (account.role === ROLES.MODERATOR && !hasPermission(actor, PERMISSIONS.MANAGE_SYSTEM)) return [];
  return Object.entries(USER_STATUS_ACTIONS).filter(([, rule]) => rule.from.includes(account.status)).map(([id]) => id);
}

/** GET /admin/users/:id: profile, academics, activity, moderation and report history, rankings, spaces. */
export async function getUserDetail(actor, userId) {
  assertPermission(actor, PERMISSIONS.MANAGE_USERS);
  const account = await loadAccount(userId);
  const id = account._id;
  const notAnonymous = { targetType: { $nin: ANONYMOUS_TYPES } };
  const [
    counts,
    gamification,
    memberships,
    createdCommunities,
    projects,
    achievements,
    moderationHistory,
    contentCases,
    reportsFiled,
    reportsAgainst,
    activeSessions,
  ] = await Promise.all([
    Promise.all([
      Post.countDocuments({ author: id }),
      Comment.countDocuments({ author: id }),
      Project.countDocuments({ owner: id }),
      Achievement.countDocuments({ owner: id }),
      CommunityMember.countDocuments({ user: id, status: 'active' }),
      OpportunityApplication.countDocuments({ user: id }),
      Report.countDocuments({ reporter: id }),
      Report.countDocuments({ targetOwner: id, ...notAnonymous }),
    ]),
    StudentGamification.findOne({ user: id }).select('totalPoints lifetimePoints level weeklyPoints monthlyPoints badges streak lastActivityAt eligible').lean(),
    CommunityMember.find({ user: id, status: 'active' }).sort({ joinedAt: -1 }).limit(12).select('community role joinedAt').lean(),
    Community.countDocuments({ createdBy: id }),
    Project.find({ owner: id }).sort({ _id: -1 }).limit(6).select('title status visibility moderationStatus createdAt').lean(),
    Achievement.find({ owner: id }).sort({ _id: -1 }).limit(6).select('title type verificationStatus moderationStatus date').lean(),
    historyFor('user', id, { limit: 20 }),
    ModerationCase.find({ targetOwner: id, ...notAnonymous, targetType: { $nin: [...ANONYMOUS_TYPES, 'user'] } })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('targetType targetId status action priority riskLevel reportCount createdAt resolvedAt')
      .lean(),
    Report.find({ reporter: id }).sort({ createdAt: -1 }).limit(8).select('targetType reason status createdAt').lean(),
    Report.find({ targetOwner: id, ...notAnonymous }).sort({ createdAt: -1 }).limit(8).select('targetType targetId reason status priority createdAt').lean(),
    Session.countDocuments({ user: id, revokedAt: null, expiresAt: { $gt: new Date() } }),
  ]);
  const communities = await Community.find({ _id: { $in: memberships.map((row) => row.community) } }).select('name type moderationStatus status').lean();
  const communityById = new Map(communities.map((community) => [community._id.toString(), community]));
  const trust = account.trust ?? {};
  const [posts, comments, projectCount, achievementCount, communityCount, trackedOpportunities, filed, against] = counts;

  return {
    user: {
      ...(await toListView(account)),
      rollNumber: account.rollNumber ?? null,
      bio: account.bio ?? '',
      interests: account.interests ?? [],
      skills: account.skills ?? [],
      profileCompleted: Boolean(account.profileCompleted),
      onboardingCompletedAt: account.onboardingCompletedAt ?? null,
      activeSessions,
    },
    activity: { posts, comments, projects: projectCount, achievements: achievementCount, communities: communityCount, communitiesCreated: createdCommunities, trackedOpportunities, reportsFiled: filed, reportsAgainst: against },
    trust: {
      riskScore: trust.riskScore ?? 0,
      riskLevel: trust.riskLevel ?? 'low',
      warningCount: trust.warningCount ?? 0,
      violationCount: trust.violationCount ?? 0,
      recentViolations: recent(trust.violationDates),
      restrictedUntil: trust.restrictedUntil && new Date(trust.restrictedUntil) > new Date() ? trust.restrictedUntil : null,
      reportsDismissed: trust.reportsDismissed ?? 0,
      flags: trust.flags ?? [],
      lastModerationAt: trust.lastModerationAt ?? null,
    },
    moderationHistory,
    contentCases: contentCases.map((item) => ({ id: item._id.toString(), targetType: item.targetType, targetId: item.targetId.toString(), status: item.status, action: item.action, priority: item.priority, riskLevel: item.riskLevel, reportCount: item.reportCount, createdAt: item.createdAt, resolvedAt: item.resolvedAt ?? null })),
    reports: {
      filed: reportsFiled.map((row) => ({ id: row._id.toString(), targetType: row.targetType, reason: row.reason, reasonLabel: REASON_LABELS.get(row.reason) ?? row.reason, status: row.status, createdAt: row.createdAt })),
      against: reportsAgainst.map((row) => ({ id: row._id.toString(), targetType: row.targetType, targetId: row.targetId.toString(), reason: row.reason, reasonLabel: REASON_LABELS.get(row.reason) ?? row.reason, status: row.status, priority: row.priority, createdAt: row.createdAt })),
    },
    gamification: gamification
      ? { totalPoints: gamification.totalPoints ?? 0, lifetimePoints: gamification.lifetimePoints ?? 0, level: gamification.level ?? 1, weeklyPoints: gamification.weeklyPoints ?? 0, monthlyPoints: gamification.monthlyPoints ?? 0, badges: (gamification.badges ?? []).length, streak: gamification.streak?.current ?? 0, longestStreak: gamification.streak?.longest ?? 0, lastActivityAt: gamification.lastActivityAt ?? null, eligible: gamification.eligible !== false }
      : null,
    communities: memberships.map((row) => {
      const community = communityById.get(row.community.toString());
      return { id: row.community.toString(), name: community?.name ?? 'Removed community', type: community?.type ?? null, role: row.role, joinedAt: row.joinedAt, moderationStatus: community?.moderationStatus ?? null };
    }),
    projects: projects.map((row) => ({ id: row._id.toString(), title: row.title, status: row.status, visibility: row.visibility, moderationStatus: row.moderationStatus ?? 'approved', createdAt: row.createdAt })),
    achievements: achievements.map((row) => ({ id: row._id.toString(), title: row.title, type: row.type, verificationStatus: row.verificationStatus, moderationStatus: row.moderationStatus ?? 'approved', date: row.date })),
    statusActions: statusActionsFor(account, actor),
  };
}

/**
 * PATCH /admin/users/:id/status: suspend · unsuspend · block · activate · deactivate. Never your own
 * account or an admin's; moderators' accounts need MANAGE_SYSTEM. The change is atomic (only from the
 * statuses the action allows); leaving "active" signs the student out everywhere at once (sessions and
 * live connections). Rankings and recommendations pick the change up through STUDENT_PROFILE_CHANGED.
 */
export async function changeUserStatus(actor, userId, { action, reason = '' }) {
  assertPermission(actor, PERMISSIONS.MANAGE_USERS);
  const rule = Object.hasOwn(USER_STATUS_ACTIONS, action) ? USER_STATUS_ACTIONS[action] : null;
  if (!rule) throw ApiError.unprocessable('Please choose a valid action.');
  const id = toObjectId(String(userId));
  const account = id ? await User.findById(id).select('role status').lean() : null;
  if (!account) throw ApiError.notFound('Student not found.');
  if (account._id.equals(actor._id)) throw ApiError.forbidden("You can't change the status of your own account.");
  if (account.role === ROLES.ADMIN) throw ApiError.forbidden("Admin accounts can't be changed from the control center.");
  if (account.role === ROLES.MODERATOR) assertPermission(actor, PERMISSIONS.MANAGE_SYSTEM);
  if (!rule.from.includes(account.status)) {
    throw ApiError.conflict(account.status === rule.to ? `This account is already ${rule.to}.` : `This action isn't available for a ${account.status} account.`);
  }

  const { modifiedCount } = await User.updateOne({ _id: id, status: { $in: rule.from } }, { $set: { status: rule.to } });
  if (!modifiedCount) throw ApiError.conflict('This account changed meanwhile. Refresh and try again.');

  if (rule.to !== ACCOUNT_STATUSES.ACTIVE) {
    const sessions = await Session.find({ user: id, revokedAt: null }).select('_id').lean();
    await Promise.all(sessions.map((session) => revokeSessionById(session._id, REVOKE_REASONS.ACCOUNT_INACTIVE)));
  }
  emitCampusEvent(CAMPUS_EVENTS.STUDENT_PROFILE_CHANGED, { userId: id.toString() });
  await recordAdminAction(actor, { action: rule.audit, targetType: 'user', targetId: id, previousStatus: account.status, newStatus: rule.to, reason });
  return getUserDetail(actor, id.toString());
}
