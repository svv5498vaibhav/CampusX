import { ACCESS_DENIED_LOG_MINUTES, AUDIT_CATEGORIES, PERMISSIONS, STAFF_ROLES } from '../../config/adminConfig.js';
import { CASE_TARGET_TYPES } from '../../config/moderationConfig.js';
import ModerationAuditLog from '../../models/ModerationAuditLog.js';
import ModerationCase from '../../models/ModerationCase.js';
import { toObjectId } from '../../utils/objectId.js';
import { getCache, setCache } from '../cacheService.js';
import { writeAudit } from '../moderationService.js';
import { assertPermission, pageOf, peopleById } from './adminAccess.js';

/*
 * The admin audit trail. It reuses the Trust & Safety audit log (models/ModerationAuditLog.js, written
 * through moderationService.writeAudit) instead of keeping a second log, so moderation decisions and
 * admin actions read as one stream: staff sign-ins, refused admin requests, account status changes,
 * report handling, opportunity changes, achievement verification and anonymous-author lookups.
 *
 * Never written: passwords, tokens, secrets or emails. Never shown: anything linking an anonymous post
 * or comment to its author (see redactMetadata).
 */

const ANONYMOUS_TYPES = new Set(['anonymousPost', 'anonymousComment']);
const KNOWN_ACTIONS = new Set(Object.values(AUDIT_CATEGORIES).flat());

/** Records an action taken in the control center. `actor` is the signed-in staff member (req.user). */
export function recordAdminAction(actor, { action, targetType, targetId, previousStatus = null, newStatus = null, reason = '', metadata, caseId = null, ip }) {
  return writeAudit({ actor, action, targetType, targetId, previousStatus, newStatus, reason, metadata, caseId, ...(ip && { ip }) });
}

/** A moderator or admin signed in (POST /auth/login). `user` is the signed-in account ({ id, role }). */
export function recordStaffSignIn(user, ip) {
  if (!STAFF_ROLES.includes(user?.role)) return Promise.resolve();
  const id = String(user.id ?? user._id);
  return writeAudit({ actor: { _id: id, role: user.role }, action: 'ADMIN_LOGIN', targetType: 'user', targetId: id, ip });
}

/**
 * Someone signed in asked for an admin area their role doesn't allow. Logged at most once per person and
 * permission every few minutes, so a student refreshing /admin can't flood the log. Never throws.
 */
export async function recordAccessDenied(user, { permission, method, path, ip }) {
  try {
    const key = `admin:denied:${user._id}:${permission}`;
    if (await getCache(key)) return;
    await setCache(key, 1, ACCESS_DENIED_LOG_MINUTES * 60);
    const actor = { _id: user._id, auditRole: STAFF_ROLES.includes(user.role) ? user.role : 'student' };
    await writeAudit({ actor, action: 'ACCESS_DENIED', targetType: 'user', targetId: user._id, metadata: { permission, method, path: String(path).slice(0, 120) }, ip });
  } catch {
    // Logging must never change the 403 the request gets.
  }
}

const OPPORTUNITY_STATUS_ACTIONS = { published: 'OPPORTUNITY_PUBLISHED', closed: 'OPPORTUNITY_CLOSED', archived: 'OPPORTUNITY_ARCHIVED', draft: 'OPPORTUNITY_DRAFTED' };

/**
 * An opportunity was created, edited, published, closed, archived, moved back to drafts or deleted (the
 * Phase 8 management endpoints and the admin ones share these handlers). Field names only, never values.
 */
export function recordOpportunityChange(actor, { opportunityId, created = false, deleted = false, previousStatus = null, newStatus = null, fields = [] }, ip) {
  let action = 'OPPORTUNITY_UPDATED';
  if (created) action = 'OPPORTUNITY_CREATED';
  else if (deleted) action = 'OPPORTUNITY_DELETED';
  else if (newStatus && previousStatus && newStatus !== previousStatus) action = OPPORTUNITY_STATUS_ACTIONS[newStatus] ?? action;
  return writeAudit({ actor, action, targetType: 'opportunity', targetId: opportunityId, previousStatus, newStatus, metadata: fields.length ? { fields: fields.slice(0, 30) } : undefined, ...(ip && { ip }) });
}

// ----------------------------------------------------------------------------- reading

/**
 * Metadata as staff may see it. Phase 13 enforcement rows (warnings, restrictions) keep the content that
 * triggered them in `metadata.source`; when that content is anonymous only its kind is kept. Values are
 * copied, never the stored object.
 */
export function redactMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const copy = JSON.parse(JSON.stringify(metadata));
  if (copy.source && ANONYMOUS_TYPES.has(copy.source.targetType)) copy.source = { targetType: copy.source.targetType, hidden: true };
  return copy;
}

/*
 * Anonymity and the audit log. When anonymous content is held or removed, Phase 13 records a violation for
 * its (internal) author: a WARN_USER / TEMPORARY_RESTRICTION row about that student, written in the same
 * moment as the decision about the post, pointing at the post (metadata.source) or its case. Shown as it
 * is, that row would tell staff who wrote the post. So such rows ("anonymous-linked"):
 *   - never appear in a student's own history (user detail, or the log filtered by that student), and
 *   - in the full log, keep the action and time but hide which student (targetId) and what triggered it.
 * The student's trust counts still include them (counts only). The audited reveal is the only way to
 * learn an anonymous author.
 */

/** Ids of moderation cases about anonymous content among `caseIds`. */
async function anonymousCaseIds(caseIds) {
  if (!caseIds.length) return new Set();
  const cases = await ModerationCase.find({ _id: { $in: caseIds }, targetType: { $in: [...ANONYMOUS_TYPES] } }).select('_id').lean();
  return new Set(cases.map((item) => item._id.toString()));
}

const isAnonymousLinked = (row, anonymousCases) =>
  row.targetType === 'user' && (ANONYMOUS_TYPES.has(row.metadata?.source?.targetType) || Boolean(row.case && anonymousCases.has(row.case.toString())));

/** A query condition leaving out the anonymous-linked rows about one student. */
async function excludeAnonymousLinked(userId) {
  const cases = await ModerationCase.find({ targetOwner: userId, targetType: { $in: [...ANONYMOUS_TYPES] } }).select('_id').lean();
  return {
    $nor: [
      { targetType: 'user', 'metadata.source.targetType': { $in: [...ANONYMOUS_TYPES] } },
      ...(cases.length ? [{ targetType: 'user', case: { $in: cases.map((item) => item._id) } }] : []),
    ],
  };
}

const categoryOf = (action) => Object.entries(AUDIT_CATEGORIES).find(([, actions]) => actions.includes(action))?.[0] ?? 'content';

/** One audit row for staff (anonymous-linked rows come without the student and the trigger). */
export function toAuditView(row, { people, anonymousCases = new Set() }) {
  const hidden = isAnonymousLinked(row, anonymousCases);
  return {
    id: row._id.toString(),
    action: row.action,
    category: categoryOf(row.action),
    actorRole: row.actorRole,
    actor: row.actor ? (people.get(row.actor.toString()) ?? { id: row.actor.toString(), name: 'Deleted account' }) : null,
    targetType: row.targetType,
    targetId: hidden ? null : row.targetId.toString(),
    previousStatus: row.previousStatus ?? null,
    newStatus: row.newStatus ?? null,
    reason: row.reason ?? '',
    metadata: redactMetadata(row.metadata),
    caseId: hidden ? null : (row.case?.toString() ?? null),
    anonymityProtected: hidden,
    ip: row.ip ?? null,
    createdAt: row.createdAt,
  };
}

/** Actor names and the anonymous-case set for a page of rows, then the views. */
async function present(rows) {
  const caseIds = rows.filter((row) => row.targetType === 'user' && row.case).map((row) => row.case);
  const [people, anonymousCases] = await Promise.all([peopleById(rows.map((row) => row.actor)), anonymousCaseIds(caseIds)]);
  const actors = new Map([...people].map(([id, person]) => [id, { id, name: person.name, role: person.role, avatarUrl: person.avatarUrl }]));
  return rows.map((row) => toAuditView(row, { people: actors, anonymousCases }));
}

/** Audit rows about one target, newest first (case and user detail pages). */
export async function historyFor(targetType, targetId, { limit = 25 } = {}) {
  const id = toObjectId(String(targetId));
  if (!id) return [];
  const filter = { targetType, targetId: id, ...(targetType === 'user' && (await excludeAnonymousLinked(id))) };
  const rows = await ModerationAuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  return present(rows);
}

/** The latest rows (dashboard "audit stream"). */
export async function latestAudit(limit) {
  const rows = await ModerationAuditLog.find({}).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  return present(rows);
}

function categoryFilter(category) {
  if (!category) return null;
  if (category === 'content') return { action: { $nin: [...KNOWN_ACTIONS] } };
  return { action: { $in: [...AUDIT_CATEGORIES[category]] } };
}

/** GET /admin/audit-logs: filters, newest first, paged. Admins only (VIEW_AUDIT_LOGS). */
export async function listAuditLogs(actor, { category, actorRole, action, targetType, targetId, actorId, from, to, page = 1, limit = 25 } = {}) {
  assertPermission(actor, PERMISSIONS.VIEW_AUDIT_LOGS);
  const conditions = [];
  const byCategory = categoryFilter(category);
  if (byCategory) conditions.push(byCategory);
  if (actorRole) conditions.push({ actorRole });
  if (action) conditions.push({ action });
  if (targetType && CASE_TARGET_TYPES.includes(targetType)) conditions.push({ targetType });
  if (targetId) {
    conditions.push({ targetId: toObjectId(targetId) });
    // Filtering by a student must not surface the rows that would tie them to anonymous content.
    conditions.push(await excludeAnonymousLinked(toObjectId(targetId)));
  }
  if (actorId) conditions.push({ actor: toObjectId(actorId) });
  if (from || to) conditions.push({ createdAt: { ...(from && { $gte: from }), ...(to && { $lte: to }) } });
  const filter = conditions.length ? { $and: conditions } : {};
  const [rows, total] = await Promise.all([
    ModerationAuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ModerationAuditLog.countDocuments(filter),
  ]);
  return { logs: await present(rows), pagination: pageOf(page, limit, total) };
}
