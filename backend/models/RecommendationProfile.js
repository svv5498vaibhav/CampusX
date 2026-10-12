import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';

/**
 * A student's derived recommendation profile (Phase 14): what CampusX has learned from what they do. It
 * is never the source of truth for who they are: their college, branch, semester, interests and skills
 * are read from their account on every request and are not copied here. Everything in this document can
 * be rebuilt from the student's activity at any time (services/recommendationProfileService.js), and it
 * is never sent to anyone, the student included.
 *
 * Signals are ids of things the student liked, commented on or opened from a recommendation, with plain
 * traits ("postType:event", "category:web", "keyword:react"). Nothing from the Anonymous Zone is ever
 * recorded, and no search text is kept: searches are only mapped to CampusX's own topic lists.
 */

export const SIGNAL_KINDS = Object.freeze(['post-like', 'post-comment', 'project-like', 'recommendation-click']);

const signalSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: SIGNAL_KINDS, required: true },
    // The item (for undoing an unlike and for not counting the same thing twice).
    ref: { type: String, required: true, maxlength: 64 },
    traits: { type: [{ type: String, maxlength: 80 }], default: [] },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const countsSchema = new mongoose.Schema(
  {
    postLikes: { type: Number, default: 0 },
    postComments: { type: Number, default: 0 },
    projectLikes: { type: Number, default: 0 },
    recommendationClicks: { type: Number, default: 0 },
    communitiesJoined: { type: Number, default: 0 },
    opportunitiesTracked: { type: Number, default: 0 },
    ownProjects: { type: Number, default: 0 },
    ownAchievements: { type: Number, default: 0 },
    searches: { type: Number, default: 0 },
  },
  { _id: false },
);

const recommendationProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Learned from activity only (lower case): interest ids; skills and tech the student has used in their
    // own projects and achievements; topic keywords from what they liked, joined, tracked or searched.
    interests: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    // Most-engaged first.
    preferredCategories: { type: [String], default: [] }, // post types
    preferredOpportunityTypes: { type: [String], default: [] },
    preferredCommunityTypes: { type: [String], default: [] },
    preferredProjectCategories: { type: [String], default: [] },
    preferredAchievementTypes: { type: [String], default: [] },
    activitySignals: {
      counts: { type: countsSchema, default: () => ({}) },
      // Newest last; capped at PROFILE_RULES.keepSignals.
      recent: { type: [signalSchema], default: [] },
    },
    // Set when something important changed (joined a community, tracked an opportunity, edited the
    // profile): the next read rebuilds the learned lists.
    stale: { type: Boolean, default: true },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

recommendationProfileSchema.index({ user: 1 }, { unique: true });

const RecommendationProfile = mongoose.model('RecommendationProfile', recommendationProfileSchema);
watchIndexBuild(RecommendationProfile);

export default RecommendationProfile;
