import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import {
  ANONYMOUS_CATEGORY_IDS,
  ANONYMOUS_RULES,
  ANONYMOUS_STATUSES,
  ANONYMOUS_VISIBILITY_IDS,
  DEFAULT_ANONYMOUS_VISIBILITY,
} from '../data/anonymousOptions.js';
import { MODERATION_STATUSES } from '../data/postOptions.js';
import { SEARCH_TEXT_WEIGHTS, searchTextIndex } from '../data/searchOptions.js';
import { moderationFields } from './moderationFields.js';

// Photos on Cloudinary, stored per post (never per student). publicId is kept to delete files later.
const mediaSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  width: { type: Number },
  height: { type: Number },
});

/**
 * A post in the Anonymous Zone. Other students never learn who wrote it, but CampusX keeps the real
 * author (the signed-in student, set by the server) so abuse can be investigated, reports handled and
 * rate limits applied. `author`, `audience` and `likes` are hidden from every query unless selected
 * on purpose, and responses are built from an allow-list that never includes them.
 */
const anonymousPostSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
    category: { type: String, enum: ANONYMOUS_CATEGORY_IDS, required: true },
    title: { type: String, required: true, trim: true, maxlength: ANONYMOUS_RULES.title.max },
    content: { type: String, required: true, trim: true, maxlength: ANONYMOUS_RULES.content.max },
    media: { type: [mediaSchema], default: [] },
    visibility: { type: String, enum: ANONYMOUS_VISIBILITY_IDS, default: DEFAULT_ANONYMOUS_VISIBILITY },
    // Set for community posts (members only); null otherwise.
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', default: null },
    // The author's college when posting, for "college" visibility. Matched in queries, never shown.
    audience: { college: { type: String, select: false } },

    status: { type: String, enum: ANONYMOUS_STATUSES, default: 'active' },
    // Live straight away like campus posts; reports can flag it, moderators (later phase) remove it.
    moderationStatus: { type: String, enum: MODERATION_STATUSES, default: 'approved' },
    reportsCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    // Student ids, only ever turned into a count and the reader's own "liked" state.
    likes: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], select: false },

    editedAt: { type: Date, default: null },
    // Soft delete: the author's delete hides it for good but keeps it for safety reviews.
    deletedAt: { type: Date, default: null },
    ...moderationFields({ existing: ['moderationStatus', 'deletedAt'] }),
  },
  { timestamps: true },
);

anonymousPostSchema.index({ status: 1, moderationStatus: 1, createdAt: -1, _id: -1 });
anonymousPostSchema.index({ author: 1, createdAt: -1 });
anonymousPostSchema.index({ category: 1, createdAt: -1 });
anonymousPostSchema.index({ community: 1, createdAt: -1 });
anonymousPostSchema.index({ visibility: 1, 'audience.college': 1 });

// Search: titles and content only. The author is never part of any index used by search.
anonymousPostSchema.index(...searchTextIndex(SEARCH_TEXT_WEIGHTS.anonymousPost));

const AnonymousPost = mongoose.model('AnonymousPost', anonymousPostSchema);
watchIndexBuild(AnonymousPost);

export default AnonymousPost;
