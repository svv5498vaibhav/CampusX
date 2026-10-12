import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { POST_RULES, REPORT_REASON_IDS } from '../data/postOptions.js';

/**
 * pending    waiting for the moderation team (the only "active" status)
 * reviewed   looked at and acted on
 * dismissed  looked at, no action needed
 */
export const REPORT_STATUSES = Object.freeze({
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  DISMISSED: 'dismissed',
});

const postReportSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: REPORT_REASON_IDS, required: true },
    details: { type: String, trim: true, maxlength: POST_RULES.reportDetails.maxLength, default: '' },
    status: { type: String, enum: Object.values(REPORT_STATUSES), default: REPORT_STATUSES.PENDING },
  },
  { timestamps: true },
);

// One open report per student per post. Once the team closes it, the student may report again.
postReportSchema.index(
  { post: 1, reportedBy: 1 },
  { unique: true, partialFilterExpression: { status: REPORT_STATUSES.PENDING } },
);
postReportSchema.index({ status: 1, createdAt: -1 });

const PostReport = mongoose.model('PostReport', postReportSchema);
watchIndexBuild(PostReport);

export default PostReport;
