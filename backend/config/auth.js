import env from './env.js';

// bcrypt work factor: ~0.3s per hash on a typical laptop, a sound balance for login latency.
export const BCRYPT_COST = 12;

// bcrypt ignores everything after 72 bytes, so longer passwords are rejected rather than truncated.
export const PASSWORD_MAX_BYTES = 72;

export const JWT_OPTIONS = Object.freeze({
  algorithm: 'HS256',
  issuer: 'campusx-api',
  audience: 'campusx-app',
});

export const REFRESH_COOKIE_NAME = 'cx_refresh';

// A refresh token used again within this window right after rotation (two tabs refreshing at
// once) is treated as a race, not as theft.
export const ROTATION_GRACE_MS = 30_000;

/**
 * The refresh cookie is HttpOnly (unreadable by JavaScript) and scoped to the auth routes, so
 * it is never sent with ordinary API requests.
 */
export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.auth.cookieSecure,
  sameSite: env.auth.cookieSameSite,
  path: `${env.apiPrefix}/auth`,
  maxAge: env.auth.refreshTokenTtlMs,
});
