import { CASE_DECISIONS, CASE_RULES, ENFORCEMENT, MODERATION_ACTIONS as A } from '../config/moderationConfig.js';
import ModerationCase from '../models/ModerationCase.js';
import ApiError from '../utils/ApiError.js';
import { createKeyedLock } from '../utils/keyedQueue.js';
import { toObjectId } from '../utils/objectId.js';
import { TARGETS, applyModerationAction, recordViolation, restrictUser, warnUser, writeAudit } from './moderationService.js';
import { closeReportsFor } from './reportService.js';

/*
 * The moderation team's side of cases, for CampusX moderators and admins only (the routes check the role;
 * these functions check it again). The Phase 15 admin control center (services/admin/moderationService.js)
 * decides cases through decideCase() too.
 *
 * Case responses never include who reported something or who wrote anonymous content. Revealing an
 * anonymous author stays with the audited lookup in services/anonymousModeration.js.
 */

const STAFF = ['admin', 'moderator'];
const assertStaff = (staff) => {
  if (!STAFF.includes(staff?.role)) throw ApiError.forbidden();
};

export const toCaseView = (moderationCase) => ({
  id: moderationCase._id.toString(),
  targetType: moderationCase.targetType,
  targetId: moderationCase.targetId.toString(),
  sources: moderationCase.sources,
  reportCount: moderationCase.reportCount,
  automatedScore: moderationCase.automatedScore,
  riskLevel: moderationCase.riskLevel,
  flags: moderationCase.flags,
  reasons: moderationCase.reasons,
  priority: moderationCase.priority,
  status: moderationCase.status,
  action: moderationCase.action,
  assignedTo: moderationCase.assignedTo?.toString() ?? null,
  notes: (moderationCase.notes ?? []).map((note) => ({ text: note.text, author: note.author?.toString() ?? null, createdAt: note.createdAt })),
  createdAt: moderationCase.createdAt,
  updatedAt: moderationCase.updatedAt,
  resolvedAt: moderationCase.resolvedAt ?? null,
});

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

/** Cases by status (open by default), most urgent first. */
export async function listCases(staff, { status = 'open', page = 1, limit = CASE_RULES.pageSize.default } = {}) {
  assertStaff(staff);
  const filter = status === 'all' ? {} : { status };
  const [cases, total] = await Promise.all([
    ModerationCase.aggregate([
      { $match: filter },
      { $addFields: { _rank: { $switch: { branches: Object.entries(PRIORITY_ORDER).map(([priority, rank]) => ({ case: { $eq: ['$priority', priority] }, then: rank })), default: 4 } } } },
      { $sort: { _rank: 1, updatedAt: -1, _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      // Never sent: reporters and the content owner (anonymous authors included).
      { $project: { reportedBy: 0, targetOwner: 0, _rank: 0 } },
    ]),
    ModerationCase.countDocuments(filter),
  ]);
  return { cases: cases.map(toCaseView), pagination: { page, limit, total, hasMore: page * limit < total } };
}

export async function getCase(staff, caseId) {
  assertStaff(staff);
  const id = toObjectId(String(caseId));
  const moderationCase = id ? await ModerationCase.findById(id).lean() : null;
  if (!moderationCase) throw ApiError.notFound('Case not found.');
  return { case: toCaseView(moderationCase) };
}

// One decision per case at a time: a second moderator acting at the same moment sees the case closed.
const caseLock = createKeyedLock();

/**
 * A moderator decides a case: approve · flag · restrict · remove · warn · dismiss · escalate. Content
 * changes go through applyModerationAction (audit log, notifications, rankings); reports are closed and
 * the reporters told the outcome; restricting or removing counts as a violation for the owner. Flagging
 * and escalating keep the case open (reviewing).
 */
export function decideCase(staff, caseId, decision) {
  return caseLock(String(caseId), () => applyDecision(staff, caseId, decision));
}

async function applyDecision(staff, caseId, { decision, note = '' }) {
  assertStaff(staff);
  const id = toObjectId(String(caseId));
  const moderationCase = id ? await ModerationCase.findById(id).select('+targetOwner') : null;
  if (!moderationCase) throw ApiError.notFound('Case not found.');
  if (!moderationCase.active) throw ApiError.conflict('This case is already closed.');
  const action = CASE_DECISIONS[decision];
  if (!action) throw ApiError.unprocessable('Please choose a valid decision.');

  const { targetType, targetId } = moderationCase;
  const spec = TARGETS[targetType];
  const ownerId = moderationCase.targetOwner ?? null;
  const context = { actor: staff, reason: note, caseId: moderationCase._id };
  let outcome = 'resolved';

  switch (decision) {
    case 'approve':
      if (!spec.statusless) await applyModerationAction({ targetType, targetId, action: A.ALLOW, ...context });
      outcome = 'dismissed';
      break;
    case 'dismiss':
      // Nothing wrong: clear a flag, but don't touch content a moderator held or removed.
      if (!spec.statusless) {
        const current = await spec.model.findById(targetId).select('moderationStatus').lean();
        if (current?.moderationStatus === 'flagged') await applyModerationAction({ targetType, targetId, action: A.ALLOW, notify: false, ...context });
      }
      outcome = 'dismissed';
      break;
    case 'restrict':
      if (targetType === 'user') {
        await restrictUser(targetId, ENFORCEMENT.ladder.find((rung) => rung.hours)?.hours ?? 24, context);
      } else if (spec.statusless) {
        throw ApiError.unprocessable('Opportunities are restricted from the opportunity management page.');
      } else {
        const { changed } = await applyModerationAction({ targetType, targetId, action: A.HOLD, ...context });
        if (changed && ownerId) await recordViolation(ownerId, { targetType, targetId, actor: staff, caseId: moderationCase._id });
      }
      break;
    case 'remove':
      if (spec.statusless) throw ApiError.unprocessable(targetType === 'user' ? 'Students can’t be removed from here. Restrict them or escalate the case.' : 'Opportunities are archived from the opportunity management page.');
      {
        const { changed } = await applyModerationAction({ targetType, targetId, action: A.REMOVE, ...context });
        if (changed && ownerId) await recordViolation(ownerId, { targetType, targetId, actor: staff, caseId: moderationCase._id });
      }
      break;
    case 'warn':
      if (!ownerId) throw ApiError.unprocessable('There is nobody to warn for this case.');
      await warnUser(ownerId, context);
      break;
    case 'flag': {
      // Live but out of search and rankings while the case stays open for a closer look.
      if (spec.statusless) throw ApiError.unprocessable('Only content can be flagged.');
      const { changed, previousStatus } = await applyModerationAction({ targetType, targetId, action: A.FLAG, notify: false, ...context });
      if (!changed) throw ApiError.conflict(previousStatus === 'flagged' ? 'This content is already flagged.' : `This content is ${previousStatus}; flagging would not change it.`);
      moderationCase.status = 'reviewing';
      moderationCase.action = A.FLAG;
      moderationCase.assignedTo = staff._id;
      if (note) moderationCase.notes.push({ author: staff._id, text: note });
      await moderationCase.save();
      return { case: toCaseView(moderationCase.toObject()) };
    }
    case 'escalate':
      if (moderationCase.action === A.ESCALATE && moderationCase.priority === 'critical') throw ApiError.conflict('This case is already escalated.');
      moderationCase.status = 'reviewing';
      moderationCase.priority = 'critical';
      moderationCase.action = A.ESCALATE;
      moderationCase.assignedTo = staff._id;
      if (note) moderationCase.notes.push({ author: staff._id, text: note });
      await moderationCase.save();
      await writeAudit({ actor: staff, action: A.ESCALATE, targetType, targetId, reason: note, caseId: moderationCase._id });
      return { case: toCaseView(moderationCase.toObject()) };
    default:
      throw ApiError.unprocessable('Please choose a valid decision.');
  }

  moderationCase.status = decision === 'dismiss' || decision === 'approve' ? 'dismissed' : 'resolved';
  moderationCase.active = false;
  moderationCase.action = action === 'DISMISS' ? A.ALLOW : action;
  moderationCase.assignedTo = staff._id;
  moderationCase.resolvedAt = new Date();
  if (note) moderationCase.notes.push({ author: staff._id, text: note });
  await moderationCase.save();
  await writeAudit({ actor: staff, action: `CASE_${moderationCase.status.toUpperCase()}`, targetType, targetId, reason: note, metadata: { decision }, caseId: moderationCase._id });
  await closeReportsFor(targetType, targetId, outcome);
  return { case: toCaseView(moderationCase.toObject()) };
}
