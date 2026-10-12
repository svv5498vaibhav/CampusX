import { PERMISSIONS, REPORT_ACTIONS } from '../../config/adminConfig.js';
import { MODERATION_ACTIONS as A, REPORT_REASONS } from '../../config/moderationConfig.js';
import AnonymousReport from '../../models/AnonymousReport.js';
import ModerationCase from '../../models/ModerationCase.js';
import OpportunityReport from '../../models/OpportunityReport.js';
import PostReport, { REPORT_STATUSES as LEGACY_STATUSES } from '../../models/PostReport.js';
import Report from '../../models/Report.js';
import ApiError from '../../utils/ApiError.js';
import { toObjectId } from '../../utils/objectId.js';
import { closeReport } from '../reportService.js';
import { assertPermission, pageOf } from './adminAccess.js';
import { previewKey, previewTarget, previewTargets } from './adminTargets.js';
import { recordAdminAction } from './auditService.js';

/*
 * The report queue: every report students filed through the unified report system (models/Report.js),
 * one at a time. Closing a report tells its reporter the outcome (Phase 13 REPORT_REVIEWED). Content is
 * acted on from its moderation case; a report only records what the team decided about it.
 *
 * Who filed a report is never sent, to anyone. Reports about anonymous content never carry the author.
 */

const REASON_LABELS = new Map(REPORT_REASONS.map((reason) => [reason.id, reason.label]));

function reportFilter({ status = 'pending', priority, targetType, reason }) {
  const conditions = [];
  if (status === 'high') conditions.push({ active: true, priority: { $in: ['high', 'critical'] } });
  else if (status !== 'all') conditions.push({ status });
  if (priority) conditions.push({ priority });
  if (targetType) conditions.push({ targetType });
  if (reason) conditions.push({ reason });
  return conditions.length ? { $and: conditions } : {};
}

const toView = (report, target) => ({
  id: report._id.toString(),
  targetType: report.targetType,
  targetId: report.targetId.toString(),
  target: target ?? null,
  reason: report.reason,
  reasonLabel: REASON_LABELS.get(report.reason) ?? report.reason,
  description: report.description ?? '',
  priority: report.priority,
  status: report.status,
  suspicious: Boolean(report.suspicious),
  caseId: report.case?.toString() ?? null,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
  resolvedAt: report.resolvedAt ?? null,
});

// Never the reporter or the content owner.
const REPORT_FIELDS = 'targetType targetId reason description priority status createdAt updatedAt resolvedAt +suspicious +case';

/** Counts per queue tab, plus reports still waiting in the pre-Phase 13 collections. */
async function reportCounts() {
  const [byStatus, high, legacy] = await Promise.all([
    Report.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Report.countDocuments({ active: true, priority: { $in: ['high', 'critical'] } }),
    Promise.all([PostReport, OpportunityReport, AnonymousReport].map((model) => model.countDocuments({ status: LEGACY_STATUSES.PENDING }))),
  ]);
  const counts = { pending: 0, reviewing: 0, resolved: 0, dismissed: 0, withdrawn: 0 };
  for (const row of byStatus) counts[row._id] = row.count;
  return { ...counts, high, all: Object.values(counts).reduce((sum, value) => sum + value, 0), legacyPending: legacy.reduce((sum, value) => sum + value, 0) };
}

/** GET /admin/reports: newest first, filtered by queue tab, priority, kind and reason. */
export async function listReports(actor, { page = 1, limit = 20, ...filters } = {}) {
  assertPermission(actor, PERMISSIONS.VIEW_REPORTS);
  const match = reportFilter(filters);
  const [reports, total, counts] = await Promise.all([
    Report.find(match).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).select(REPORT_FIELDS).lean(),
    Report.countDocuments(match),
    reportCounts(),
  ]);
  const previews = await previewTargets(reports.map((report) => ({ targetType: report.targetType, targetId: report.targetId })));
  return { reports: reports.map((report) => toView(report, previews.get(previewKey(report.targetType, report.targetId)))), counts, pagination: pageOf(page, limit, total) };
}

const ACTIONS_FROM = (status) => Object.entries(REPORT_ACTIONS).filter(([, rule]) => rule.from.includes(status)).map(([id]) => id);

async function loadReport(reportId) {
  const id = toObjectId(String(reportId));
  const report = id ? await Report.findById(id).select(REPORT_FIELDS).lean() : null;
  if (!report) throw ApiError.notFound('Report not found.');
  return report;
}

/** GET /admin/reports/:id: the report, what it is about, its case, and how many others reported it. */
export async function getReport(actor, reportId) {
  assertPermission(actor, PERMISSIONS.VIEW_REPORTS);
  const report = await loadReport(reportId);
  const [target, moderationCase, others] = await Promise.all([
    previewTarget(report.targetType, report.targetId, { detail: true }),
    report.case ? ModerationCase.findById(report.case).select('status priority riskLevel automatedScore reportCount action active').lean() : null,
    Report.countDocuments({ targetType: report.targetType, targetId: report.targetId, _id: { $ne: report._id } }),
  ]);
  return {
    report: toView(report, target),
    case: moderationCase ? { id: moderationCase._id.toString(), status: moderationCase.status, priority: moderationCase.priority, riskLevel: moderationCase.riskLevel, automatedScore: moderationCase.automatedScore, reportCount: moderationCase.reportCount, action: moderationCase.action, active: moderationCase.active } : null,
    otherReports: others,
    actions: ACTIONS_FROM(report.status),
  };
}

const ALREADY = 'This report was already handled. Refresh to see its current status.';

/** The report's case moves to "reviewing" (and is assigned) when a report is reviewed or escalated. */
async function touchCase(report, actor, { escalate = false, note = '' }) {
  if (!report.case) return;
  const update = { $set: { status: 'reviewing', assignedTo: actor._id, ...(escalate && { priority: 'critical', action: A.ESCALATE }) }, ...(note && { $push: { notes: { author: actor._id, text: note } } }) };
  await ModerationCase.updateOne({ _id: report.case, active: true }, update);
}

/**
 * PATCH /admin/reports/:id: review · resolve · reject · escalate. Each change only applies if the report
 * is still in a status that allows it (atomic), so two staff members can't handle the same report twice.
 */
export async function actOnReport(actor, reportId, { action, note = '' }) {
  assertPermission(actor, PERMISSIONS.VIEW_REPORTS);
  assertPermission(actor, PERMISSIONS.REVIEW_MODERATION);
  const rule = Object.hasOwn(REPORT_ACTIONS, action) ? REPORT_ACTIONS[action] : null;
  if (!rule) throw ApiError.unprocessable('Please choose a valid action.');
  const report = await loadReport(reportId);
  if (!rule.from.includes(report.status)) throw ApiError.conflict(ALREADY);

  let newStatus = report.status;
  if (action === 'review') {
    const { modifiedCount } = await Report.updateOne({ _id: report._id, status: 'pending' }, { $set: { status: 'reviewing' } });
    if (!modifiedCount) throw ApiError.conflict(ALREADY);
    newStatus = 'reviewing';
    await touchCase(report, actor, { note });
  } else if (action === 'escalate') {
    if (report.priority === 'critical' && report.status === 'reviewing') throw ApiError.conflict('This report is already escalated.');
    const { modifiedCount } = await Report.updateOne({ _id: report._id, active: true, status: { $in: rule.from } }, { $set: { status: 'reviewing', priority: 'critical' } });
    if (!modifiedCount) throw ApiError.conflict(ALREADY);
    newStatus = 'reviewing';
    await touchCase(report, actor, { escalate: true, note });
  } else {
    const closed = await closeReport(report._id, rule.to);
    if (!closed) throw ApiError.conflict(ALREADY);
    newStatus = rule.to;
  }

  await recordAdminAction(actor, {
    action: rule.audit,
    targetType: report.targetType,
    targetId: report.targetId,
    previousStatus: report.status,
    newStatus,
    reason: note,
    metadata: { reportId: report._id.toString(), reason: report.reason },
    caseId: report.case ?? null,
  });
  return getReport(actor, report._id.toString());
}
