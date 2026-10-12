import User, { ROLES } from '../models/User.js';
import { assertAccountActive } from '../services/authService.js';
import { isAnonymousZoneRequest, recordSecurityEvent } from '../services/securityService.js';
import { SESSION_EXPIRED_MESSAGE, isSessionActive } from '../services/sessionService.js';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/generateToken.js';

const isObjectIdString = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

const readBearerToken = (req) => {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

/**
 * Requires a valid access token for an active account with a live session.
 * On success:
 *   req.user  the user loaded from the database (role and status come from here, never the token)
 *   req.auth  { sessionId }
 */
export async function authenticate(req, res, next) {
  const token = readBearerToken(req);
  if (!token) throw ApiError.unauthorized('Please log in to continue.');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    // Expiry is routine (the app renews the token); a bad signature, issuer or shape is not.
    if (error?.name !== 'TokenExpiredError') {
      const anonymousZone = isAnonymousZoneRequest(req);
      recordSecurityEvent('INVALID_TOKEN', {
        ip: anonymousZone ? null : req.ip,
        throttleKey: anonymousZone ? 'anonymous-zone' : null,
        metadata: { error: error?.name ?? 'unknown', path: req.baseUrl },
      });
    }
    throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);
  }
  if (!isObjectIdString(payload.sub) || !isObjectIdString(payload.sid)) throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);

  const [user, sessionActive] = await Promise.all([
    User.findById(payload.sub),
    isSessionActive(payload.sid, payload.sub),
  ]);

  if (!user || !sessionActive) throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);
  assertAccountActive(user);

  req.user = user;
  req.auth = { sessionId: payload.sid };
  next();
}

/**
 * For logout only: records the session behind an authentic access token (even an expired
 * one) without requiring authentication. The refresh cookie is the primary identifier.
 */
export function identifySession(req, res, next) {
  const token = readBearerToken(req);
  if (token) {
    try {
      req.auth = { sessionId: verifyAccessToken(token, { ignoreExpiration: true }).sid };
    } catch {
      // Forged or malformed token: ignore it and rely on the refresh cookie.
    }
  }
  next();
}

/**
 * Allows only the listed roles. Use after `authenticate`:
 *   router.get('/reports', authenticate, authorizeRoles(ROLES.ADMIN, ROLES.MODERATOR), handler)
 */
export function authorizeRoles(...allowedRoles) {
  const knownRoles = Object.values(ROLES);
  const unknown = allowedRoles.filter((role) => !knownRoles.includes(role));
  if (allowedRoles.length === 0 || unknown.length > 0) {
    throw new Error(`authorizeRoles needs known roles; got: ${allowedRoles.join(', ') || 'none'}`);
  }

  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Please log in to continue.'));
    if (!allowedRoles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
}
