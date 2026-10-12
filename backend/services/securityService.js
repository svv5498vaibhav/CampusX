import crypto from 'node:crypto';
import env from '../config/env.js';
import { ABUSE_PATTERN_RULES, LOGIN_RULES, REQUEST_RULES, SECURITY_EVENTS, SECURITY_EVENT_IDS } from '../config/securityConfig.js';
import logger from '../utils/logger.js';
import { SharedCounterStore } from '../utils/sharedCounterStore.js';
import { getCache, setCache } from './cacheService.js';
import { adjustRisk, writeAudit } from './moderationService.js';

/*
 * Security events and deterministic abuse rules (Phase 16). Rules live in config/securityConfig.js.
 *
 *   recordSecurityEvent()      one place that logs a security event (throttled), counts it for the admin
 *                              security status, and adds account-related events to the admin audit log
 *   sanitizeSecurityMetadata() what an event may carry: never passwords, tokens, secrets or emails
 *   checkRequestRisk()         prototype-pollution keys, NUL bytes, absurd nesting (request screening)
 *   detectSuspiciousLogin()    a successful sign-in right after failures or a lockout
 *   unknown-account lock       the same sign-in lock for addresses that have no account (no enumeration)
 *   recordRateLimitHit()       a limit was hit; repeated limit hits become an abuse pattern (Trust & Safety)
 *
 * Anonymous Zone: events about its limits never carry the student or their address, and never feed the
 * abuse pattern, so no log or flag can tie a student to anonymous activity at a point in time.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const ANONYMOUS_ZONE_PATH = `${env.apiPrefix}/anonymous`;

// ----------------------------------------------------------------------------- metadata

// Keys whose values never leave this module, whatever they hold.
const SENSITIVE_KEY = /pass|token|secret|authori[sz]ation|cookie|jwt|api[-_]?key|signature|credential|session|otp/i;
const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi;
const JWT_LIKE = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}\b/g;
const MAX_STRING = 200;

/**
 * A copy of `value` that is safe to log or store with a security event: sensitive keys are redacted,
 * email addresses and token-like strings are masked, and size is bounded (depth 3, 30 keys, 20 items).
 */
export function sanitizeSecurityMetadata(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.replace(JWT_LIKE, '[token]').replace(EMAIL, '[email]').slice(0, MAX_STRING);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value).slice(0, MAX_STRING);
  if (depth >= 3) return '[nested]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeSecurityMetadata(item, depth + 1));
  const copy = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    // Stored in MongoDB later: keys can't start with "$" or contain dots.
    const safeKey = key.replace(/^\$+/, '').replace(/\./g, '_').slice(0, 60) || '_';
    copy[safeKey] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeSecurityMetadata(item, depth + 1);
  }
  return copy;
}

// ----------------------------------------------------------------------------- events

// Per process, since start: shown by GET /admin/security/status (the audit log keeps the durable record).
const counters = new Map(SECURITY_EVENT_IDS.map((type) => [type, { seen: 0, recorded: 0, lastAt: null }]));

/** { [type]: { seen, recorded, lastAt } } since this API process started. */
export const securityEventCounters = () => Object.fromEntries([...counters].map(([type, counter]) => [type, { ...counter }]));

/**
 * Records a security event. `userId`: the account it concerns (account events go to the admin audit log,
 * Security category, as the automated system); `ip`: the client address; `metadata`: small facts (it is
 * sanitized here). The same event for the same subject is recorded at most once per throttle window.
 * Never throws: security bookkeeping must never change the response a request gets. Resolves to true
 * when the event was recorded, false when it was throttled or failed.
 */
export async function recordSecurityEvent(type, { userId = null, ip = null, metadata = {}, throttleKey = null } = {}) {
  const rule = SECURITY_EVENTS[type];
  if (!rule) {
    logger.warn(`Security: unknown event type "${type}"`);
    return false;
  }
  const counter = counters.get(type);
  counter.seen += 1;
  try {
    const subject = throttleKey ?? (userId ? `user:${userId}` : ip ? `ip:${ip}` : 'unknown');
    if (rule.throttleSeconds > 0) {
      const key = `security:event:${type}:${subject}`;
      if (await getCache(key)) return false;
      await setCache(key, 1, rule.throttleSeconds);
    }
    counter.recorded += 1;
    counter.lastAt = new Date().toISOString();

    const safe = sanitizeSecurityMetadata(metadata) ?? {};
    const details = Object.keys(safe).length ? ` ${JSON.stringify(safe)}` : '';
    logger.warn(`Security: ${type}${userId ? ` user=${userId}` : ''}${ip ? ` ip=${ip}` : ''}${details}`);
    if (rule.audit && userId) {
      await writeAudit({ action: type, targetType: 'user', targetId: userId, metadata: Object.keys(safe).length ? safe : undefined, ip });
    }
    return true;
  } catch (error) {
    logger.warn(`Security: ${type} could not be recorded (${error?.message ?? error})`);
    return false;
  }
}

// ----------------------------------------------------------------------------- request screening

const FORBIDDEN_KEYS = new Set(REQUEST_RULES.forbiddenKeys);

/**
 * Looks through a request's body, query and route params for what no CampusX client ever sends: keys
 * that reach an object's prototype (__proto__, constructor, prototype), NUL bytes, nesting deeper than
 * REQUEST_RULES.maxDepth, or more keys / longer arrays than allowed. Returns { reason } or null.
 */
export function checkRequestRisk({ body, query, params } = {}) {
  let keys = 0;
  const visit = (value, depth) => {
    if (typeof value === 'string') return value.includes('\u0000') ? 'nul_byte' : null;
    if (!value || typeof value !== 'object') return null;
    if (depth > REQUEST_RULES.maxDepth) return 'too_deep';
    if (Array.isArray(value)) {
      if (value.length > REQUEST_RULES.maxArrayLength) return 'array_too_long';
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const key of Object.keys(value)) {
      keys += 1;
      if (keys > REQUEST_RULES.maxKeys) return 'too_many_keys';
      if (FORBIDDEN_KEYS.has(key)) return 'forbidden_key';
      if (key.includes('\u0000')) return 'nul_byte';
      const found = visit(value[key], depth + 1);
      if (found) return found;
    }
    return null;
  };
  for (const part of [body, query, params]) {
    const reason = visit(part, 0);
    if (reason) return { reason };
  }
  return null;
}

// ----------------------------------------------------------------------------- sign-in protection

/** Accounts are never named in counters or logs: a short one-way hash of the normalised email instead. */
const emailKey = (email) => crypto.createHash('sha256').update(String(email ?? '').trim().toLowerCase()).digest('hex').slice(0, 32);
const unknownLockKey = (email) => `security:login-lock:${emailKey(email)}`;

// Failed passwords for addresses without an account, counted like an account's failedLoginAttempts.
const unknownAccountFailures = new SharedCounterStore('login-unknown-account');
unknownAccountFailures.init({ windowMs: 24 * HOUR_MS });

/** When sign-in for an address without an account is locked (as it would be for a real account), else null. */
export async function unknownAccountLock(email) {
  const until = await getCache(unknownLockKey(email));
  const date = until ? new Date(until) : null;
  return date && date > new Date() ? date : null;
}

/**
 * A wrong password for an address that has no account. After MAX_LOGIN_ATTEMPTS it is locked for
 * LOGIN_LOCK_MINUTES exactly like a real account, so "locked" never reveals that an account exists.
 * Returns the lock end when this attempt locked it.
 */
export async function recordUnknownAccountFailure(email) {
  const { maxLoginAttempts, loginLockMinutes } = env.auth;
  try {
    const key = emailKey(email);
    const { totalHits } = await unknownAccountFailures.increment(key);
    if (totalHits < maxLoginAttempts) return null;
    const lockedUntil = new Date(Date.now() + loginLockMinutes * MINUTE_MS);
    await setCache(unknownLockKey(email), lockedUntil.toISOString(), loginLockMinutes * 60);
    await unknownAccountFailures.resetKey(key);
    return lockedUntil;
  } catch (error) {
    logger.warn(`Security: sign-in counter failed (${error?.message ?? error})`);
    return null;
  }
}

/**
 * Why a successful sign-in deserves a look (never a reason to refuse it): it came right after several
 * failed passwords, or soon after the account was locked. `failedAttempts` and `lockedUntil` are the
 * account's values before this sign-in reset them. Returns a list of reasons (empty = nothing unusual).
 */
export function detectSuspiciousLogin({ failedAttempts = 0, lockedUntil = null, now = new Date() } = {}) {
  const reasons = [];
  if (failedAttempts >= LOGIN_RULES.suspiciousAfterFailures) reasons.push('after_failed_attempts');
  if (lockedUntil && now.getTime() - new Date(lockedUntil).getTime() < LOGIN_RULES.suspiciousAfterLockHours * HOUR_MS) {
    reasons.push('after_lockout');
  }
  return reasons;
}

/** Records the sign-in outcomes worth keeping: a lock that just started, or a suspicious success. */
export function recordAccountLocked(userId, { ip, attempts, lockMinutes }) {
  return recordSecurityEvent('ACCOUNT_LOCKED', { userId, ip, metadata: { attempts, lockMinutes } });
}

export async function recordLoginOutcome(user, { ip, failedAttempts, lockedUntil }) {
  const reasons = detectSuspiciousLogin({ failedAttempts, lockedUntil });
  if (reasons.length) await recordSecurityEvent('SUSPICIOUS_LOGIN', { userId: user._id.toString(), ip, metadata: { reasons, failedAttempts, role: user.role } });
  return reasons;
}

// ----------------------------------------------------------------------------- rate limits and abuse

const abuseHits = new SharedCounterStore('security-abuse');
abuseHits.init({ windowMs: ABUSE_PATTERN_RULES.windowHours * HOUR_MS });

/**
 * A student hit limits on sensitive actions in `threshold` separate limit episodes within the window:
 * recorded once per window, with a small Trust & Safety risk bump and the `rate_limit_abuse` flag
 * (staff see it on the student's trust profile). Deterministic and never a ban. Returns true when the
 * pattern was found.
 */
export async function detectAbusePattern(userId, source) {
  try {
    const { totalHits } = await abuseHits.increment(`user:${userId}`);
    if (totalHits < ABUSE_PATTERN_RULES.threshold) return false;
    const recorded = await recordSecurityEvent('ABUSE_PATTERN', {
      userId,
      metadata: { source, limitEpisodes: totalHits, windowHours: ABUSE_PATTERN_RULES.windowHours },
    });
    if (recorded) await adjustRisk(userId, ABUSE_PATTERN_RULES.riskPoints, ABUSE_PATTERN_RULES.flag);
    return true;
  } catch (error) {
    logger.warn(`Security: abuse check failed (${error?.message ?? error})`);
    return false;
  }
}

/**
 * A request was refused by a rate limiter (`limiter`: its name). Signed-in students: recorded once per
 * limiter per hour, and each recorded episode counts toward the abuse pattern. Without an account the
 * address is logged instead. `anonymousZone`: nothing identifying is kept at all (see the top of this file).
 */
const pathOf = (req) => String(req.originalUrl ?? '').split('?')[0];

/** Requests to the Anonymous Zone API: their security events keep neither the student nor the address. */
export const isAnonymousZoneRequest = (req) => pathOf(req).startsWith(ANONYMOUS_ZONE_PATH);

export async function recordRateLimitHit(req, limiter, { anonymousZone = false } = {}) {
  const path = pathOf(req);
  // Shared limiters (photo uploads, likes) also guard Anonymous Zone routes: the path decides too.
  if (anonymousZone || isAnonymousZoneRequest(req)) {
    return recordSecurityEvent('RATE_LIMIT_EXCEEDED', { throttleKey: `anonymous-zone:${limiter}`, metadata: { limiter, area: 'anonymous-zone' } });
  }
  const userId = req.user?._id?.toString() ?? null;
  const recorded = await recordSecurityEvent('RATE_LIMIT_EXCEEDED', {
    userId,
    ip: req.ip,
    throttleKey: `${userId ? `user:${userId}` : `ip:${req.ip}`}:${limiter}`,
    metadata: { limiter, method: req.method, path: path.slice(0, 80) },
  });
  // Staff have no Trust & Safety profile worth bumping; only students' repeated limit hits count.
  if (recorded && userId && req.user.role === 'student') await detectAbusePattern(userId, limiter);
  return recorded;
}

/** An upload was refused for its name or content (`reason`). Server log only. */
export function recordRejectedUpload(req, reason) {
  const anonymousZone = isAnonymousZoneRequest(req);
  return recordSecurityEvent('UPLOAD_REJECTED', {
    ip: anonymousZone ? null : req.ip,
    throttleKey: `${anonymousZone ? 'anonymous-zone' : `ip:${req.ip}`}:${reason}`,
    metadata: { reason, ...(anonymousZone && { area: 'anonymous-zone' }) },
  });
}
