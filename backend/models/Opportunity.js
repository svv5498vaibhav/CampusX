import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import {
  OPPORTUNITY_MODE_IDS,
  OPPORTUNITY_RULES,
  OPPORTUNITY_STATUS_IDS,
  OPPORTUNITY_TYPE_IDS,
  OPPORTUNITY_VISIBILITY_IDS,
} from '../data/opportunityOptions.js';
import { SEARCH_TEXT_WEIGHTS, searchTextIndex } from '../data/searchOptions.js';

const R = OPPORTUNITY_RULES;

// Images live on Cloudinary; publicId (hidden from queries) is kept so the file can be replaced or deleted.
const imageSchema = new mongoose.Schema(
  {
    url: { type: String },
    publicId: { type: String, select: false },
  },
  { _id: false },
);

const opportunitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: R.title.max },
    slug: { type: String, required: true, unique: true },
    shortDescription: { type: String, required: true, trim: true, maxlength: R.shortDescription.max },
    description: { type: String, required: true, trim: true, maxlength: R.description.max },
    type: { type: String, enum: OPPORTUNITY_TYPE_IDS, required: true },
    organizer: { type: String, required: true, trim: true, maxlength: R.organizer.max },
    organizerLogo: { type: imageSchema, default: undefined },
    location: { type: String, trim: true, maxlength: R.location.max, default: '' },
    mode: { type: String, enum: OPPORTUNITY_MODE_IDS, required: true },

    // Where students apply / register. Always http(s), checked by the validator.
    applicationUrl: { type: String, trim: true, maxlength: R.url.maxLength },
    registrationUrl: { type: String, trim: true, maxlength: R.url.maxLength },

    startDate: { type: Date },
    endDate: { type: Date },
    // Unset = rolling (no fixed deadline). Once it has passed the opportunity is shown as closed.
    applicationDeadline: { type: Date },

    // Free-text notes ("Open to final-year students") plus the structured rules the server checks
    // against each student's own profile. Empty lists mean "anyone".
    eligibility: { type: String, trim: true, maxlength: R.eligibility.max, default: '' },
    eligibleColleges: { type: [String], default: [] }, // college ids (data/campusOptions.js)
    eligibleBranches: { type: [String], default: [] }, // branch ids
    eligibleSemesters: { type: [Number], default: [] }, // 1-8

    skills: { type: [{ type: String, trim: true, maxlength: R.skills.maxLength }], default: [] },
    tags: { type: [{ type: String, trim: true, maxlength: R.tags.maxLength }], default: [] },
    prize: { type: String, trim: true, maxlength: R.prize.max, default: '' },
    fee: { type: String, trim: true, maxlength: R.fee.max, default: '' },
    image: { type: imageSchema, default: undefined },

    // Always the signed-in moderator/admin (req.user), never a value sent by the client.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: OPPORTUNITY_STATUS_IDS, default: 'draft' },
    visibility: { type: String, enum: OPPORTUNITY_VISIBILITY_IDS, default: 'public' },
    featured: { type: Boolean, default: false },
    // Counted at most once per student every few hours.
    views: { type: Number, default: 0, min: 0 },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

opportunitySchema.index({ status: 1, applicationDeadline: 1 });
opportunitySchema.index({ type: 1, status: 1 });
opportunitySchema.index({ visibility: 1 });
opportunitySchema.index({ createdAt: -1, _id: -1 });
opportunitySchema.index({ views: -1 });
opportunitySchema.index({ organizer: 1 });
opportunitySchema.index({ tags: 1 });
opportunitySchema.index({ skills: 1 });
opportunitySchema.index({ eligibleColleges: 1 });
opportunitySchema.index({ eligibleBranches: 1 });

// Search: weighted keywords, and titles for word-prefix matching.
opportunitySchema.index(...searchTextIndex(SEARCH_TEXT_WEIGHTS.opportunity));
opportunitySchema.index({ title: 1 });

const Opportunity = mongoose.model('Opportunity', opportunitySchema);
watchIndexBuild(Opportunity);

export default Opportunity;
