import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { ELITE_TIER_IDS, ELITE_TRANSFER_REASONS } from '../data/gamificationOptions.js';

/**
 * One elite rank token changing hands in one ranking snapshot ("the Golden Token passed from A to B").
 * `from` is null when the token was unclaimed, `to` when nobody holds it any more (fewer than three ranked
 * students). Permanent history, written only by services/eliteRankService.js; (scope, seq, tier) is unique,
 * so a retried snapshot never records the same transfer twice.
 */
const eliteRankTransferSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true },
    seq: { type: Number, required: true },
    snapshot: { type: mongoose.Schema.Types.ObjectId, ref: 'RankingSnapshot' },
    tier: { type: String, enum: ELITE_TIER_IDS, required: true },
    // 1, 2 or 3: lists transfers of one snapshot in token order.
    rank: { type: Number, required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, enum: ELITE_TRANSFER_REASONS, required: true },
    at: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

eliteRankTransferSchema.index({ scope: 1, seq: 1, tier: 1 }, { unique: true });
eliteRankTransferSchema.index({ scope: 1, seq: -1, rank: 1 });

const EliteRankTransfer = mongoose.model('EliteRankTransfer', eliteRankTransferSchema);
watchIndexBuild(EliteRankTransfer);

export default EliteRankTransfer;
