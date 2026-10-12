import mongoose from 'mongoose';
import { CONTENT_STATUSES } from '../config/moderationConfig.js';

/**
 * Moderation fields shared by every kind of student content. Only services/moderationService.js changes
 * them; no request body ever reaches them (validators allow-list fields, services set the rest).
 *
 *   moderationStatus  see config/moderationConfig.js (approved by default: content goes live at once)
 *   deletedAt         when moderation took it down (soft delete: the record stays for audits)
 *   deletedBy         the CampusX moderator, or null for an automated action (internal)
 *   deletionReason    why (internal)
 *
 * `existing` lists fields a model already declares itself (e.g. AnonymousPost's own `deletedAt`).
 */
export function moderationFields({ existing = [] } = {}) {
  const fields = {
    moderationStatus: { type: String, enum: CONTENT_STATUSES, default: 'approved' },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, select: false },
    deletionReason: { type: String, trim: true, maxlength: 300, default: null, select: false },
  };
  for (const name of existing) delete fields[name];
  return fields;
}
