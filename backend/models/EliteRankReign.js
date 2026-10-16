import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { ELITE_TIER_IDS, ELITE_TRANSFER_REASONS } from '../data/gamificationOptions.js';

/**
 * One uninterrupted holding of an elite rank token by one student: the Hall of Fame's permanent history.
 * Kept after the student loses the token (`endedAt` is set, nothing is deleted). Written only by
 * services/eliteRankService.js; (scope, tier, startSeq) is unique, so retrying a snapshot's history never
 * adds a second reign.
 *
 *   enteredTopThree  the student held no token just before (they came into the top three); moving from
 *                    Silver to Gold starts a new reign but isn't a new entry
 */
const eliteRankReignSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true },
    tier: { type: String, enum: ELITE_TIER_IDS, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, required: true },
    startSeq: { type: Number, required: true },
    startReason: { type: String, enum: ELITE_TRANSFER_REASONS, required: true },
    enteredTopThree: { type: Boolean, default: false },
    endedAt: { type: Date, default: null },
    endSeq: { type: Number, default: null },
    endReason: { type: String, enum: [...ELITE_TRANSFER_REASONS, null], default: null },
  },
  { timestamps: true },
);

eliteRankReignSchema.index({ scope: 1, tier: 1, startSeq: 1 }, { unique: true });
// Previous holders of a token, newest first; the longest reign.
eliteRankReignSchema.index({ scope: 1, tier: 1, startedAt: -1 });
// A student's own history.
eliteRankReignSchema.index({ user: 1, startedAt: -1 });
// Most entries into the top three.
eliteRankReignSchema.index({ scope: 1, enteredTopThree: 1, user: 1 });

const EliteRankReign = mongoose.model('EliteRankReign', eliteRankReignSchema);
watchIndexBuild(EliteRankReign);

export default EliteRankReign;
