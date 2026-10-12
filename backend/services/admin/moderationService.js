import { ADMIN_CACHE_SECONDS, CASE_ACTIONS, PERMISSIONS, hasPermission } from '../../config/adminConfig.js';
import { ENFORCEMENT, REPORT_REASONS } from '../../config/moderationConfig.js';
import Achievement from '../../models/Achievement.js';
import AnonymousComment from '../../models/AnonymousComment.js';
import AnonymousPost from '../../models/AnonymousPost.js';
import Comment from '../../models/Comment.js';
import Community from '../../models/Community.js';
import ModerationCase from '../../models/ModerationCase.js';
import Post from '../../models/Post.js';
import Project from '../../models/Project.js';
import Report from '../../models/Report.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/objectId.js';
import { getAnonymousAuthorForModeration, getAnonymousCommentAuthorForModeration } from '../anonymousModeration.js';
import { getCache, setCache } from '../cacheService.js';
import { decideCase, toCaseView } from '../moderationCaseService.js';
import { TARGETS, loadTrust } from '../moderationService.js';
import { assertPermission, campusLabels, pageOf, peopleById } from './adminAccess.js';
import { ADMIN_CACHE_KEYS } from './adminCache.js';
import { previewKey, previewTarget, previewTargets } from './adminTargets.js';
import { historyFor } from './auditService.js';

/*
 * The moderation center: the Phase 13 case queue with filters, a case's full picture (content, reports,
 * risk, the owner's record, history) and decisions. Decisions go through moderationCaseService.decideCase,
 * the one place cases are decided; this file adds nothing to how content is moderated.
 *
 * Privacy: never sent from here: who reported something, or who wrote anonymous content (nor that
 * author's record). Revealing an anonymous author is a separate, audited request with a reason.
 */

const ANONYMOUS_TYPES = ['anonymousPost', 'anonymousComment'];
const REASON_LABELS = new Map(REPORT_REASONS.map((reason) => [reason.id, reason.label]));
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const rankStage = { $addFields: { _rank: { $switch: { branches: Object.entries(PRIORITY_RANK).map(([priority, rank]) => ({ case: { $eq: ['$priority', priority] }, then: rank })), default: 4 } } } };

/** Collections with a moderation status, for the queue summary. */
const MODERATED_MODELS = [Post, Comment, Project, Achievement, Community, AnonymousPost, AnonymousComment];

function caseFilter({ status = 'active', riskLevel, targetType, priority, from, to }) {
  const conditions = [];
  if (status === 'active') conditions.push({ active: true });
  else if (status !== 'all') conditions.push({ status });
  if (riskLevel) conditions.push({ riskLevel });
  if (targetType) conditions.push({ targetType });
  if (priority === 'urgent') conditions.push({ priority: { $in: ['high', 'critical'] } });
  else if (priority) conditions.push({ priority });
  if (from || to) conditions.push({ createdAt: { ...(from && { $gte: from }), ...(to && { $lte: to }) } });
  return conditions.length ? { $and: conditions } : {};
}

/**
 * Counts for the summary tiles: cases by status, active high-risk cases, and content by moderation
 * status across every kind. Cached briefly (they are read on every visit to the queue).
 */
export async function getModerationSummary({ refresh = false } = {}) {
  const key = ADMIN_CACHE_KEYS.moderationSummary;
  if (!refresh) {
    const cached = await getCache(key);
    if (cached) return cached;
  }
  const [byStatus, highRisk, contentCounts] = await Promise.all([
    ModerationCase.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ModerationCase.countDocuments({ active: true, riskLevel: { $in: ['high', 'critical'] } }),
    Promise.all(MODERATED_MODELS.map((model) => model.aggregate([{ $match: { moderationStatus: { $in: ['pending', 'flagged', 'restricted', 'removed'] } } }, { $group: { _id: '$moderationStatus', count: { $sum: 1 } } }]))),
  ]);
  const cases = { open: 0, reviewing: 0, resolved: 0, dismissed: 0 };
  for (const row of byStatus) cases[row._id] = row.count;
  const content = { pending: 0, flagged: 0, restricted: 0, removed: 0 };
  for (const row of contentCounts.flat()) content[row._id] += row.count;
  const summary = { cases: { ...cases, active: cases.open + cases.reviewing }, highRisk, content, generatedAt: new Date().toISOString() };
  await setCache(key, summary, ADMIN_CACHE_SECONDS.moderationSummary);
  return summary;
}

/** GET /admin/moderation: the queue, most urgent first (or newest first), with a preview of each target. */
export async function listModerationQueue(actor, { sort = 'priority', page = 1, limit = 20, ...filters } = {}) {
  assertPermission(actor, PERMISSIONS.REVIEW_MODERATION);
  const match = caseFilter(filters);
  const order = sort === 'newest' ? [{ $sort: { createdAt: -1, _id: -1 } }] : [rankStage, { $sort: { _rank: 1, updatedAt: -1, _id: -1 } }];
  const [rows, total, summary] = await Promise.all([
    ModerationCase.aggregate([{ $match: match }, ...order, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { reportedBy: 0, targetOwner: 0, _rank: 0 } }]),
    ModerationCase.countDocuments(match),
    page === 1 ? getModerationSummary() : null,
  ]);
  const previews = await previewTargets(rows.map((row) => ({ targetType: row.targetType, targetId: row.targetId })));
  return {
    cases: rows.map((row) => ({ ...toCaseView(row), target: previews.get(previewKey(row.targetType, row.targetId)) ?? null })),
    ...(summary && { summary }),
    pagination: pageOf(page, limit, total),
  };
}

/** Decisions that make sense for this case right now. */
function allowedDecisions(moderationCase, { hasOwner }) {
  if (!moderationCase.active) return [];
  const spec = TARGETS[moderationCase.targetType];
  const allowed = ['approve', 'dismiss'];
  if (!spec?.statusless) allowed.push('flag', 'restrict', 'remove');
  if (moderationCase.targetType === 'user') allowed.push('restrict');
  if (hasOwner) allowed.push('warn');
  if (!(moderationCase.action === 'ESCALATE' && moderationCase.priority === 'critical')) allowed.push('escalate');
  return Object.keys(CASE_ACTIONS).filter((id) => allowed.includes(id));
}

const recentViolations = (trust) => (trust.violationDates ?? []).filter((date) => new Date(date).getTime() >= Date.now() - ENFORCEMENT.windowDays * 24 * 60 * 60 * 1000).length;

/** The owner's record for staff: never for anonymous content (it would point at the author). */
async function ownerRecord(ownerId, moderationCase) {
  if (!ownerId) return null;
  if (ANONYMOUS_TYPES.includes(moderationCase.targetType)) return { anonymous: true };
  const [people, { trust }, previousCases] = await Promise.all([
    peopleById([ownerId]),
    loadTrust(ownerId),
    ModerationCase.find({ targetOwner: ownerId, _id: { $ne: moderationCase._id }, targetType: { $nin: ANONYMOUS_TYPES }, status: 'resolved' })
      .sort({ resolvedAt: -1, _id: -1 })
      .limit(5)
      .select('targetType targetId action status resolvedAt createdAt')
      .lean(),
  ]);
  return {
    anonymous: false,
    person: people.get(ownerId.toString()) ?? null,
    trust: {
      riskScore: trust.riskScore ?? 0,
      riskLevel: trust.riskLevel ?? 'low',
      warningCount: trust.warningCount ?? 0,
      violationCount: trust.violationCount ?? 0,
      recentViolations: recentViolations(trust),
      restrictedUntil: trust.restrictedUntil && new Date(trust.restrictedUntil) > new Date() ? trust.restrictedUntil : null,
    },
    previousViolations: previousCases.map((item) => ({ id: item._id.toString(), targetType: item.targetType, targetId: item.targetId.toString(), action: item.action, resolvedAt: item.resolvedAt ?? null })),
  };
}

/** Reports attached to the case's target: reasons and counts. Never who sent them. */
async function reportsFor(moderationCase) {
  const rows = await Report.find({ targetType: moderationCase.targetType, targetId: moderationCase.targetId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(30)
    .select('reason description status priority createdAt +suspicious')
    .lean();
  const byReason = new Map();
  for (const row of rows) byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
  return {
    total: rows.length,
    byReason: [...byReason].map(([reason, count]) => ({ reason, label: REASON_LABELS.get(reason) ?? reason, count })).sort((a, b) => b.count - a.count),
    items: rows.map((row) => ({ id: row._id.toString(), reason: row.reason, reasonLabel: REASON_LABELS.get(row.reason) ?? row.reason, description: row.description ?? '', status: row.status, priority: row.priority, suspicious: Boolean(row.suspicious), createdAt: row.createdAt })),
  };
}

/** GET /admin/moderation/:id: everything needed to decide a case. */
export async function getModerationCase(actor, caseId) {
  assertPermission(actor, PERMISSIONS.REVIEW_MODERATION);
  const id = toObjectId(String(caseId));
  const moderationCase = id ? await ModerationCase.findById(id).select('+targetOwner').lean() : null;
  if (!moderationCase) throw ApiError.notFound('Case not found.');
  const ownerId = moderationCase.targetOwner ?? null;
  const [target, reports, owner, history, previousCases, noteAuthors] = await Promise.all([
    previewTarget(moderationCase.targetType, moderationCase.targetId, { detail: true }),
    reportsFor(moderationCase),
    ownerRecord(ownerId, moderationCase),
    historyFor(moderationCase.targetType, moderationCase.targetId, { limit: 25 }),
    ModerationCase.find({ targetType: moderationCase.targetType, targetId: moderationCase.targetId, _id: { $ne: moderationCase._id } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('status action priority riskLevel createdAt resolvedAt')
      .lean(),
    peopleById([...(moderationCase.notes ?? []).map((note) => note.author), moderationCase.assignedTo]),
  ]);
  const anonymous = ANONYMOUS_TYPES.includes(moderationCase.targetType);
  const view = toCaseView(moderationCase);
  const personName = (personId) => (personId ? (noteAuthors.get(personId)?.name ?? 'Staff member') : 'CampusX');
  return {
    case: {
      ...view,
      assignedTo: view.assignedTo ? { id: view.assignedTo, name: personName(view.assignedTo) } : null,
      notes: view.notes.map((note) => ({ ...note, authorName: personName(note.author) })),
    },
    target,
    reports,
    owner,
    history,
    previousCases: previousCases.map((item) => ({ id: item._id.toString(), status: item.status, action: item.action, priority: item.priority, riskLevel: item.riskLevel, createdAt: item.createdAt, resolvedAt: item.resolvedAt ?? null })),
    actions: allowedDecisions(moderationCase, { hasOwner: Boolean(ownerId) }),
    canRevealAuthor: anonymous && Boolean(ownerId) && hasPermission(actor, PERMISSIONS.REVEAL_ANONYMOUS_AUTHOR),
  };
}

/**
 * PATCH /admin/moderation/:id: approve · flag · restrict · remove · escalate · warn · dismiss. The
 * validator already required confirm: true and a reason where CASE_ACTIONS asks for them.
 */
export async function decideModerationCase(actor, caseId, { decision, note = '' }) {
  assertPermission(actor, PERMISSIONS.REVIEW_MODERATION);
  if (!Object.hasOwn(CASE_ACTIONS, decision)) throw ApiError.unprocessable('Please choose a valid decision.');
  const id = toObjectId(String(caseId));
  const current = id ? await ModerationCase.findById(id).select('+targetOwner').lean() : null;
  if (!current) throw ApiError.notFound('Case not found.');
  if (current.active && !allowedDecisions(current, { hasOwner: Boolean(current.targetOwner) }).includes(decision)) {
    throw ApiError.unprocessable(`“${CASE_ACTIONS[decision].label}” isn't available for this case.`);
  }
  await decideCase(actor, id.toString(), { decision, note });
  return getModerationCase(actor, id.toString());
}

/**
 * POST /admin/moderation/:id/reveal-author: who wrote the anonymous post or comment this case is about.
 * Needs REVEAL_ANONYMOUS_AUTHOR and a reason; the lookup (services/anonymousModeration.js) writes the
 * audit row. The answer is sent once (no-store) and never saved anywhere else.
 */
export async function revealAnonymousAuthor(actor, caseId, { reason }) {
  assertPermission(actor, PERMISSIONS.REVEAL_ANONYMOUS_AUTHOR);
  const id = toObjectId(String(caseId));
  const moderationCase = id ? await ModerationCase.findById(id).select('targetType targetId').lean() : null;
  if (!moderationCase) throw ApiError.notFound('Case not found.');
  if (!ANONYMOUS_TYPES.includes(moderationCase.targetType)) throw ApiError.unprocessable('This case is not about anonymous content.');
  const lookup = moderationCase.targetType === 'anonymousPost' ? getAnonymousAuthorForModeration : getAnonymousCommentAuthorForModeration;
  const { author } = await lookup(moderationCase.targetId.toString(), actor, { reason, caseId: moderationCase._id });
  const campus = author.deleted ? {} : await campusLabels(author.college, author.branch);
  return { caseId: id.toString(), targetType: moderationCase.targetType, targetId: moderationCase.targetId.toString(), author: { ...author, ...(campus.college && { collegeName: campus.college.name }), ...(campus.branch && { branchName: campus.branch.shortName }) } };
}

/** Active cases by risk level (the dashboard's risk radar and the queue tiles). */
export async function riskDistribution() {
  const rows = await ModerationCase.aggregate([{ $match: { active: true } }, { $group: { _id: '$riskLevel', count: { $sum: 1 } } }]);
  const levels = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of rows) if (row._id in levels) levels[row._id] = row.count;
  return levels;
}

/** The most urgent active cases (the dashboard's threat monitor), with previews. */
export async function topThreats(limit) {
  const rows = await ModerationCase.aggregate([{ $match: { active: true } }, rankStage, { $sort: { _rank: 1, automatedScore: -1, updatedAt: -1 } }, { $limit: limit }, { $project: { reportedBy: 0, targetOwner: 0, _rank: 0 } }]);
  const previews = await previewTargets(rows.map((row) => ({ targetType: row.targetType, targetId: row.targetId })));
  return rows.map((row) => ({ ...toCaseView(row), target: previews.get(previewKey(row.targetType, row.targetId)) ?? null }));
}

