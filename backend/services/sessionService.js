import mongoose from 'mongoose';
import env from '../config/env.js';
import { ROTATION_GRACE_MS } from '../config/auth.js';
import Session, { REVOKE_REASONS } from '../models/Session.js';
import ApiError from '../utils/ApiError.js';
import { generateRefreshToken, hashToken } from '../utils/generateToken.js';
import logger from '../utils/logger.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { recordSecurityEvent } from './securityService.js';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

const expiryFromNow = () => new Date(Date.now() + env.auth.refreshTokenTtlMs);

const clientMeta = ({ ip, userAgent }) => ({
  ip: ip ?? null,
  userAgent: userAgent ? userAgent.slice(0, 300) : null,
});

/** Starts a new device session and returns its first refresh token. */
export async function createSession(userId, meta) {
  const refreshToken = generateRefreshToken();
  const session = await Session.create({
    user: userId,
    currentTokenHash: hashToken(refreshToken),
    expiresAt: expiryFromNow(),
    ...clientMeta(meta),
  });
  return { session, refreshToken };
}

/**
 * Exchanges a refresh token for a new one (rotation). Returns `refreshToken: null` when
 * the presented token was rotated moments ago by a parallel request: the browser already
 * holds the new cookie, so only a fresh access token is needed.
 *
 * Presenting an older rotated token outside the grace window signals theft, so the whole
 * session is revoked.
 */
export async function rotateSession(refreshToken, meta) {
  if (!refreshToken) throw ApiError.unauthorized('Please log in to continue.');

  const presentedHash = hashToken(refreshToken);
  const now = new Date();
  const nextToken = generateRefreshToken();

  // Atomic: only one request can rotate a given token.
  const rotated = await Session.findOneAndUpdate(
    { currentTokenHash: presentedHash, revokedAt: null, expiresAt: { $gt: now } },
    {
      $set: {
        previousTokenHash: presentedHash,
        currentTokenHash: hashToken(nextToken),
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: expiryFromNow(),
        ...clientMeta(meta),
      },
    },
    { returnDocument: 'after' },
  );
  if (rotated) return { session: rotated, refreshToken: nextToken };

  const previous = await Session.findOne({ previousTokenHash: presentedHash });
  if (previous && !previous.revokedAt && previous.expiresAt > now) {
    if (now - previous.rotatedAt <= ROTATION_GRACE_MS) {
      return { session: previous, refreshToken: null };
    }
    await revokeSessionById(previous._id, REVOKE_REASONS.TOKEN_REUSE);
    logger.warn(`Refresh token reuse detected - session ${previous._id} revoked`);
    // Someone presented a token that was already exchanged: possibly stolen. Goes to the audit log.
    await recordSecurityEvent('REFRESH_TOKEN_REUSE', { userId: previous.user.toString(), ip: meta?.ip ?? null, metadata: { outcome: 'device_signed_out' } });
  }

  throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);
}

// Listeners (sockets/socket.js) close that device's live connections.
const announceEnded = (sessionId) => emitCampusEvent(CAMPUS_EVENTS.AUTH_SESSION_ENDED, { sessionId: sessionId.toString() });

export async function revokeSessionById(sessionId, reason) {
  if (!mongoose.isValidObjectId(sessionId)) return;
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
  announceEnded(sessionId);
}

export async function revokeSessionByToken(refreshToken, reason) {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  const session = await Session.findOneAndUpdate(
    { $or: [{ currentTokenHash: tokenHash }, { previousTokenHash: tokenHash }], revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
    { projection: { _id: 1 } },
  ).lean();
  if (session) announceEnded(session._id);
}

/** Ends every live session of a student except `keepSessionId` (and their live connections). Returns how many. */
export async function revokeOtherSessions(userId, keepSessionId, reason) {
  const sessions = await Session.find({ user: userId, revokedAt: null, ...(mongoose.isValidObjectId(keepSessionId) && { _id: { $ne: keepSessionId } }) }).select('_id').lean();
  await Promise.all(sessions.map((session) => revokeSessionById(session._id, reason)));
  return sessions.length;
}

export async function isSessionActive(sessionId, userId) {
  if (!mongoose.isValidObjectId(sessionId)) return false;
  const session = await Session.exists({
    _id: sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  return Boolean(session);
}
