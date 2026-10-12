import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { ANONYMOUS_RULES } from '../data/anonymousOptions.js';
import { MODERATION_STATUSES } from '../data/postOptions.js';
import { moderationFields } from './moderationFields.js';

/**
 * A comment in the Anonymous Zone. Same shape as a campus Comment, plus moderation fields and a soft
 * delete, but kept apart: campus comments are shown with the author's name and photo, these never are.
 * `author` (the signed-in student, set by the server) is hidden from every query unless selected.
 */
const anonymousCommentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'AnonymousPost', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
    content: { type: String, required: true, trim: true, minlength: ANONYMOUS_RULES.comment.min, maxlength: ANONYMOUS_RULES.comment.max },
    status: { type: String, enum: ['active', 'hidden', 'deleted'], default: 'active' },
    moderationStatus: { type: String, enum: MODERATION_STATUSES, default: 'approved' },
    reportsCount: { type: Number, default: 0, min: 0 },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    ...moderationFields({ existing: ['moderationStatus', 'deletedAt'] }),
  },
  { timestamps: true },
);

anonymousCommentSchema.index({ post: 1, status: 1, createdAt: 1, _id: 1 });
anonymousCommentSchema.index({ author: 1 });

const AnonymousComment = mongoose.model('AnonymousComment', anonymousCommentSchema);
watchIndexBuild(AnonymousComment);

export default AnonymousComment;
