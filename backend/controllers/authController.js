import { matchedData } from 'express-validator';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../config/auth.js';
import { toSafeUser } from '../models/User.js';
import { recordStaffSignIn } from '../services/admin/auditService.js';
import * as authService from '../services/authService.js';
import { sendSuccess } from '../utils/apiResponse.js';

const clientMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

const setRefreshCookie = (res, refreshToken) => res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

const clearRefreshCookie = (res) => {
  const { maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, options);
};

// Session responses must never be cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');

export async function register(req, res) {
  const { user, accessToken, refreshToken } = await authService.register(req.body, clientMeta(req));
  setRefreshCookie(res, refreshToken);
  noStore(res);
  return sendSuccess(res, { statusCode: 201, message: 'Account created successfully', data: { user, accessToken } });
}

export async function login(req, res) {
  const { user, accessToken, refreshToken } = await authService.login(req.body, clientMeta(req));
  // Moderator and admin sign-ins go to the admin audit log (students' don't).
  await recordStaffSignIn(user, req.ip);
  setRefreshCookie(res, refreshToken);
  noStore(res);
  return sendSuccess(res, { message: 'Logged in successfully', data: { user, accessToken } });
}

export async function refresh(req, res) {
  try {
    const { user, accessToken, refreshToken } = await authService.refresh(req.cookies?.[REFRESH_COOKIE_NAME], clientMeta(req));
    // refreshToken is null when a parallel request already rotated it; the browser holds the new cookie.
    if (refreshToken) setRefreshCookie(res, refreshToken);
    noStore(res);
    return sendSuccess(res, { message: 'Session refreshed', data: { user, accessToken } });
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
}

export async function logout(req, res) {
  await authService.logout({ refreshToken: req.cookies?.[REFRESH_COOKIE_NAME], sessionId: req.auth?.sessionId });
  clearRefreshCookie(res);
  noStore(res);
  return sendSuccess(res, { message: 'Logged out successfully' });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = matchedData(req, { locations: ['body'] });
  const result = await authService.changePassword(req.user._id, { currentPassword, newPassword }, { sessionId: req.auth?.sessionId, ip: req.ip });
  noStore(res);
  return sendSuccess(res, { message: 'Password changed. Your other devices were signed out.', data: result });
}

export function me(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Current user', data: { user: toSafeUser(req.user) } });
}
