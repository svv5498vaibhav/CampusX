import { AUDIT_CATEGORIES, PERMISSIONS } from '../../config/adminConfig.js';
import { BCRYPT_COST, JWT_OPTIONS } from '../../config/auth.js';
import { isCloudinaryConfigured } from '../../config/cloudinary.js';
import { getDatabaseStatus } from '../../config/db.js';
import env from '../../config/env.js';
import { BYTES_PER_MB, MEDIA_PRESETS } from '../../config/media.js';
import { getRedisStatus } from '../../config/redis.js';
import { AUTH_RATE_LIMITS, REQUEST_RULES } from '../../config/securityConfig.js';
import { SOCKET_RULES } from '../../data/notificationOptions.js';
import ModerationAuditLog from '../../models/ModerationAuditLog.js';
import { getSocketStatus } from '../../sockets/socket.js';
import { securityEventCounters } from '../securityService.js';
import { assertPermission } from './adminAccess.js';

/*
 * GET /admin/security/status (admins: VIEW_SECURITY). How CampusX is protected right now, as facts the
 * server can state about itself: environment, service health, which protections are on, their limits,
 * and recent security events. Never: secrets, keys, connection strings, hosts, versions or file paths.
 */

const DAY = 24 * 60 * 60 * 1000;
const minutes = (ms) => Math.round(ms / 60_000);
const megabytes = (bytes) => Math.round((bytes / BYTES_PER_MB) * 10) / 10;

/** Upload rules per preset: accepted types and size limit (MB). */
const uploadRules = () =>
  Object.fromEntries(Object.entries(MEDIA_PRESETS).map(([name, preset]) => [name, { types: [...preset.allowedMimeTypes], maxMb: megabytes(preset.maxFileSize) }]));

/** Security events about accounts in the audit log over the last 24 hours, by type. */
async function recentAuditedEvents() {
  const rows = await ModerationAuditLog.aggregate([
    { $match: { createdAt: { $gte: new Date(Date.now() - DAY) }, action: { $in: [...AUDIT_CATEGORIES.security] } } },
    { $group: { _id: '$action', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(AUDIT_CATEGORIES.security.map((action) => [action, 0]));
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

export async function getSecurityStatus(actor) {
  assertPermission(actor, PERMISSIONS.VIEW_SECURITY);
  const redis = getRedisStatus();
  const sharedStore = redis === 'connected' ? 'redis' : 'memory';
  const { auth } = env;

  return {
    environment: env.nodeEnv,
    production: env.isProduction,
    checkedAt: new Date().toISOString(),
    services: {
      database: getDatabaseStatus(),
      redis,
      realtime: getSocketStatus(),
      cloudinary: isCloudinaryConfigured ? 'configured' : 'not_configured',
    },
    protections: {
      securityHeaders: { enabled: true, contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'", frameOptions: 'DENY', strictTransportSecurity: env.isProduction, referrerPolicy: 'no-referrer' },
      cors: { mode: 'allowlist', allowedOrigins: env.clientUrls.length, credentials: true },
      input: { mongoOperatorStripping: true, parameterPollution: true, requestScreening: true, bodyLimit: REQUEST_RULES.bodyLimit, maxDepth: REQUEST_RULES.maxDepth },
      responses: { defaultCacheControl: 'no-store', stackTracesInErrors: !env.isProduction },
      trustProxyHops: env.trustProxy,
    },
    authentication: {
      jwtSecret: auth.isJwtSecretEphemeral ? 'temporary_development_secret' : 'configured',
      algorithm: JWT_OPTIONS.algorithm,
      accessTokenMinutes: minutes(auth.accessTokenTtlMs),
      sessionDays: Math.round(auth.refreshTokenTtlMs / DAY),
      refreshCookie: { httpOnly: true, secure: auth.cookieSecure, sameSite: auth.cookieSameSite },
      passwordHashing: { algorithm: 'bcrypt', cost: BCRYPT_COST },
      accountLock: { attempts: auth.maxLoginAttempts, minutes: auth.loginLockMinutes, unknownEmailsToo: true },
    },
    rateLimits: {
      store: sharedStore,
      apiRequestsPer15MinutesPerAddress: env.rateLimitMax,
      failedSignInsPerAddress: { max: AUTH_RATE_LIMITS.login.max, windowMinutes: AUTH_RATE_LIMITS.login.windowMinutes },
      signUpsPerAddress: { max: AUTH_RATE_LIMITS.register.max, windowMinutes: AUTH_RATE_LIMITS.register.windowMinutes },
      socketHandshakesPerMinutePerAddress: SOCKET_RULES.handshakesPerMinute,
      socketConnectionsPerStudent: SOCKET_RULES.maxConnectionsPerUser,
    },
    uploads: { contentSniffing: true, fileNameChecks: true, pdfActiveContentCheck: true, presets: uploadRules() },
    events: { sinceStart: securityEventCounters(), auditedLast24Hours: await recentAuditedEvents() },
  };
}
