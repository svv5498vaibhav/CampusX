import { COMMUNITY_ACTIONS, CONTENT_ACTIONS, CONTENT_TYPES, PERMISSIONS } from '../../config/adminConfig.js';
import Achievement from '../../models/Achievement.js';
import AnonymousPost from '../../models/AnonymousPost.js';
import Comment from '../../models/Comment.js';
import Community from '../../models/Community.js';
import ModerationCase from '../../models/ModerationCase.js';
import Post from '../../models/Post.js';
import Project from '../../models/Project.js';
import Report from '../../models/Report.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/objectId.js';
import { reviewAchievement } from '../achievementService.js';
import { decideCase } from '../moderationCaseService.js';
import { applyModerationAction, recordViolation } from '../moderationService.js';
import { assertPermission, campusLabels, escapeRegex, pageOf, peopleById } from './adminAccess.js';
import { previewKey, previewTargets } from './adminTargets.js';
import { recordAdminAction } from './auditService.js';

/*
 * Content and community management. Lists read each feature's own collection (no copies); every change
 * goes through Trust & Safety: the open moderation case when there is one (so its reports close and the
 * reporters hear back), otherwise moderationService.applyModerationAction (audit log, owner notice,
 * rankings, search). Achievement verification reuses Phase 7's reviewAchievement.
 *
 * Anonymous posts are listed without any author: the `author` field is never read here, and search
 * never matches by author.
 */

const LIVE_STATUSES = ['approved', 'flagged'];
const STATUSES = ['pending', 'approved', 'flagged', 'restricted', 'removed'];

const SPECS = Object.freeze({
  post: { model: Post, label: 'post', search: ['content'], likes: true, stats: { comments: '$commentsCount' } },
  comment: { model: Comment, label: 'comment', search: ['content'], likes: false, stats: {} },
  project: { model: Project, label: 'project', search: ['title', 'shortDescription', 'description', 'techStack'], likes: true, stats: { views: '$views' } },
  achievement: { model: Achievement, label: 'achievement', search: ['title', 'description', 'organization', 'eventName'], likes: false, stats: {}, extra: { verificationStatus: '$verificationStatus' } },
  anonymousPost: { model: AnonymousPost, label: 'anonymous post', search: ['title', 'content'], likes: true, stats: { comments: '$commentsCount' }, extra: { postStatus: '$status' } },
});

const statusMatch = (status) => (status && status !== 'all' ? { moderationStatus: status === 'approved' ? { $in: ['approved', null] } : status } : {});
const searchMatch = (fields, search) => {
  if (!search) return {};
  const pattern = new RegExp(escapeRegex(search), 'i');
  return { $or: fields.map((field) => ({ [field]: pattern })) };
};

/** Open reports and active cases for a page of items of one kind. */
async function caseInfo(targetType, ids) {
  if (!ids.length) return { reports: new Map(), cases: new Map() };
  const [reports, cases] = await Promise.all([
    Report.aggregate([{ $match: { targetType, targetId: { $in: ids }, active: true } }, { $group: { _id: '$targetId', count: { $sum: 1 } } }]),
    ModerationCase.find({ targetType, targetId: { $in: ids }, active: true }).select('targetId priority riskLevel').lean(),
  ]);
  return {
    reports: new Map(reports.map((row) => [row._id.toString(), row.count])),
    cases: new Map(cases.map((row) => [row.targetId.toString(), { id: row._id.toString(), priority: row.priority, riskLevel: row.riskLevel }])),
  };
}

/** What can still be done to an item with this moderation status. */
function contentActions(type, status, extra = {}) {
  const current = status ?? 'approved';
  const actions = [];
  if (current !== 'approved') actions.push('approve');
  if (current === 'approved') actions.push('flag');
  if (!['restricted', 'removed'].includes(current)) actions.push('restrict');
  if (current !== 'removed') actions.push('remove');
  if (type === 'achievement' && extra.verificationStatus === 'pending') actions.push('verify', 'reject');
  return actions;
}

async function contentPage(type, match, { page, limit }) {
  const spec = SPECS[type];
  const projection = {
    moderationStatus: 1,
    createdAt: 1,
    ...spec.stats,
    ...spec.extra,
    ...(spec.likes && { likes: { $size: { $ifNull: ['$likes', []] } } }),
  };
  const [rows, total] = await Promise.all([
    // Newest first through the _id index (ObjectIds are time-ordered).
    spec.model.aggregate([{ $match: match }, { $sort: { _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: projection }]),
    spec.model.countDocuments(match),
  ]);
  const ids = rows.map((row) => row._id);
  const [previews, info] = await Promise.all([previewTargets(ids.map((id) => ({ targetType: type, targetId: id }))), caseInfo(type, ids)]);
  const items = rows.map((row) => {
    const id = row._id.toString();
    const preview = previews.get(previewKey(type, id));
    const extra = Object.fromEntries(Object.keys(spec.extra ?? {}).map((key) => [key, row[key] ?? null]));
    return {
      id,
      type,
      title: preview?.title ?? null,
      excerpt: preview?.text ?? '',
      media: preview?.media ?? [],
      link: preview?.link ?? null,
      author: preview?.author ?? null,
      moderationStatus: row.moderationStatus ?? 'approved',
      createdAt: row.createdAt,
      stats: { ...Object.fromEntries(Object.keys(spec.stats).map((key) => [key, row[key] ?? 0])), ...(spec.likes && { likes: row.likes ?? 0 }), openReports: info.reports.get(id) ?? 0 },
      extra,
      activeCase: info.cases.get(id) ?? null,
      actions: contentActions(type, row.moderationStatus, extra),
    };
  });
  return { items, pagination: pageOf(page, limit, total) };
}

/** GET /admin/content: one kind of content at a time (a tab), filtered by status and text. */
export async function listContent(actor, { type = 'post', status = 'all', verification, search, page = 1, limit = 20 } = {}) {
  assertPermission(actor, PERMISSIONS.MANAGE_CONTENT);
  const spec = Object.hasOwn(SPECS, type) ? SPECS[type] : null;
  if (!spec) throw ApiError.unprocessable('Please choose a content type.');
  const conditions = [statusMatch(status), searchMatch(spec.search, search)];
  if (type === 'achievement' && verification) conditions.push({ verificationStatus: verification });
  const match = { $and: conditions.filter((condition) => Object.keys(condition).length) };
  if (!match.$and.length) delete match.$and;
  const [result, byStatus] = await Promise.all([
    contentPage(type, match, { page, limit }),
    spec.model.aggregate([{ $group: { _id: { $ifNull: ['$moderationStatus', 'approved'] }, count: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(STATUSES.map((value) => [value, 0]));
  for (const row of byStatus) counts[row._id] = row.count;
  counts.all = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { type, types: Object.entries(CONTENT_TYPES).map(([id, config]) => ({ id, label: config.label })), ...result, counts };
}

async function contentItem(type, id) {
  const { items } = await contentPage(type, { _id: id }, { page: 1, limit: 1 });
  return items[0] ?? null;
}

/**
 * Applies a moderation decision to content or a community: through its open case when there is one,
 * otherwise straight through applyModerationAction. Restricting or removing counts as a violation for
 * the owner (as when a case is decided). 409 when nothing would change.
 */
async function applyDecision(actor, targetType, targetId, { decision, moderation }, reason, label) {
  const openCase = await ModerationCase.findOne({ targetType, targetId, active: true }).select('_id').lean();
  if (openCase) {
    await decideCase(actor, openCase._id.toString(), { decision, note: reason });
    return;
  }
  const { changed, previousStatus, ownerId } = await applyModerationAction({ targetType, targetId, action: moderation, actor, reason });
  if (!changed) throw ApiError.conflict(`This ${label} is already ${previousStatus}.`);
  if (['HOLD', 'REMOVE'].includes(moderation) && ownerId) await recordViolation(ownerId, { targetType, targetId, actor });
}

/** PATCH /admin/content/:type/:id: approve · flag · restrict · remove, or verify / reject an achievement's proof. */
export async function actOnContent(actor, type, contentId, { action, reason = '' }) {
  assertPermission(actor, PERMISSIONS.MANAGE_CONTENT);
  const spec = Object.hasOwn(SPECS, type) ? SPECS[type] : null;
  const rule = Object.hasOwn(CONTENT_ACTIONS, action) ? CONTENT_ACTIONS[action] : null;
  if (!spec || !rule) throw ApiError.unprocessable('Please choose a valid action.');
  const id = toObjectId(String(contentId));
  const exists = id ? await spec.model.exists({ _id: id }) : null;
  if (!exists) throw ApiError.notFound(`That ${spec.label} no longer exists.`);

  if (rule.achievementOnly) {
    if (type !== 'achievement') throw ApiError.unprocessable('Only achievements have proof to verify.');
    await reviewAchievement(id.toString(), actor, { status: rule.verification, note: reason });
    await recordAdminAction(actor, { action: rule.verification === 'verified' ? 'ACHIEVEMENT_VERIFIED' : 'ACHIEVEMENT_REJECTED', targetType: 'achievement', targetId: id, previousStatus: 'pending', newStatus: rule.verification, reason });
  } else {
    await applyDecision(actor, type, id, rule, reason, spec.label);
  }
  return { item: await contentItem(type, id) };
}

// ----------------------------------------------------------------------------- communities

const COMMUNITY_PROJECTION = { name: 1, slug: 1, type: 1, visibility: 1, official: 1, college: 1, branch: 1, semester: 1, createdBy: 1, memberCount: 1, status: 1, moderationStatus: 1, createdAt: 1, iconUrl: 1 };

function communityActions(status) {
  const current = status ?? 'approved';
  const actions = [];
  if (!['restricted', 'removed'].includes(current)) actions.push('suspend');
  if (current !== 'approved') actions.push('restore');
  if (current !== 'removed') actions.push('remove');
  return actions;
}

async function communityPage(match, { page, limit }) {
  const [rows, total] = await Promise.all([
    Community.aggregate([{ $match: match }, { $sort: { _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: COMMUNITY_PROJECTION }]),
    Community.countDocuments(match),
  ]);
  const ids = rows.map((row) => row._id);
  const [owners, info] = await Promise.all([peopleById(rows.map((row) => row.createdBy)), caseInfo('community', ids)]);
  const communities = await Promise.all(
    rows.map(async (row) => {
      const id = row._id.toString();
      return {
        id,
        name: row.name,
        slug: row.slug,
        type: row.type,
        visibility: row.visibility,
        official: Boolean(row.official),
        iconUrl: row.iconUrl ?? null,
        ...(await campusLabels(row.college, row.branch)),
        semester: row.semester ?? null,
        owner: row.createdBy ? (owners.get(row.createdBy.toString()) ?? null) : null,
        memberCount: row.memberCount ?? 0,
        status: row.status,
        moderationStatus: row.moderationStatus ?? 'approved',
        openReports: info.reports.get(id) ?? 0,
        activeCase: info.cases.get(id) ?? null,
        createdAt: row.createdAt,
        link: `/communities/${id}`,
        actions: communityActions(row.moderationStatus),
      };
    }),
  );
  return { communities, pagination: pageOf(page, limit, total) };
}

/** GET /admin/communities: search by name or tag, filter by type, status and moderation status. */
export async function listCommunities(actor, { search, type, status, moderation, page = 1, limit = 20 } = {}) {
  assertPermission(actor, PERMISSIONS.MANAGE_COMMUNITIES);
  const conditions = [];
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    conditions.push({ $or: [{ name: pattern }, { description: pattern }, { tags: pattern }] });
  }
  if (type) conditions.push({ type });
  if (status) conditions.push({ status });
  if (moderation) conditions.push(statusMatch(moderation));
  const match = conditions.length ? { $and: conditions } : {};
  const [result, byModeration] = await Promise.all([
    communityPage(match, { page, limit }),
    Community.aggregate([{ $group: { _id: { $ifNull: ['$moderationStatus', 'approved'] }, count: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(STATUSES.map((value) => [value, 0]));
  for (const row of byModeration) counts[row._id] = row.count;
  counts.all = Object.values(counts).reduce((sum, value) => sum + value, 0);
  counts.live = LIVE_STATUSES.reduce((sum, value) => sum + counts[value], 0);
  return { ...result, counts };
}

/** PATCH /admin/communities/:id: suspend (restricted: hidden from non-members and search) · restore · remove. */
export async function actOnCommunity(actor, communityId, { action, reason = '' }) {
  assertPermission(actor, PERMISSIONS.MANAGE_COMMUNITIES);
  const rule = Object.hasOwn(COMMUNITY_ACTIONS, action) ? COMMUNITY_ACTIONS[action] : null;
  if (!rule) throw ApiError.unprocessable('Please choose a valid action.');
  const id = toObjectId(String(communityId));
  const exists = id ? await Community.exists({ _id: id }) : null;
  if (!exists) throw ApiError.notFound('Community not found.');
  await applyDecision(actor, 'community', id, rule, reason, 'community');
  const { communities } = await communityPage({ _id: id }, { page: 1, limit: 1 });
  return { community: communities[0] ?? null };
}
