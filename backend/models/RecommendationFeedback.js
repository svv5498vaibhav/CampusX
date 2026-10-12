import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { FEEDBACK_ACTION_IDS, FEEDBACK_RULES, TARGET_TYPE_IDS } from '../config/recommendationConfig.js';

/**
 * "Not interested" / dismiss on a recommendation (Phase 14). Private to the student, only used to shape
 * their own recommendations, and it expires on its own after FEEDBACK_RULES.hideForDays. `traits` are
 * the plain categories of the item ("category:ai-ml"), worked out by the server, so "Not interested" can
 * show fewer similar things for a while. No reason text or other personal data is stored.
 */
const recommendationFeedbackSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: TARGET_TYPE_IDS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, enum: FEEDBACK_ACTION_IDS, required: true },
    traits: { type: [{ type: String, maxlength: 80 }], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// One record per student per item (dismissing again refreshes it).
recommendationFeedbackSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });
recommendationFeedbackSchema.index({ user: 1, createdAt: -1 });
recommendationFeedbackSchema.index({ createdAt: 1 }, { expireAfterSeconds: FEEDBACK_RULES.hideForDays * 24 * 60 * 60 });

const RecommendationFeedback = mongoose.model('RecommendationFeedback', recommendationFeedbackSchema);
watchIndexBuild(RecommendationFeedback);

export default RecommendationFeedback;
