import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { JWT_OPTIONS } from '../config/auth.js';

/**
 * Short-lived access token. The payload holds only identifiers:
 *   sub  user id
 *   sid  session id (lets logout revoke the token before it expires)
 *   role informational only; the auth middleware always reloads the role from the database
 */
export function signAccessToken({ userId, sessionId, role }) {
  return jwt.sign({ sid: sessionId, role }, env.auth.jwtSecret, {
    ...JWT_OPTIONS,
    subject: userId,
    expiresIn: Math.floor(env.auth.accessTokenTtlMs / 1000),
  });
}

/**
 * Throws jsonwebtoken errors (expired, bad signature, wrong issuer/audience, ...).
 * `ignoreExpiration` is only for logout, where an expired but authentic token still
 * identifies which session to end.
 */
export function verifyAccessToken(token, { ignoreExpiration = false } = {}) {
  return jwt.verify(token, env.auth.jwtSecret, {
    algorithms: [JWT_OPTIONS.algorithm],
    ignoreExpiration,
    issuer: JWT_OPTIONS.issuer,
    audience: JWT_OPTIONS.audience,
  });
}

/** Opaque, high-entropy refresh token. Only its hash is stored server-side. */
export const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
