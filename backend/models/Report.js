import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { PRIORITIES, REPORT_REASON_IDS, REPORT_RULES, REPORT_STATUSES, REPORT_TARGET_IDS } from '../config/moderationConfig.js';

/**
 * A student's report about something on CampusX: a post, comment, project, community, opportunity,
 * achievement, student or anything in the Anonymous Zone. One model for all of them (reports filed
 * before Phase 13 stay in PostReport, OpportunityReport and AnonymousReport).
 *
 * The reporter is always the signed-in student. Who reported something is never shown to anyone else,
 * including the person reported. `targetOwner`, `suspicious` and `case` are internal.
 */
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGET_IDS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Who the report is about (the author of an anonymous post too), for moderators only.
    targetOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, select: false },
    reason: { type: String, enum: REPORT_REASON_IDS, required: true },
    description: { type: String, trim: true, maxlength: REPORT_RULES.descriptionMax, default: '' },
    status: { type: String, enum: REPORT_STATUSES, default: 'pending' },
    priority: { type: String, enum: PRIORITIES, default: 'low' },
    // True while pending or reviewing: one active report per student per target.
    active: { type: Boolean, default: true },
    // Sent during a burst of reports or as one of many about the same person (report abuse signal).
    suspicious: { type: Boolean, default: false, select: false },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ModerationCase', default: null, select: false },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { active: true } });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1, active: 1 });
reportSchema.index({ status: 1, priority: 1, createdAt: -1 });

const Report = mongoose.model('Report', reportSchema);
watchIndexBuild(Report);

export default Report;
