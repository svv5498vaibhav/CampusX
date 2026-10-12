import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { POINT_ACTIONS } from '../data/gamificationOptions.js';

/**
 * The points ledger: every change to a student's points is a row, never edited except to mark an
 * award reversed. Three kinds:
 *   award          +points for a rewardable event. `rewardKey` (user + action + source) is unique, so
 *                  the same event can never be rewarded twice, even by simultaneous requests.
 *   reversal       -points when the event stops counting (content deleted, made private, unliked, ...)
 *   reinstatement  +points when it counts again (liked again, made public again, ...)
 * Only the gamification service writes here.
 */
const pointTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    points: { type: Number, required: true },
    action: { type: String, enum: POINT_ACTIONS, required: true },
    kind: { type: String, enum: ['award', 'reversal', 'reinstatement'], required: true },
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true },
    // The content a reaction belongs to (e.g. the post a like was on), for bulk reversals.
    parentId: { type: String },
    description: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    // Award rows only.
    rewardKey: { type: String },
    reversed: { type: Boolean },
    reversedAt: { type: Date },
    // Reversal / reinstatement rows: the award they apply to.
    award: { type: mongoose.Schema.Types.ObjectId, ref: 'PointTransaction' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

pointTransactionSchema.index({ rewardKey: 1 }, { unique: true, partialFilterExpression: { rewardKey: { $type: 'string' } } });
pointTransactionSchema.index({ user: 1, createdAt: -1, _id: -1 });
// Caps: how many current awards of an action a student has in a period.
pointTransactionSchema.index({ user: 1, action: 1, kind: 1, createdAt: -1 });
pointTransactionSchema.index({ sourceId: 1 });
pointTransactionSchema.index({ parentId: 1 }, { partialFilterExpression: { parentId: { $type: 'string' } } });

const PointTransaction = mongoose.model('PointTransaction', pointTransactionSchema);
watchIndexBuild(PointTransaction);

export default PointTransaction;
