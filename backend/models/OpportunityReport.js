import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { OPPORTUNITY_REPORT_REASON_IDS, OPPORTUNITY_RULES } from '../data/opportunityOptions.js';
import { REPORT_STATUSES } from './PostReport.js';

/**
 * A student's report about an opportunity (expired, wrong details, broken link, ...). Same shape and
 * statuses as PostReport, so the moderation dashboard (later phase) can read both the same way.
 * PostReport itself can't be reused: it references a post and uses post-only reasons.
 */
const opportunityReportSchema = new mongoose.Schema(
  {
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: OPPORTUNITY_REPORT_REASON_IDS, required: true },
    details: { type: String, trim: true, maxlength: OPPORTUNITY_RULES.reportDetails.max, default: '' },
    status: { type: String, enum: Object.values(REPORT_STATUSES), default: REPORT_STATUSES.PENDING },
  },
  { timestamps: true },
);

// One open report per student per opportunity. Once the team closes it, the student may report again.
opportunityReportSchema.index(
  { opportunity: 1, reportedBy: 1 },
  { unique: true, partialFilterExpression: { status: REPORT_STATUSES.PENDING } },
);
opportunityReportSchema.index({ status: 1, createdAt: -1 });

const OpportunityReport = mongoose.model('OpportunityReport', opportunityReportSchema);
watchIndexBuild(OpportunityReport);

export default OpportunityReport;
