import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';

export const REVOKE_REASONS = Object.freeze({
  LOGOUT: 'logout',
  TOKEN_REUSE: 'token_reuse',
  ACCOUNT_INACTIVE: 'account_inactive',
  // The password was changed on another device.
  PASSWORD_CHANGED: 'password_changed',
  // The owner deleted the account (used when the deletion finishes in the background).
  ACCOUNT_DELETED: 'account_deleted',
});

/**
 * One document per signed-in device. Only SHA-256 hashes of refresh tokens are stored,
 * so a database leak does not hand out working sessions. Access tokens carry this
 * document's id (`sid`), which lets logout revoke them immediately.
 */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    currentTokenHash: { type: String, required: true, unique: true },
    // The token rotated out most recently, kept to spot reuse of an old token.
    previousTokenHash: { type: String, default: null, index: true },
    rotatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: [...Object.values(REVOKE_REASONS), null], default: null },
    lastUsedAt: { type: Date, default: Date.now },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
);

// MongoDB deletes sessions automatically once they expire.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model('Session', sessionSchema);
watchIndexBuild(Session);

export default Session;
