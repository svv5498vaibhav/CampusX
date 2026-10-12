import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import env from '../config/env.js';
import { BCRYPT_COST } from '../config/auth.js';
import User, { ACCOUNT_STATUSES, ROLES, toSafeUser } from '../models/User.js';
import { REVOKE_REASONS } from '../models/Session.js';
import ApiError from '../utils/ApiError.js';
import { signAccessToken } from '../utils/generateToken.js';
import * as accountDeletion from './accountDeletionService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { recordAccountLocked, recordLoginOutcome, recordSecurityEvent, recordUnknownAccountFailure, unknownAccountLock } from './securityService.js';
import {
  SESSION_EXPIRED_MESSAGE,
  createSession,
  revokeOtherSessions,
  revokeSessionById,
  revokeSessionByToken,
  rotateSession,
} from './sessionService.js';

const INVALID_CREDENTIALS = 'Invalid email or password.';
const EMAIL_TAKEN = 'An account with this email already exists.';

const STATUS_MESSAGES = {
  [ACCOUNT_STATUSES.PENDING]: 'Your account is waiting for verification.',
  [ACCOUNT_STATUSES.SUSPENDED]: 'Your account is temporarily suspended. Please contact CampusX support.',
  [ACCOUNT_STATUSES.BLOCKED]: 'Your account has been blocked. Please contact CampusX support.',
  [ACCOUNT_STATUSES.DEACTIVATED]: 'This account has been deactivated.',
  [ACCOUNT_STATUSES.DELETING]: 'This account is being deleted.',
};

/** Only active accounts may sign in or use the API. */
export function assertAccountActive(user) {
  if (user.status !== ACCOUNT_STATUSES.ACTIVE) {
    throw ApiError.forbidden(STATUS_MESSAGES[user.status] ?? 'This account cannot sign in right now.');
  }
}

// Compared against when an email is unknown, so both cases take the same time and
// response timing does not reveal which emails are registered. Computed once at startup.
const dummyHashPromise = bcrypt.hash(crypto.randomUUID(), BCRYPT_COST);
const dummyHash = () => dummyHashPromise;

/** The one password check: `user` must be loaded with `+passwordHash`. */
const passwordMatches = async (user, password) => Boolean(user.passwordHash) && bcrypt.compare(password, user.passwordHash);

const lockedMessage = (lockedUntil) => {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return `Too many failed sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

/** Counts a failed password and locks sign-in temporarily once the limit is reached. */
async function recordFailedLogin(userId, ip) {
  const { maxLoginAttempts, loginLockMinutes } = env.auth;
  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { failedLoginAttempts: 1 } },
    { returnDocument: 'after', projection: { failedLoginAttempts: 1 } },
  );

  if (updated && updated.failedLoginAttempts >= maxLoginAttempts) {
    const lockedUntil = new Date(Date.now() + loginLockMinutes * 60_000);
    // Reset the counter so the student gets a fresh set of attempts once the lock ends.
    await User.updateOne({ _id: userId }, { $set: { lockedUntil, failedLoginAttempts: 0 } });
    await recordAccountLocked(userId.toString(), { ip, attempts: updated.failedLoginAttempts, lockMinutes: loginLockMinutes });
    return lockedUntil;
  }
  return null;
}

async function issueTokens(user, meta) {
  const { session, refreshToken } = await createSession(user._id, meta);
  const accessToken = signAccessToken({ userId: user._id.toString(), sessionId: session._id.toString(), role: user.role });
  return { accessToken, refreshToken };
}

/**
 * Creates a student account and signs it in. Only the listed fields are read from
 * input, so role, status and verification flags always take their safe defaults.
 */
export async function register({ firstName, lastName, email, password }, meta) {
  const emailTakenError = () => ApiError.conflict(EMAIL_TAKEN, [{ field: 'email', message: EMAIL_TAKEN }]);

  if (await User.exists({ email })) throw emailTakenError();

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  let user;
  try {
    user = await User.create({ firstName, lastName, email, passwordHash, registrationIp: meta.ip ?? null });
  } catch (error) {
    // Two sign-ups racing for the same email: the unique index has the final say.
    if (error?.code === 11000 && error.keyPattern?.email) throw emailTakenError();
    throw error;
  }

  const tokens = await issueTokens(user, meta);
  return { user: toSafeUser(user), ...tokens };
}

/**
 * Signs in with email and password. Every failure answers the same way whether or not the email has an
 * account: the same message, a bcrypt comparison either way, and the same temporary lock after
 * MAX_LOGIN_ATTEMPTS wrong passwords (addresses without an account are counted by securityService).
 */
export async function login({ email, password }, meta) {
  const user = await User.findOne({ email }).select('+passwordHash +failedLoginAttempts +lockedUntil');

  if (!user) {
    const lockedUntil = await unknownAccountLock(email);
    if (lockedUntil) throw new ApiError(423, lockedMessage(lockedUntil));
    await bcrypt.compare(password, await dummyHash());
    const lockStarted = await recordUnknownAccountFailure(email);
    if (lockStarted) throw new ApiError(423, lockedMessage(lockStarted));
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, lockedMessage(user.lockedUntil));
  }

  if (!(await passwordMatches(user, password))) {
    const lockedUntil = await recordFailedLogin(user._id, meta.ip);
    if (lockedUntil) throw new ApiError(423, lockedMessage(lockedUntil));
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  // Status is only revealed to someone who knows the password.
  assertAccountActive(user);

  // A success right after several wrong passwords or a lockout is recorded (never refused).
  await recordLoginOutcome(user, { ip: meta.ip ?? null, failedAttempts: user.failedLoginAttempts ?? 0, lockedUntil: user.lockedUntil });

  const lastLoginAt = new Date();
  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt, lastLoginIp: meta.ip ?? null } },
  );
  user.lastLoginAt = lastLoginAt;

  const tokens = await issueTokens(user, meta);
  return { user: toSafeUser(user), ...tokens };
}

/** Rotates the refresh token and returns a new access token for the session's user. */
export async function refresh(refreshToken, meta) {
  const { session, refreshToken: nextRefreshToken } = await rotateSession(refreshToken, meta);

  const user = await User.findById(session.user);
  if (!user) {
    await revokeSessionById(session._id, REVOKE_REASONS.ACCOUNT_INACTIVE);
    throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);
  }

  try {
    assertAccountActive(user);
  } catch (error) {
    await revokeSessionById(session._id, REVOKE_REASONS.ACCOUNT_INACTIVE);
    throw error;
  }

  const accessToken = signAccessToken({ userId: user._id.toString(), sessionId: session._id.toString(), role: user.role });
  return { user: toSafeUser(user), accessToken, refreshToken: nextRefreshToken };
}

const WRONG_CURRENT_PASSWORD = 'Your current password is incorrect.';

/**
 * Changes the signed-in student's password. The current password must be right (a 422 field error,
 * never 401, so the app doesn't treat it as an expired session); the new one must differ. Every other
 * device is signed out (this one keeps its session), sign-in locks are cleared, the change is audited
 * and the student is notified. Returns { otherSessionsSignedOut }.
 */
export async function changePassword(userId, { currentPassword, newPassword }, { sessionId, ip }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);
  const fieldError = (field, message) => ApiError.unprocessable(message, [{ field, message }]);
  if (!(await passwordMatches(user, currentPassword))) {
    throw fieldError('currentPassword', WRONG_CURRENT_PASSWORD);
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw fieldError('newPassword', 'Choose a new password that is different from your current one.');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  // Only while the password is still the one just checked: of two changes racing, one wins and the
  // other finds its "current" password is no longer current.
  const { matchedCount } = await User.updateOne(
    { _id: user._id, passwordHash: user.passwordHash },
    { $set: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } },
  );
  if (matchedCount === 0) throw fieldError('currentPassword', WRONG_CURRENT_PASSWORD);
  const otherSessionsSignedOut = await revokeOtherSessions(user._id, sessionId, REVOKE_REASONS.PASSWORD_CHANGED);
  // "devices", not "sessions": security metadata redacts any key that looks like a session or token.
  await recordSecurityEvent('PASSWORD_CHANGED', { userId: user._id.toString(), ip, metadata: { otherDevicesSignedOut: otherSessionsSignedOut } });
  emitCampusEvent(CAMPUS_EVENTS.AUTH_PASSWORD_CHANGED, { userId: user._id.toString() });
  return { otherSessionsSignedOut };
}

export const WRONG_DELETION_PASSWORD = 'Your password is incorrect.';
export const STAFF_DELETION_REFUSED = "Moderator and admin accounts can't be deleted here. Ask a CampusX admin to remove your staff role first.";

/**
 * Permanently deletes the signed-in student's own account (always `userId` from the verified session, never
 * an id from the request). The password must be right (a 422 field error, never 401, so the app doesn't treat
 * it as an expired session); the typed confirmation is checked by the validator. Staff accounts are refused:
 * their role is granted by `npm run user:role` and their actions are referenced by the audit log.
 * The deletion itself: services/accountDeletionService.js. Returns { status: 'deleted' | 'scheduled' }.
 */
export async function deleteAccount(userId, { password }, { ip }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);
  if (user.role !== ROLES.STUDENT) throw ApiError.forbidden(STAFF_DELETION_REFUSED);
  if (!(await passwordMatches(user, password))) {
    throw ApiError.unprocessable(WRONG_DELETION_PASSWORD, [{ field: 'password', message: WRONG_DELETION_PASSWORD }]);
  }
  return accountDeletion.deleteAccount(user, { ip });
}

/** Ends the session behind the refresh cookie and/or the access token. Safe to call twice. */
export async function logout({ refreshToken, sessionId }) {
  await Promise.all([
    revokeSessionByToken(refreshToken, REVOKE_REASONS.LOGOUT),
    sessionId ? revokeSessionById(sessionId, REVOKE_REASONS.LOGOUT) : null,
  ]);
}
