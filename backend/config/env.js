import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PLACEHOLDER_SECRET_PATTERN } from './securityConfig.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const toList = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback;
};

const DURATION_UNITS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** "15m" → 900000. Returns NaN for anything else so validateEnv() can report it. */
const toDurationMs = (value) => {
  const match = /^(\d+)\s*([smhd])$/.exec(String(value).trim());
  return match ? Number(match[1]) * DURATION_UNITS[match[2]] : Number.NaN;
};

// Development may run without JWT_SECRET: a random per-process secret is used and
// access tokens simply stop working after a restart (the refresh cookie renews them).
// Production never gets a generated secret: validateEnv() refuses to start without one.
const jwtSecretFromEnv = process.env.JWT_SECRET || '';
const developmentSecret = () => (isProduction ? '' : crypto.randomBytes(48).toString('hex'));

const cookieSameSite = (process.env.COOKIE_SAME_SITE || (isProduction ? 'none' : 'lax')).toLowerCase();

/** Single source of configuration. Other modules import this instead of reading process.env. */
const env = Object.freeze({
  nodeEnv,
  isProduction,
  isDevelopment: nodeEnv === 'development',
  backendRoot,
  uploadsDir: path.join(backendRoot, 'uploads'),
  port: toNumber(process.env.PORT, 5000),
  apiPrefix: '/api/v1',
  mongodbUri: process.env.MONGODB_URI || '',
  // Optional DNS servers for mongodb+srv lookups (see config/db.js). Empty = system DNS.
  dnsServers: toList(process.env.DNS_SERVERS),
  clientUrls: toList(process.env.CLIENT_URL || 'http://localhost:5173'),
  redisUrl: process.env.REDIS_URL || '',
  // Number of reverse proxies in front of the API (e.g. 1 on Render/Railway/Nginx).
  trustProxy: toNumber(process.env.TRUST_PROXY, 0),
  // Requests per 15 minutes per IP across the whole API. Kept generous because a college
  // network often puts hundreds of students behind one public IP.
  rateLimitMax: toNumber(process.env.RATE_LIMIT_MAX, 1000),
  // Day/week/month boundaries for points, streaks and weekly/monthly rankings (IANA time zone).
  // CampusX serves Indian colleges, so India Standard Time (no daylight saving) is the default.
  gamificationTimezone: process.env.GAMIFICATION_TIMEZONE || 'Asia/Kolkata',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  // Resume Builder's optional AI assistant (Google Gemini). Server side only: the key is never sent to the
  // browser. Without GEMINI_API_KEY (or with RESUME_AI_ENABLED=false) the builder works without AI.
  resumeAi: {
    enabled: (process.env.RESUME_AI_ENABLED || 'true').toLowerCase() !== 'false',
    apiKey: (process.env.GEMINI_API_KEY || '').trim(),
    model: process.env.RESUME_AI_MODEL || 'gemini-3.5-flash-lite',
    // Only for a proxy or a test stand-in; empty = the Gemini API.
    baseUrl: process.env.GEMINI_BASE_URL || '',
  },
  auth: {
    jwtSecret: jwtSecretFromEnv || developmentSecret(),
    isJwtSecretEphemeral: !jwtSecretFromEnv,
    accessTokenTtlMs: toDurationMs(process.env.JWT_EXPIRES_IN || '15m'),
    refreshTokenTtlMs: toDurationMs(process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'),
    maxLoginAttempts: toNumber(process.env.MAX_LOGIN_ATTEMPTS, 5),
    loginLockMinutes: toNumber(process.env.LOGIN_LOCK_MINUTES, 15),
    cookieSameSite,
    // SameSite=None is only accepted by browsers on Secure cookies.
    cookieSecure: isProduction || cookieSameSite === 'none',
  },
});

const REQUIRED_IN_PRODUCTION = ['MONGODB_URI', 'JWT_SECRET', 'CLIENT_URL'];
const MIN_PRODUCTION_SECRET_LENGTH = 32;
const MAX_PRODUCTION_ACCESS_TOKEN_MS = 60 * 60 * 1000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** "https://campusx.app" → true; "*", "null", paths, credentials or other schemes → false. */
function isExactOrigin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}

/** Called first during startup so misconfiguration fails with one clear message. */
export function validateEnv() {
  const problems = [];

  if (isProduction) {
    const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]);
    if (missing.length > 0) problems.push(`Missing required environment variables: ${missing.join(', ')}`);
    if (jwtSecretFromEnv && jwtSecretFromEnv.length < MIN_PRODUCTION_SECRET_LENGTH) {
      problems.push(`JWT_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`);
    }
    // Values copied from .env.example ("replace_with_secure_secret") are not secrets.
    const placeholders = ['JWT_SECRET', 'CLOUDINARY_API_SECRET'].filter((name) => process.env[name] && PLACEHOLDER_SECRET_PATTERN.test(process.env[name]));
    if (placeholders.length > 0) problems.push(`Replace the example values of ${placeholders.join(', ')} with real secrets`);
  }

  // Credentials are sent cross-origin, so CORS must name each frontend origin exactly: never "*".
  for (const origin of env.clientUrls) {
    if (!isExactOrigin(origin)) {
      problems.push(`CLIENT_URL must list exact origins such as https://campusx.example.com (got "${origin}")`);
    } else if (isProduction && origin.startsWith('http:') && !LOCAL_HOSTS.has(new URL(origin).hostname)) {
      problems.push(`CLIENT_URL origins must use https in production (got "${origin}")`);
    }
  }
  if (!(Number.isInteger(env.trustProxy) && env.trustProxy >= 0)) problems.push('TRUST_PROXY must be a whole number (0 when not behind a proxy)');

  const { auth } = env;
  if (Number.isNaN(auth.accessTokenTtlMs)) problems.push('JWT_EXPIRES_IN must look like 15m, 1h or 7d');
  // Access tokens can't be revoked mid-flight by every client, so production keeps them short; the
  // refresh cookie renews them silently.
  if (isProduction && auth.accessTokenTtlMs > MAX_PRODUCTION_ACCESS_TOKEN_MS) problems.push('JWT_EXPIRES_IN must be 1h or less in production');
  if (Number.isNaN(auth.refreshTokenTtlMs)) problems.push('REFRESH_TOKEN_EXPIRES_IN must look like 7d or 12h');
  if (!(env.rateLimitMax >= 1)) problems.push('RATE_LIMIT_MAX must be 1 or more');
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: env.gamificationTimezone });
  } catch {
    problems.push('GAMIFICATION_TIMEZONE must be an IANA time zone such as Asia/Kolkata');
  }
  if (!(auth.maxLoginAttempts >= 1)) problems.push('MAX_LOGIN_ATTEMPTS must be 1 or more');
  if (!(auth.loginLockMinutes > 0)) problems.push('LOGIN_LOCK_MINUTES must be greater than 0');
  if (!['lax', 'strict', 'none'].includes(auth.cookieSameSite)) problems.push('COOKIE_SAME_SITE must be lax, strict or none');

  if (problems.length > 0) {
    throw new Error(problems.join('; '));
  }
}

/** Settings that work in development but would be refused in production (logged at startup). */
export function developmentWarnings() {
  if (isProduction) return [];
  const warnings = [];
  if (jwtSecretFromEnv && jwtSecretFromEnv.length < MIN_PRODUCTION_SECRET_LENGTH) {
    warnings.push(`JWT_SECRET is shorter than ${MIN_PRODUCTION_SECRET_LENGTH} characters; production requires a longer one`);
  }
  return warnings;
}

export default env;
