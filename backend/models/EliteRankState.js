import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { ELITE_TIER_IDS } from '../data/gamificationOptions.js';

/**
 * Who holds the elite rank tokens right now: one document per ranking scope, written only by
 * services/eliteRankService.js. Ownership changes in ONE atomic update of this document (compare-and-set on
 * `seq` and `checkedAt`), so the three tokens always move together and a slower, older snapshot can never
 * overwrite a newer one.
 *
 *   seq         the ranking snapshot the holders come from (RankingSnapshot.seq)
 *   historySeq  the snapshot whose history (reigns, transfers) and notifications are fully written. Lower
 *               than `seq` only while that is being done; whoever finds it lower finishes it (from `pending`),
 *               which is safe to repeat.
 *   computedAt  when the holders' snapshot was calculated
 *   checkedAt   the newest valid snapshot, whether or not it changed anything
 */
const holderSchema = new mongoose.Schema(
  {
    tier: { type: String, enum: ELITE_TIER_IDS, required: true },
    rank: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // When this student started holding this token without interruption.
    since: { type: Date, required: true },
  },
  { _id: false },
);

const pendingSchema = new mongoose.Schema(
  {
    previousHolders: { type: [{ tier: String, user: mongoose.Schema.Types.ObjectId, _id: false }], default: [] },
    left: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    entries: { type: [mongoose.Schema.Types.Mixed], default: [] },
    trigger: { type: String },
  },
  { _id: false },
);

const eliteRankStateSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0, min: 0 },
    historySeq: { type: Number, default: 0, min: 0 },
    holders: { type: [holderSchema], default: [] },
    computedAt: { type: Date, default: null },
    checkedAt: { type: Date, default: () => new Date(0) },
    pending: { type: pendingSchema, default: null },
  },
  { timestamps: true },
);

const EliteRankState = mongoose.model('EliteRankState', eliteRankStateSchema);
watchIndexBuild(EliteRankState);

export default EliteRankState;
