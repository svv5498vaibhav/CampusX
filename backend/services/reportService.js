import { ENFORCEMENT, LEGACY_REPORT_REASONS, MODERATION_ACTIONS as A, REPORT_REASONS, REPORT_RULES, REPORT_TARGETS } from '../config/moderationConfig.js';
import AnonymousComment from '../models/AnonymousComment.js';
import AnonymousPost from '../models/AnonymousPost.js';
import Comment from '../models/Comment.js';
import Community from '../models/Community.js';
import Opportunity from '../models/Opportunity.js';
import Post from '../models/Post.js';
import Project from '../models/Project.js';
import Report from '../models/Report.js';
import User, { ACCOUNT_STATUSES } from '../models/User.js';
import Achievement from '../models/Achievement.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { toObjectId } from '../utils/objectId.js';
import { loadReadableComment } from './anonymousCommentService.js';
import { loadReadablePost } from './anonymousService.js';
import { getCache, setCache } from './cacheService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { scopeAllows, viewerMemberships } from './communityAccess.js';
import { adjustRisk, applyModerationAction, createModerationCase, loadTrust } from './moderationService.js';
import { canView } from './opportunityAccess.js';
import { visibleTo } from './postService.js';
import { projectVisibleTo } from './projectService.js';
import { showcaseVisibleTo } from './showcaseAccess.js';

/*
 * Reports about anything on CampusX, stored one way (models/Report.js). The reporter is always the
 * signed-in student (`viewer`, req.user) and is never shown to anyone else. Students can report what they
 * can see (never their own things), see their own reports, and withdraw a pending one; resolving and
 * dismissing are for CampusX moderators (services/moderationCaseService.js, and one report at a time in
 * the admin control center, services/admin/reportService.js).
 *
 * Each report joins the target's moderation case. Reports from several different students flag the
 * content for review, but reports alone never hide anything: a group can't take a post down by reporting
 * it together. Students who report a lot, or keep reporting the same person, are noted internally and
 * reporting pauses for them for a while.
 */

const REASONS = new Map(REPORT_REASONS.map((reason) => [reason.id, reason]));
const label = (targetType) => REPORT_TARGETS[targetType]?.label ?? 'item';
const notFoundError = (targetType, message) => ApiError.notFound(message ?? `We couldn't find that ${label(targetType)}.`);
const oid = (id) => toObjectId(String(id));

// ----------------------------------------------------------------------------- what is being reported

/**
 * The reported thing, if the reporter can see it: { ownerId, hasStatus }. Anything they can't see answers
 * "not found", exactly like a missing one, so reports can't be used to probe private content.
 */
async function resolveTarget(targetType, targetId, viewer, notFoundMessage) {
  const notFound = () => notFoundError(targetType, notFoundMessage);
  const id = oid(targetId);
  if (!id) throw notFound();
  switch (targetType) {
    case 'post': {
      const post = await Post.findOne({ $and: [{ _id: id }, await visibleTo(viewer)] }).select('author').lean();
      if (!post) throw notFound();
      return { ownerId: post.author, hasStatus: true };
    }
    case 'comment': {
      const comment = await Comment.findOne({ _id: id, moderationStatus: { $in: ['approved', 'flagged', null] } }).select('author post').lean();
      if (!comment || !(await Post.exists({ $and: [{ _id: comment.post }, await visibleTo(viewer)] }))) throw notFound();
      return { ownerId: comment.author, hasStatus: true };
    }
    case 'project': {
      const project = await Project.findOne({ $and: [{ _id: id }, projectVisibleTo(viewer)] }).select('owner').lean();
      if (!project) throw notFound();
      return { ownerId: project.owner, hasStatus: true };
    }
    case 'achievement': {
      const achievement = await Achievement.findOne({ $and: [{ _id: id }, showcaseVisibleTo(viewer)] }).select('owner').lean();
      if (!achievement) throw notFound();
      return { ownerId: achievement.owner, hasStatus: true };
    }
    case 'community': {
      const community = await Community.findById(id).select('createdBy status visibility college branch semester moderationStatus').lean();
      const member = community && (await viewerMemberships(viewer)).has(id.toString());
      if (!community || !(member || (community.status === 'active' && scopeAllows(community, viewer)))) throw notFound();
      return { ownerId: community.createdBy ?? null, hasStatus: true };
    }
    case 'opportunity': {
      const opportunity = await Opportunity.findById(id).select('createdBy status visibility eligibleColleges').lean();
      if (!opportunity || !canView(opportunity, viewer)) throw notFound();
      return { ownerId: opportunity.createdBy ?? null, hasStatus: false };
    }
    case 'user': {
      const user = await User.findOne({ _id: id, status: ACCOUNT_STATUSES.ACTIVE, onboardingCompleted: true }).select('_id').lean();
      if (!user) throw notFound();
      return { ownerId: user._id, hasStatus: false };
    }
    case 'anonymousPost': {
      const post = await loadReadablePost(id.toString(), viewer, '+author').catch(() => null);
      if (!post) throw notFound();
      return { ownerId: post.author, hasStatus: true, counter: AnonymousPost };
    }
    case 'anonymousComment': {
      const comment = await loadReadableComment(id.toString(), viewer).catch(() => null);
      if (!comment) throw notFound();
      return { ownerId: comment.author, hasStatus: true, counter: AnonymousComment };
    }
    default:
      throw ApiError.unprocessable('That kind of content can’t be reported.');
  }
}

// ----------------------------------------------------------------------------- report abuse

const abuseKey = (userId) => `moderation:report-abuse:${userId}`;

/**
 * Reporting a lot in a day, or many reports about the same person, is noted as suspicious (internal risk,
 * lower priority); past REPORT_RULES.abuse.limitAfter in a day reporting pauses. Returns `suspicious`.
 */
async function checkReportingBehaviour(viewer, ownerId) {
  const rules = REPORT_RULES.abuse;
  const windowStart = new Date(Date.now() - rules.windowHours * 60 * 60 * 1000);
  const [recentCount, sameOwnerCount, { trust }] = await Promise.all([
    Report.countDocuments({ reporter: viewer._id, createdAt: { $gte: windowStart } }),
    ownerId ? Report.countDocuments({ reporter: viewer._id, targetOwner: ownerId, createdAt: { $gte: windowStart } }) : 0,
    loadTrust(viewer._id),
  ]);
  // Students whose reports keep being dismissed get a smaller daily allowance.
  const limit = (trust.reportsDismissed ?? 0) >= rules.dismissedLimit ? rules.suspiciousAfter : rules.limitAfter;
  if (recentCount >= limit) {
    throw new ApiError(429, "You've sent a lot of reports recently. Please try again later. Our team is reviewing what you already sent.");
  }
  const suspicious = recentCount >= rules.suspiciousAfter || sameOwnerCount >= rules.sameOwnerAfter;
  if (suspicious && !(await getCache(abuseKey(viewer._id)))) {
    // Noted once a day, not on every report.
    await setCache(abuseKey(viewer._id), 1, rules.windowHours * 60 * 60);
    await adjustRisk(viewer._id, ENFORCEMENT.risk.suspiciousReporting, 'suspicious_reporting');
  }
  return suspicious;
}

// ----------------------------------------------------------------------------- student actions

/** What a student sees about their own report. Never the priority, the case or anything internal. */
const toReportView = (report) => ({
  id: report._id.toString(),
  targetType: report.targetType,
  targetId: report.targetId.toString(),
  reason: report.reason,
  reasonLabel: REASONS.get(report.reason)?.label ?? report.reason,
  description: report.description ?? '',
  status: report.status,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
  resolvedAt: report.resolvedAt ?? null,
});

/**
 * Files a report. `messages` lets the older report endpoints keep their exact wording.
 * Returns { report }.
 */
export async function createReport(viewer, { targetType, targetId, reason, description = '' }, { messages = {} } = {}) {
  if (!REPORT_TARGETS[targetType]?.reasons.includes(reason)) {
    throw ApiError.unprocessable('Please choose a reason from the list.', [{ field: 'reason', message: 'Please choose a reason from the list.' }]);
  }
  const target = await resolveTarget(targetType, targetId, viewer, messages.notFound);
  if (target.ownerId && String(target.ownerId) === viewer.id) {
    throw ApiError.badRequest(messages.own ?? (targetType === 'user' ? "You can't report yourself." : `You can't report your own ${label(targetType)}.`));
  }
  const duplicate = messages.duplicate ?? `You've already reported this ${label(targetType)}. Our team will take a look.`;
  const filter = { reporter: viewer._id, targetType, targetId: oid(targetId), active: true };
  if (await Report.exists(filter)) throw ApiError.conflict(duplicate);
  const suspicious = await checkReportingBehaviour(viewer, target.ownerId);

  const priority = suspicious ? 'low' : (REASONS.get(reason)?.priority ?? 'low');
  let report;
  try {
    report = await Report.create({ reporter: viewer._id, targetType, targetId: oid(targetId), targetOwner: target.ownerId ?? null, reason, description, priority, suspicious });
  } catch (error) {
    // Two reports sent at the same moment: the unique index lets only one through.
    if (error?.code === 11000) throw ApiError.conflict(duplicate);
    throw error;
  }

  try {
    const moderationCase = await createModerationCase({
      targetType,
      targetId,
      ownerId: target.ownerId,
      source: 'report',
      reporterId: viewer._id,
      priority,
      flags: [`reported_${reason}`],
      reasons: [`Reported by a student: ${REASONS.get(reason)?.label ?? reason}`],
      priorityBumpAfter: REPORT_RULES.priorityBumpAfter,
    });
    await Report.updateOne({ _id: report._id }, { $set: { case: moderationCase?._id ?? null } }, { timestamps: false });
    await User.updateOne({ _id: viewer._id }, { $inc: { 'moderation.reportsFiled': 1 } }, { timestamps: false });
    if (target.counter) await target.counter.updateOne({ _id: oid(targetId) }, { $inc: { reportsCount: 1 } }, { timestamps: false });

    // Several different students: flag it for review (it stays visible).
    if (target.hasStatus) {
      const reporters = await Report.distinct('reporter', { targetType, targetId: oid(targetId), active: true });
      if (reporters.length >= REPORT_RULES.flagAfterReporters) {
        await applyModerationAction({ targetType, targetId, action: A.FLAG, reason: `Reported by ${reporters.length} students`, caseId: moderationCase?._id ?? null, onlyStricter: true });
      }
    }
  } catch (error) {
    // The report itself is saved; the case can be rebuilt from it.
    logger.warn(`Reports: follow-up for a new report failed (${error?.message ?? error})`);
  }
  // Signed-in staff see it arrive (never who sent it, or who it is about).
  emitCampusEvent(CAMPUS_EVENTS.REPORT_CREATED, { reportId: report._id.toString(), targetType, targetId: String(targetId), reason, priority });
  return { report: toReportView(report) };
}

/**
 * The report endpoints from earlier phases (POST /posts/:id/report, /opportunities/:id/report,
 * /anonymous/posts/:id/report, /anonymous/comments/:id/report) keep working with their own reason lists
 * and wording; their reports are stored like every other report now.
 */
export function createLegacyReport(viewer, { family, targetType, targetId, reason, details = '' }, messages = {}) {
  return createReport(viewer, { targetType, targetId, reason: LEGACY_REPORT_REASONS[family]?.[reason] ?? 'other', description: details }, { messages });
}

/** The student's own reports, newest first. */
export async function listMyReports(viewer, { page = 1, limit = REPORT_RULES.pageSize.default } = {}) {
  const filter = { reporter: viewer._id };
  const [reports, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Report.countDocuments(filter),
  ]);
  return { reports: reports.map(toReportView), pagination: { page, limit, total, hasMore: page * limit < total } };
}

/** Takes back one of the student's own reports while it is still pending. */
export async function withdrawReport(viewer, reportId) {
  const id = oid(reportId);
  const report = id ? await Report.findOne({ _id: id, reporter: viewer._id }).lean() : null;
  // Someone else's report looks exactly like a missing one.
  if (!report) throw ApiError.notFound('Report not found.');
  if (report.status !== 'pending') throw ApiError.conflict('This report is already being reviewed, so it can’t be withdrawn.');
  await Report.updateOne({ _id: id, reporter: viewer._id, status: 'pending' }, { $set: { status: 'withdrawn', active: false } });
  return { id: reportId };
}

/** Reasons per target type, for the report form. */
export function getReportOptions() {
  return {
    reasons: REPORT_REASONS.map(({ id, label: text }) => ({ id, label: text })),
    targets: Object.fromEntries(Object.entries(REPORT_TARGETS).map(([type, config]) => [type, { label: config.label, reasons: config.reasons }])),
    rules: { descriptionMax: REPORT_RULES.descriptionMax },
  };
}

// ----------------------------------------------------------------------------- closing reports (moderators)

/**
 * Closes every active report about a target after a moderator decided: "resolved" (action taken) or
 * "dismissed" (no problem found). Reporters are told the outcome; dismissed reports count towards the
 * reporter's internal report-abuse signal.
 */
export async function closeReportsFor(targetType, targetId, outcome) {
  const reports = await Report.find({ targetType, targetId: oid(targetId), active: true }).select('reporter').lean();
  if (!reports.length) return 0;
  await Report.updateMany({ _id: { $in: reports.map((report) => report._id) } }, { $set: { status: outcome, active: false, resolvedAt: new Date() } });
  await afterClosing(reports, outcome);
  return reports.length;
}

/**
 * Closes one report (the admin report queue): "resolved" or "dismissed". Atomic, so a report closed by
 * someone else meanwhile is left alone. Returns the closed report, or null if it was no longer open.
 */
export async function closeReport(reportId, outcome) {
  const id = oid(reportId);
  if (!id) return null;
  const report = await Report.findOneAndUpdate({ _id: id, active: true }, { $set: { status: outcome, active: false, resolvedAt: new Date() } }, { returnDocument: 'after', lean: true });
  if (report) await afterClosing([report], outcome);
  return report;
}

/** Reporters hear the outcome; dismissed reports count towards the reporter's report-abuse signal. */
async function afterClosing(reports, outcome) {
  if (outcome === 'dismissed') {
    await User.updateMany({ _id: { $in: reports.map((report) => report.reporter) } }, { $inc: { 'moderation.reportsDismissed': 1 } }, { timestamps: false });
  }
  for (const report of reports) {
    emitCampusEvent(CAMPUS_EVENTS.REPORT_REVIEWED, { reportId: report._id.toString(), reporterId: report.reporter.toString(), outcome });
  }
}

