/**
 * Security rules (Phase 16), in one place: request screening, sign-in protection, security events,
 * abuse detection and upload file names. Deterministic rules only: no scores learned from data.
 * services/securityService.js and the middleware read from here; nothing else hardcodes these values.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * Request screening (middleware/sanitizeMiddleware.js), on top of express-mongo-sanitize and hpp:
 * keys that could reach an object's prototype, NUL bytes and absurdly deep or wide JSON are refused
 * with 400 before any route runs. Legitimate CampusX requests are far below these limits.
 */
export const REQUEST_RULES = Object.freeze({
  // JSON/form bodies only; file uploads go through multer with their own limits (config/media.js).
  bodyLimit: '100kb',
  forbiddenKeys: Object.freeze(['__proto__', 'constructor', 'prototype']),
  maxDepth: 8,
  maxKeys: 500,
  maxArrayLength: 500,
});

/**
 * Sign-in protection. The per-account lock (MAX_LOGIN_ATTEMPTS / LOGIN_LOCK_MINUTES in backend/.env)
 * also applies to email addresses that have no account, so a locked response never tells anyone
 * whether an address is registered. `suspicious*` decide when a successful sign-in is recorded as a
 * security event (it is never refused for it).
 */
/**
 * Per-address limits on the sign-in and sign-up endpoints (middleware/rateLimiter.js). A whole college
 * network can share one address, so these stop automated guessing rather than throttle a busy campus;
 * the per-account lock is the main defence against password guessing. Only failed sign-ins count.
 */
export const AUTH_RATE_LIMITS = Object.freeze({
  login: { windowMinutes: 15, max: 20 },
  register: { windowMinutes: 60, max: 15 },
  // Per signed-in student: every attempt counts, so a stolen access token can't be used to guess the
  // current password.
  passwordChange: { windowMinutes: 15, max: 5 },
});

export const LOGIN_RULES = Object.freeze({
  // A successful sign-in right after at least this many failed passwords is recorded.
  suspiciousAfterFailures: 3,
  // ...or within this many hours after the account was locked.
  suspiciousAfterLockHours: 24,
});

/**
 * Security events (services/securityService.js). `audit`: written to the admin audit log (Security
 * category) when the event concerns a known account; others go to the server log only. `throttleSeconds`:
 * the same event for the same account or address is recorded at most once in that window, so a flood
 * can't flood the log too.
 */
export const SECURITY_EVENTS = Object.freeze({
  ACCOUNT_LOCKED: { audit: true, throttleSeconds: 5 * MINUTE },
  SUSPICIOUS_LOGIN: { audit: true, throttleSeconds: 10 * MINUTE },
  REFRESH_TOKEN_REUSE: { audit: true, throttleSeconds: 0 },
  PASSWORD_CHANGED: { audit: true, throttleSeconds: 0 },
  RATE_LIMIT_EXCEEDED: { audit: true, throttleSeconds: HOUR },
  ABUSE_PATTERN: { audit: true, throttleSeconds: 24 * HOUR },
  INVALID_TOKEN: { audit: false, throttleSeconds: 10 * MINUTE },
  REQUEST_REJECTED: { audit: false, throttleSeconds: 10 * MINUTE },
  UPLOAD_REJECTED: { audit: false, throttleSeconds: 10 * MINUTE },
});
export const SECURITY_EVENT_IDS = Object.freeze(Object.keys(SECURITY_EVENTS));

/**
 * Abuse pattern: a student who keeps hitting the limits on sensitive actions (reports, Anonymous Zone,
 * search, uploads, ...) `threshold` times within `windowHours` gets a small Trust & Safety risk bump and
 * the `rate_limit_abuse` flag (moderationService.adjustRisk), once per window. Never a ban.
 */
export const ABUSE_PATTERN_RULES = Object.freeze({
  threshold: 3,
  windowHours: 24,
  riskPoints: 5,
  flag: 'rate_limit_abuse',
});

/**
 * Upload file names. Content is always checked by its first bytes (utils/mediaSignature.js); the name
 * must also look like what it claims to be. A name may have no extension (some browsers send "blob").
 */
export const UPLOAD_NAME_RULES = Object.freeze({
  maxLength: 200,
  extensionsByType: Object.freeze({
    'image/jpeg': Object.freeze(['jpg', 'jpeg', 'jpe', 'jfif']),
    'image/png': Object.freeze(['png']),
    'image/webp': Object.freeze(['webp']),
    'video/mp4': Object.freeze(['mp4', 'm4v']),
    'video/webm': Object.freeze(['webm']),
    'application/pdf': Object.freeze(['pdf']),
  }),
  // The last extension must be one of the allowed ones above. These are also refused in the middle of a
  // name ("photo.php.jpg", "cv.exe.pdf"): programs and server scripts disguised as images or documents.
  // Everyday words that happen to be extensions (com, app, js: "example.com.png", "Node.js.png") are not listed.
  disguisedExtensions: Object.freeze([
    'exe', 'dll', 'bat', 'cmd', 'msi', 'scr', 'pif', 'cpl', 'jar', 'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'ps1', 'psm1',
    'php', 'phtml', 'php3', 'php4', 'php5', 'phar', 'asp', 'aspx', 'jsp', 'jspx', 'cgi', 'hta', 'lnk', 'reg', 'apk',
  ]),
});

/** PDF proof files carrying any of these (after decoding #xx name escapes) are refused: scripts, launch actions, attachments. */
export const PDF_ACTIVE_CONTENT = Object.freeze(['/JavaScript', '/Launch', '/EmbeddedFile', '/RichMedia']);

/** Placeholder values that must never be used as secrets in production. */
export const PLACEHOLDER_SECRET_PATTERN = /replace|change[_-]?me|your[_-]|example|placeholder|^secret$|^password$/i;
