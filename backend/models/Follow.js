import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';

/**
 * One student following another. Written only by services/followService.js.
 *
 *   follower         the student who follows
 *   following        the student being followed
 *   followerActive   whether the follower's account is active; followingActive the same for the other side.
 *                    Counts and lists only include relationships whose other side is active, so a suspended,
 *                    blocked or closed account drops out of everyone's counts and comes back if it's restored.
 *                    Kept in step by followService.syncFollowVisibility() whenever an account's status changes.
 *
 * The unique index makes a relationship exist at most once however many follow requests arrive at the same
 * moment, so counts (countDocuments on the indexes below) never include duplicates.
 */
const followSchema = new mongoose.Schema(
  {
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    followerActive: { type: Boolean, default: true },
    followingActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

followSchema.index({ follower: 1, following: 1 }, { unique: true });
// A student's followers (count, and the list newest first).
followSchema.index({ following: 1, followerActive: 1, _id: -1 });
// Who a student follows (count, and the list newest first).
followSchema.index({ follower: 1, followingActive: 1, _id: -1 });

const Follow = mongoose.model('Follow', followSchema);
watchIndexBuild(Follow);

export default Follow;
