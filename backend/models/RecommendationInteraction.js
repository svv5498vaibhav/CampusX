import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { INTERACTION_RULES, TARGET_TYPE_IDS } from '../config/recommendationConfig.js';

/**
 * Minimal recommendation analytics (Phase 14): how often a recommended item was shown to a student and
 * whether they opened it. One small counter document per student per item instead of one per event, so
 * the collection stays tiny; it expires INTERACTION_RULES.keepDays after its last update. Used only to
 * stop pushing things a student keeps ignoring and to learn from what they open. Never shown to anyone.
 */
const recommendationInteractionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: TARGET_TYPE_IDS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    lastShownAt: { type: Date, default: null },
    lastClickedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

recommendationInteractionSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });
recommendationInteractionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: INTERACTION_RULES.keepDays * 24 * 60 * 60 });

const RecommendationInteraction = mongoose.model('RecommendationInteraction', recommendationInteractionSchema);
watchIndexBuild(RecommendationInteraction);

export default RecommendationInteraction;
