import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { CASE_RULES, CASE_STATUSES, CASE_TARGET_TYPES, MODERATION_ACTION_IDS, PRIORITIES, RISK_LEVEL_IDS } from '../config/moderationConfig.js';

/**
 * Something for the CampusX moderation team to look at: content the automated checks flagged, or
 * anything students reported. One open case per piece of content (or student); new reports and new
 * automated findings are added to it. Internal: students never see cases, scores or case ids. The
 * Phase 15 admin dashboard will work through these.
 *
 * `targetOwner` may be the author of anonymous content: it is selected only on purpose and never sent
 * by the case API (the audited lookup in services/anonymousModeration.js is the only way to reveal it).
 */
const noteSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    text: { type: String, trim: true, maxlength: CASE_RULES.noteMax, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const moderationCaseSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: CASE_TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, select: false },
    // automated · report (both, when both found it)
    sources: { type: [{ type: String, enum: ['automated', 'report'] }], default: [] },
    // Students who reported it (internal; never shown).
    reportedBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], select: false },
    reportCount: { type: Number, default: 0, min: 0 },
    automatedScore: { type: Number, default: 0, min: 0, max: 100 },
    riskLevel: { type: String, enum: RISK_LEVEL_IDS, default: 'low' },
    flags: { type: [String], default: [] },
    reasons: { type: [String], default: [] },
    priority: { type: String, enum: PRIORITIES, default: 'low' },
    status: { type: String, enum: CASE_STATUSES, default: 'open' },
    // True while open or reviewing: one active case per target.
    active: { type: Boolean, default: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // The latest action taken (automated or by a moderator).
    action: { type: String, enum: MODERATION_ACTION_IDS, default: null },
    notes: { type: [noteSchema], default: [] },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

moderationCaseSchema.index({ targetType: 1, targetId: 1 }, { unique: true, partialFilterExpression: { active: true } });
moderationCaseSchema.index({ status: 1, priority: 1, updatedAt: -1 });
moderationCaseSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

const ModerationCase = mongoose.model('ModerationCase', moderationCaseSchema);
watchIndexBuild(ModerationCase);

export default ModerationCase;
