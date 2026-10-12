import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { ANONYMOUS_REPORT_REASON_IDS, ANONYMOUS_RULES } from '../data/anonymousOptions.js';
import { REPORT_STATUSES } from './PostReport.js';

/**
 * A report about an anonymous post or comment. Same shape and statuses as PostReport (which can't be
 * reused: it references campus posts and has post-only reasons), so the moderation dashboard (later
 * phase) can read them the same way. The reporter is stored for the team only and never shown.
 */
const anonymousReportSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ['post', 'comment'], required: true },
    // The reported post or comment.
    target: { type: mongoose.Schema.Types.ObjectId, required: true },
    // The post it belongs to (the post itself for post reports), so reviews have the context.
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'AnonymousPost', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: ANONYMOUS_REPORT_REASON_IDS, required: true },
    details: { type: String, trim: true, maxlength: ANONYMOUS_RULES.reportDetails.max, default: '' },
    status: { type: String, enum: Object.values(REPORT_STATUSES), default: REPORT_STATUSES.PENDING },
  },
  { timestamps: true },
);

// A student reports each post or comment once.
anonymousReportSchema.index({ targetType: 1, target: 1, reportedBy: 1 }, { unique: true });
anonymousReportSchema.index({ status: 1, createdAt: -1 });
anonymousReportSchema.index({ post: 1 });

const AnonymousReport = mongoose.model('AnonymousReport', anonymousReportSchema);
watchIndexBuild(AnonymousReport);

export default AnonymousReport;
