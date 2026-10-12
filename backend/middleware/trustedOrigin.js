import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/**
 * CSRF guard for endpoints that act on the refresh cookie. Browsers always send an
 * Origin header on cross-origin POSTs, so a request from another site is refused here
 * even when the browser attaches the cookie. Non-browser clients send no Origin and are
 * unaffected.
 */
export function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin || env.clientUrls.includes(origin)) return next();
  return next(ApiError.forbidden('Requests from this origin are not allowed.'));
}
