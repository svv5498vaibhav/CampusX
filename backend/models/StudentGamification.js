import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';

/**
 * A student's points, level, badges and streak: one record per student, changed only by
 * services/gamificationService.js (never by a request). Totals always equal the sum of the student's
 * PointTransaction ledger. The weekly and monthly counters belong to the period named by weekKey and
 * monthKey and restart when a new period begins.
 */
const gamificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    totalPoints: { type: Number, default: 0, min: 0 },
    // Every point ever earned; reversals don't lower it.
    lifetimePoints: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1 },
    currentLevelPoints: { type: Number, default: 0 },
    pointsToNextLevel: { type: Number, default: 0 },
    // When the current total was reached (tie-breaker: earlier wins).
    totalReachedAt: { type: Date },

    weeklyPoints: { type: Number, default: 0 },
    weekKey: { type: String },
    weeklyReachedAt: { type: Date },
    monthlyPoints: { type: Number, default: 0 },
    monthKey: { type: String },
    monthlyReachedAt: { type: Date },

    // Current (not reversed) awards per action, for badges; verified achievements also break ties.
    counts: { type: Map, of: Number, default: {} },
    verifiedAchievements: { type: Number, default: 0 },

    badges: {
      type: [{ key: { type: String, required: true }, earnedAt: { type: Date, required: true }, _id: false }],
      default: [],
    },
    streak: {
      current: { type: Number, default: 0 },
      longest: { type: Number, default: 0 },
      lastDay: { type: String }, // "YYYY-MM-DD" in the gamification time zone
    },
    lastActivityAt: { type: Date },
    // Best ranking milestone reached per leaderboard ("overall", "college:<college id>"): 10, 3 or 1.
    // See RANK_MILESTONES in data/gamificationOptions.js.
    rankMilestones: { type: Map, of: Number },

    // Copied from the student's profile whenever it changes or points change, so leaderboards can
    // filter by college, branch and semester. `eligible`: an active, onboarded account.
    campus: {
      college: { type: String },
      branch: { type: String },
      semester: { type: Number },
    },
    eligible: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Leaderboards: all time (overall / college / branch / semester), this week, this month.
gamificationSchema.index({ eligible: 1, totalPoints: -1, verifiedAchievements: -1, totalReachedAt: 1 });
gamificationSchema.index({ 'campus.college': 1, 'campus.branch': 1, 'campus.semester': 1, totalPoints: -1 });
gamificationSchema.index({ weekKey: 1, weeklyPoints: -1 });
gamificationSchema.index({ monthKey: 1, monthlyPoints: -1 });

const StudentGamification = mongoose.model('StudentGamification', gamificationSchema);
watchIndexBuild(StudentGamification);

export default StudentGamification;
