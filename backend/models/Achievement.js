import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { SEARCH_TEXT_WEIGHTS, searchTextIndex } from '../data/searchOptions.js';
import {
  ACHIEVEMENT_RULES,
  ACHIEVEMENT_TYPE_IDS,
  SHOWCASE_VISIBILITY_IDS,
  VERIFICATION_STATUSES,
} from '../data/showcaseOptions.js';
import { moderationFields } from './moderationFields.js';

// Certificates, result screenshots, award photos: images or PDFs on Cloudinary.
const proofSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, required: true },
  kind: { type: String, enum: ['image', 'pdf'], required: true },
  // Cloudinary resource type, needed to delete the file ('image' or 'raw' for PDFs).
  resourceType: { type: String, enum: ['image', 'raw'], required: true },
  width: { type: Number },
  height: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
});

const achievementSchema = new mongoose.Schema(
  {
    // Always the signed-in student (req.user), never a value sent by the client.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: ACHIEVEMENT_RULES.title.max },
    description: { type: String, trim: true, maxlength: ACHIEVEMENT_RULES.description.max, default: '' },
    type: { type: String, enum: ACHIEVEMENT_TYPE_IDS, required: true },
    organization: { type: String, trim: true, maxlength: ACHIEVEMENT_RULES.organization.max, default: '' },
    eventName: { type: String, trim: true, maxlength: ACHIEVEMENT_RULES.eventName.max, default: '' },
    date: { type: Date, required: true },
    rank: { type: String, trim: true, maxlength: ACHIEVEMENT_RULES.rank.max, default: '' },
    // A link to an online certificate (e.g. a course provider's page).
    certificateUrl: { type: String, trim: true, maxlength: ACHIEVEMENT_RULES.url.maxLength },
    proof: { type: [proofSchema], default: [] },
    skills: { type: [{ type: String, trim: true, maxlength: ACHIEVEMENT_RULES.skills.maxLength }], default: [] },

    // Controlled by the server only: unverified → pending (proof submitted) → verified / rejected
    // by a CampusX moderator. Any change by the student to a reviewed achievement sends it back.
    verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'unverified' },
    verification: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      note: { type: String, trim: true, maxlength: ACHIEVEMENT_RULES.verificationNote.max },
    },

    visibility: { type: String, enum: SHOWCASE_VISIBILITY_IDS, default: 'public' },
    // The owner's college, kept in step by the server so "college" visibility is matched in the query.
    audience: { college: { type: String } },
    ...moderationFields(),
  },
  { timestamps: true },
);

achievementSchema.index({ owner: 1, date: -1 });
achievementSchema.index({ type: 1, date: -1 });
achievementSchema.index({ verificationStatus: 1 });
achievementSchema.index({ visibility: 1, 'audience.college': 1 });
achievementSchema.index({ date: -1, _id: -1 });
achievementSchema.index({ createdAt: -1 });

// Search: weighted keywords, and titles for word-prefix matching.
achievementSchema.index(...searchTextIndex(SEARCH_TEXT_WEIGHTS.achievement));
achievementSchema.index({ title: 1 });

const Achievement = mongoose.model('Achievement', achievementSchema);
watchIndexBuild(Achievement);

export default Achievement;
