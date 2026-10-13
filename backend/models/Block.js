import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';

/**
 * One student blocking another, for follows and direct messages: while a block exists in either direction
 * neither student can follow or message the other (and blocking ends any follow between them). Written only
 * by services/followService.js. The blocked student is never told.
 */
const blockSchema = new mongoose.Schema(
  {
    blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

// At most one block per pair and direction; also answers "has A blocked B?" (both directions are two lookups).
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
// Account deletion removes blocks against the account too.
blockSchema.index({ blocked: 1 });

const Block = mongoose.model('Block', blockSchema);
watchIndexBuild(Block);

export default Block;
