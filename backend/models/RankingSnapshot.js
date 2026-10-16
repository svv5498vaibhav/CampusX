import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { ELITE_TIER_IDS } from '../data/gamificationOptions.js';

/**
 * An authoritative ranking snapshot: the top of the CampusX-wide all-time leaderboard as the server
 * calculated it at `computedAt`, by the leaderboard's own rules (services/rankingService.js topOfLeaderboard).
 * Written only by services/eliteRankService.js, and only for snapshots that moved an elite rank token (one
 * that changes nothing just updates EliteRankState.checkedAt). `seq` numbers them per scope: unique, so the
 * same snapshot is never stored twice, even when its writing is retried.
 *
 *   entries          the top three as ranked (rank, student, points and the tie-breaker values)
 *   holders          who holds each token after this snapshot
 *   previousHolders  who held them before
 *   left             previous holders who left the rankings (account suspended or closed, no points)
 */
const holderSchema = new mongoose.Schema(
  {
    tier: { type: String, enum: ELITE_TIER_IDS, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const entrySchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true, min: 1 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    points: { type: Number, required: true, min: 0 },
    verifiedAchievements: { type: Number, default: 0 },
    reachedAt: { type: Date },
  },
  { _id: false },
);

const rankingSnapshotSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true },
    period: { type: String, required: true },
    seq: { type: Number, required: true, min: 1 },
    computedAt: { type: Date, required: true },
    entries: { type: [entrySchema], default: [] },
    holders: { type: [holderSchema], default: [] },
    previousHolders: { type: [holderSchema], default: [] },
    left: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    // What asked for the snapshot: points, account, schedule or startup.
    trigger: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

rankingSnapshotSchema.index({ scope: 1, seq: 1 }, { unique: true });

const RankingSnapshot = mongoose.model('RankingSnapshot', rankingSnapshotSchema);
watchIndexBuild(RankingSnapshot);

export default RankingSnapshot;
