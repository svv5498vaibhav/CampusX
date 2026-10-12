import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { CASE_TARGET_TYPES } from '../config/moderationConfig.js';

/**
 * Every moderation decision, automated or by a person, in order, plus the admin control center's own
 * actions (staff sign-ins, account status changes, report handling, opportunity changes, anonymous-author
 * lookups, refused admin requests). Internal: only the admin API reads it (GET /admin/audit-logs). Rows
 * are only ever added, never edited.
 *
 * `actor` is the moderator or admin, the community owner/moderator, a student (refused admin requests
 * only), or null for the automated system. `ip` is the staff member's request address, for admin API
 * actions only. Never stored here: passwords, tokens, secrets, emails or the text of the content itself
 * (metadata holds ids, scores, flags and short reasons only).
 */
const moderationAuditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // system · moderator · admin · community (an owner/moderator inside their own community) · student
    actorRole: { type: String, enum: ['system', 'moderator', 'admin', 'community', 'student'], required: true },
    action: { type: String, required: true, maxlength: 60 },
    targetType: { type: String, enum: CASE_TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    previousStatus: { type: String, default: null },
    newStatus: { type: String, default: null },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'ModerationCase', default: null },
    ip: { type: String, default: null, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

moderationAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
moderationAuditLogSchema.index({ createdAt: -1 });
moderationAuditLogSchema.index({ actor: 1, createdAt: -1 });

const ModerationAuditLog = mongoose.model('ModerationAuditLog', moderationAuditLogSchema);
watchIndexBuild(ModerationAuditLog);

export default ModerationAuditLog;
