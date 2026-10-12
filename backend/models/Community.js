import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import {
  COMMUNITY_RULES,
  COMMUNITY_STATUSES,
  COMMUNITY_TYPE_IDS,
  COMMUNITY_VISIBILITY_IDS,
} from '../data/communityOptions.js';
import { SEARCH_TEXT_WEIGHTS, searchTextIndex } from '../data/searchOptions.js';
import { moderationFields } from './moderationFields.js';

const communitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: COMMUNITY_RULES.name.max },
    // Unique: the name (lower-cased, hyphenated) plus the college for campus-scoped communities, so
    // two campuses can both have "CSE Students" but one campus can't have two.
    slug: { type: String, required: true, unique: true },
    description: { type: String, trim: true, maxlength: COMMUNITY_RULES.description.max, default: '' },
    type: { type: String, enum: COMMUNITY_TYPE_IDS, required: true },
    visibility: { type: String, enum: COMMUNITY_VISIBILITY_IDS, required: true },

    // Scope, set by the server from the creator's profile: college (college/branch/restricted),
    // branch (branch/restricted) and semester (restricted). Option ids, never display text.
    college: { type: String },
    branch: { type: String },
    semester: { type: Number },

    // Cloudinary delivery URLs; the public ids are kept to replace or delete the files.
    iconUrl: { type: String },
    iconPublicId: { type: String, select: false },
    coverImageUrl: { type: String },
    coverImagePublicId: { type: String, select: false },

    // The student who created it (from the session). Official communities have none.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Created by CampusX for every college, branch and interest.
    official: { type: Boolean, default: false },
    // Kept in step with CommunityMember (active members); membership itself lives there.
    memberCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: COMMUNITY_STATUSES, default: 'active' },
    rules: { type: [{ type: String, trim: true, maxlength: COMMUNITY_RULES.rules.maxLength }], default: [] },
    tags: { type: [{ type: String, trim: true, maxlength: COMMUNITY_RULES.tags.maxLength }], default: [] },
    // Trust & Safety: a restricted community is hidden from students who aren't members.
    ...moderationFields(),
  },
  { timestamps: true },
);

communitySchema.index({ status: 1, memberCount: -1 });
communitySchema.index({ status: 1, createdAt: -1 });
communitySchema.index({ type: 1, status: 1 });
communitySchema.index({ college: 1, branch: 1, status: 1 });
communitySchema.index({ tags: 1 });

// Search: weighted keywords, names for prefix matching, and branch on its own ("CSE" finds branch communities).
communitySchema.index(...searchTextIndex(SEARCH_TEXT_WEIGHTS.community));
communitySchema.index({ name: 1 });
communitySchema.index({ branch: 1 });

const Community = mongoose.model('Community', communitySchema);
watchIndexBuild(Community);

export default Community;
