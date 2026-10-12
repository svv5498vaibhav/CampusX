# CampusX security checklist

Phase 16 (security and production hardening). Each item names where the control lives, so it can be
re-checked when the code changes. `[x]` means implemented and covered by the Phase 16 test suites;
open items are listed under [Known gaps](#known-gaps) at the end.

All rules are deterministic. Security rules live in `backend/config/securityConfig.js`, admin
permissions in `backend/config/adminConfig.js`, Trust & Safety limits in `backend/config/moderationLimits.js`.

## Checklist

- [x] **Authentication**
  - Short-lived JWT access token (`JWT_EXPIRES_IN`, 15 min default, at most 1 h in production) sent in the
    `Authorization` header and kept only in frontend memory (never `localStorage`).
  - Every authenticated request reloads the user and checks that the token's session is still live
    (`middleware/authMiddleware.js`), so logout, refresh-token reuse and suspension take effect at once.
  - Only `active` accounts can sign in or use the API. `suspended`, `blocked`, `deactivated` and `pending`
    get 403; their status is only revealed to someone who knows the password.
  - Socket.IO handshakes use the same checks (`sockets/socketAuth.js`).

- [x] **Authorization**
  - Roles `student`, `moderator`, `admin` always come from the database, never from the token, the body or
    headers. Public sign-up always creates students; staff roles are granted only by
    `npm run user:role` (audited as `ROLE_CHANGED`).
  - Admin API: `requireDatabase → authenticate → requireStaff → per-staff rate limit → requirePermission`,
    then each admin service checks the permission again (`services/admin/adminAccess.js`).
  - Moderators get dashboard, reports, moderation, content, opportunities and the audited anonymous-author
    reveal; admins get everything (including `VIEW_SECURITY`). Refusals are 403 and audited (`ACCESS_DENIED`).
  - Ownership is enforced in the service layer: the signed-in student (`req.user`) is the only owner a
    request can act as. `userId`, `authorId`, `author`, `role` and similar fields in requests are ignored.

- [x] **JWT security**
  - HS256 only (the algorithm is pinned on verify, so `alg: none` and algorithm confusion fail), with
    issuer and audience checks. The payload holds ids only.
  - `JWT_SECRET` is required in production (32+ characters, example values refused); production never
    generates a secret. Development may use a temporary per-process secret and warns about short secrets.
  - Forged or malformed tokens are logged as `INVALID_TOKEN` (address only, throttled); expiry is routine.
  - Refresh tokens: 48 random bytes, stored only as SHA-256 hashes, rotated on every use, in an HttpOnly
    cookie scoped to `/api/v1/auth` (Secure + SameSite=None in production). Reusing a rotated token
    after 30 s signs the device out and is audited (`REFRESH_TOKEN_REUSE`).

- [x] **Password security**
  - bcrypt, cost 12. 8–72 bytes, at least one letter and one number, a short list of common passwords
    refused, confirmation must match. No other composition rules (better UX, same strength).
  - Password hashes, login counters, IP addresses and Cloudinary ids are excluded by an allow-list
    serializer (`toSafeUser`) and by `select: false`; they never appear in responses or logs.
  - Password change (`PUT /auth/password`, Phase 17): the current password must be right (422 field error,
    never 401), the new one must differ; 5 attempts per 15 minutes per student; every other session is
    revoked (sockets too), this device stays signed in; audited as `PASSWORD_CHANGED` (device count, no
    secrets) and the student is notified. The update only applies while the stored hash is still the one
    that was checked, so of several simultaneous changes exactly one wins (Phase 17 QA-03). There is no
    password reset yet (see Known gaps).

- [x] **Account deletion** (`DELETE /auth/account`, `services/accountDeletionService.js`, rules in
  `ACCOUNT_DELETION` of `config/securityConfig.js`)
  - Only the signed-in account (id from the verified token; no id in the path, ids in the body ignored).
    Current password checked against the bcrypt hash through the same helper as sign-in and password change
    (wrong → 422 field error, never 401) plus the typed word `DELETE`, both validated on the server. The
    password is never stored or logged. Origin-checked (it clears the refresh cookie). 5 attempts per 15 minutes
    per student, every attempt counted. Staff accounts are refused (403).
  - The account is locked first (`status: "deleting"`, only while the checked password is still current), so
    REST, refresh, sign-in and socket handshakes are refused at once; then everything is removed in one MongoDB
    transaction where supported (a failure rolls back and reopens the account, session kept). Without
    transactions every step is idempotent and the locked account is finished by `jobs/accountDeletionCleanup.js`.
    The user document goes last; "deleted" is only answered once it is gone.
  - All sessions are removed and every live socket of the account is closed (`AUTH_ACCOUNT_DELETED`); the
    refresh cookie is cleared. The frontend drops its token, session hint, stores and per-account local data.
  - Cloudinary files are removed only after no record points at them; failures are retried with backoff and
    finally logged for manual cleanup (`accountdeletions` keeps the ids, nothing personal, 30 days).
  - Kept for safety: reports filed, reports/cases/audit rows about the account (ids only). Anonymous Zone content
    is left untouched so the deletion can't reveal who wrote it. Audited as `ACCOUNT_DELETED` (counts only).
  - Tests: `tests/api/account-deletion.mjs` (incl. a real replica set for commit/rollback),
    `tests/browser/account-deletion.mjs`.

- [x] **Brute-force protection**
  - Per account: `MAX_LOGIN_ATTEMPTS` (5) wrong passwords lock sign-in for `LOGIN_LOCK_MINUTES` (15).
    The lock is temporary; the counter resets after it. Audited as `ACCOUNT_LOCKED`.
  - Email addresses without an account get exactly the same answers and lock (counted by
    `services/securityService.js`), so neither the message nor the lock reveals who is registered.
  - Per address: 20 failed sign-ins / 15 min and 15 sign-ups / hour (`AUTH_RATE_LIMITS`).
  - A successful sign-in right after 3+ failures or within 24 h of a lock is recorded as
    `SUSPICIOUS_LOGIN` (never refused).

- [x] **Rate limiting**
  - Whole API: `RATE_LIMIT_MAX` per 15 min per address (generous: campus networks share addresses).
  - Per student: posts, comments, uploads, likes, reports, Anonymous Zone posts/comments/reports, search,
    suggestions, history, communities, projects/achievements, notifications, recommendations, admin
    requests/actions/reveals. Socket handshakes per address and connections per student.
  - Counters live in Redis when connected (shared across instances) and fall back to process memory.
  - Every refusal is a security event (`RATE_LIMIT_EXCEEDED`, once per limiter per hour per student).
    Three separate limit episodes in 24 h become `ABUSE_PATTERN`: a small Trust & Safety risk bump and the
    `rate_limit_abuse` flag (never a ban).

- [x] **Input validation**
  - express-validator rules on every route that takes input; controllers read `matchedData()` only.
  - Pagination is bounded everywhere (page ≤ 1000, page sizes capped per list); ids are validated
    (`isMongoId`/`toObjectId`), and malformed ids answer 4xx, never 500.
  - Request screening (`middleware/sanitizeMiddleware.js`): `__proto__`/`constructor`/`prototype` keys,
    NUL bytes, JSON nested deeper than 8 levels, more than 500 keys or arrays longer than 500 → 400.
  - 100 kB body limit for JSON/forms; uploads have their own limits.

- [x] **NoSQL injection protection**
  - `express-mongo-sanitize` strips `$`-operator and dotted keys from bodies, queries and multipart fields;
    validators require strings where strings are expected; Mongoose `strictQuery`.
  - Search text is escaped before it is used in a regular expression; `$text` queries use literal words.

- [x] **XSS protection**
  - React renders all user content as text; the frontend has no `dangerouslySetInnerHTML`, `innerHTML` or
    `eval`. Post links are made clickable only for `http(s)` URLs.
  - Projects, achievements, communities and anonymous posts refuse HTML tags; posts and comments keep
    `<` as plain text (students write code), which React escapes.
  - API responses are JSON with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`.

- [x] **CORS**
  - Explicit allow-list from `CLIENT_URL`, credentials enabled. `*`, paths and malformed origins are refused
    at startup; production requires `https` origins (localhost excepted). Unknown origins get no CORS headers.
  - Shared by Express and Socket.IO. Preflights cached for 10 minutes.
  - CSRF: the cookie endpoints (register, login, refresh, logout) refuse a foreign `Origin`
    (`middleware/trustedOrigin.js`); every other endpoint needs the `Authorization` header, which browsers
    never attach on their own.

- [x] **Helmet / security headers** (`app.js`)
  - CSP `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` (the API is never a page),
    `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, no `X-Powered-By`,
    HSTS (1 year, subdomains) in production only.
  - `Cache-Control: no-store` on every API response unless a route deliberately allows private caching
    (option lists: `private, max-age=300`).

- [x] **File upload security** (`middleware/uploadMiddleware.js`, `utils/uploadSafety.js`)
  - Allowed: JPG/JPEG/PNG/WEBP images, MP4/WEBM post videos, PDF achievement proof. Declared type, file name
    and the file's first bytes must all agree with the allowed list; SVG, executables and scripts are refused.
  - File names: the last extension must be allowed; disguised names (`photo.php.jpg`, `cv.exe.pdf`), control
    characters and paths are refused. A name without an extension is accepted (content decides).
  - PDFs with JavaScript, launch actions, embedded files or rich media are refused (`/J#61vaScript`-style
    escapes are decoded first).
  - Size limits per preset (2–10 MB images and PDFs, 50 MB video), file/field counts limited.
  - Temporary files get CampusX's own random names in `backend/uploads` and are deleted after every request;
    nothing from the client's file name reaches the file system. Uploaded files are never executed or
    served by the API; Cloudinary serves them from its own domain, images through transformations.
  - Malformed multipart bodies answer 400 (never 500). Refusals are logged as `UPLOAD_REJECTED`.

- [x] **URL security**
  - Project, achievement and opportunity links must be absolute `http(s)` URLs with a real host; `javascript:`,
    `data:`, `vbscript:`, `file:` are refused; opportunity links may not embed credentials. Links are stored as
    entered (trimmed), never rewritten.
  - The frontend opens external links only through `safeExternalUrl()` (`frontend/src/utils/url.js`) with
    `rel="noopener noreferrer"`.
  - Trust & Safety still scores suspicious links in content (shorteners, IP hosts, look-alike domains).

- [x] **Anonymous privacy**
  - The author is stored server-side only (`select: false`), set from the session; responses are built
    from allow-lists that never include it. Search matches title/content only; recommendations, rankings and
    notifications never carry or count it ("Someone commented on your anonymous post").
  - Staff screens show "anonymous". The only way to learn an author is the audited reveal
    (`POST /admin/moderation/:id/reveal-author`: permission + reason + 20/hour, logged as `ANONYMOUS_AUTHOR_REVEALED`).
  - Audit rows that would tie a student to anonymous content are hidden or de-identified (Phase 15).
  - Phase 16 security events about Anonymous Zone requests keep neither the student nor the address, and
    never feed the abuse pattern.

- [x] **Admin security**
  - Permission checks on every route and again in every service; sensitive actions need a reason and an
    explicit `confirm: true`; nobody can change their own status or an admin's; moderators' accounts need
    `MANAGE_SYSTEM`. Status changes away from `active` revoke every session and disconnect live sockets.
  - Per-staff limits on requests, actions and reveals; responses are `no-store`.
  - `GET /admin/security/status` (admins, `VIEW_SECURITY`): environment, service health, protections,
    limits and recent security events. Never secrets, keys, connection strings, hosts or file paths.

- [x] **Socket security**
  - Handshake: valid access token (from the `auth` payload, never the URL), active account, live session,
    handshake rate limit per address, connection cap per student. Anything else the client sends
    (`userId`, `role`, rooms) is ignored.
  - Rooms are joined only by the server from the verified identity: `user:<id>`, `session:<id>`, and `staff`
    for moderators/admins. Clients can't join rooms and the server registers no client events.
  - Before each staff broadcast the staff room is re-checked against the database: demoted accounts leave
    it, suspended accounts and ended sessions are disconnected. Logout/suspension disconnects at once;
    every connection ends when its access token expires.
  - Incoming messages are capped at 16 KB.

- [x] **Audit logging** (Phase 15 log, `models/ModerationAuditLog.js`)
  - Staff sign-ins, refused admin requests, role and status changes, moderation and report decisions,
    opportunity changes, anonymous reveals, and Phase 16 account security events (`ACCOUNT_LOCKED`,
    `SUSPICIOUS_LOGIN`, `REFRESH_TOKEN_REUSE`, `RATE_LIMIT_EXCEEDED`, `ABUSE_PATTERN`, plus `PASSWORD_CHANGED`
    and `ACCOUNT_DELETED`) in the **Security** category.
  - Each row: actor (or system), action, target, previous/new status, reason, small metadata, request
    address, time. Metadata passes `sanitizeSecurityMetadata()`: no passwords, tokens, secrets or emails.
  - Address-only events (forged tokens, refused uploads/requests, limits without an account) go to the
    server log, throttled.

- [x] **Environment secrets**
  - Secrets only in `backend/.env` (git-ignored, together with every `.env.*` except `.env.example`).
    `.env.example` files hold empty values and comments only. No credentials in source or docs.
  - Only `VITE_*` variables reach the browser bundle; the frontend env holds URLs only.
  - The logger masks credentials in URLs, bearer tokens, JWTs and `password=`/`secret:`-style pairs;
    the request logger never logs headers, cookies or bodies and redacts sensitive query values.

- [x] **MongoDB security**
  - Operator stripping, validated ids and bounded pagination (above); explicit `select`/allow-lists for
    sensitive fields; escaped regular expressions; indexes kept.
  - Database errors map to safe messages (503 when unreachable, 409 for duplicates without echoing the
    value, 400 for casts); connection strings are never sent or logged.

- [x] **Redis security**
  - Optional. Holds rate-limit counters (keyed by ids or addresses; email addresses only as truncated
    one-way hashes), short-lived security throttles and caches; no passwords, tokens or personal text.
  - When Redis is missing or down, every counter falls back to process memory and the API keeps working.
  - Use a password-protected `rediss://` URL in production.

- [x] **Error handling** (`middleware/errorMiddleware.js`)
  - Every error is `{ success: false, message, errors }`. Unexpected errors answer "Something went wrong.
    Please try again." In production there is no `debug` block, stack, path or connection string; in
    development unexpected errors include `debug` details.

- [x] **Production configuration** (`config/env.js`, checked at startup)
  - Refuses to start without `MONGODB_URI`, `JWT_SECRET` or `CLIENT_URL`; with a short or example
    `JWT_SECRET`; with `*`, malformed or non-https origins; with access tokens longer than 1 h; or with
    invalid durations, limits, time zone, cookie policy or proxy count.
  - Production cookies are Secure (SameSite=None by default), HSTS is on, debug details are off.
  - Set `TRUST_PROXY` to the number of proxies so limits and audit rows see real client addresses.

- [x] **Security tests**
  - `phase16-security.mjs` (API, its own MongoDB + backend, plus production-mode processes): headers,
    CORS/CSRF, tokens, sessions, account status, passwords, lockout and enumeration, roles and permissions,
    role spoofing, ownership, NoSQL injection, prototype pollution, payload size, malformed ids, pagination,
    XSS, link schemes, uploads, anonymous privacy, rate limits, abuse pattern, admin security status,
    role changes, Socket.IO, logs, production startup checks.
  - `phase16-unit.mjs`: error handler (production and development), upload name rules, request screening,
    metadata sanitizing, suspicious sign-in rules, log redaction, JWT secret handling.
  - Phase 15 API suite (with its Phases 2–14 regression smoke) re-run after the changes.

## Known gaps

These are deliberate, documented trade-offs or later work, not oversights:

- **Sign-up reveals taken emails** (409 "An account with this email already exists"). Hiding it needs
  email verification, which CampusX doesn't have yet; sign-ups are limited to 15 per hour per address.
- **No password reset or email verification** flows exist yet; when they are added they need their own
  rate limits and must revoke other sessions (as password change does).
- **No frontend Content-Security-Policy yet.** The API sends a strict CSP, but the frontend's headers are
  set by whatever hosts it (deployment phase). `index.html` has one inline theme script, so that CSP will
  need its hash.
- **Access token in memory, refresh token in a cookie.** Any XSS in the frontend could still act as the
  student while the page is open; React's escaping and the absence of raw HTML rendering are the defence.
- **PDF scanning** can't see inside compressed object streams; such files are still served only from
  Cloudinary's domain, never CampusX's.
- **In-memory fallbacks** (rate limits, locks, security throttles) are per API process: with several
  instances and no Redis, limits are per instance and reset on restart.
- **Per-account lockout can be triggered by someone else** (by guessing wrong on purpose). It is short
  (15 min) and never permanent, which keeps that nuisance bounded.
- **Account deletion trade-offs.** A deleted student can sign up again with the same email (nothing about the
  account is kept to recognise it), so deletion can be used to shed a moderation history; the moderation records
  themselves stay. Anonymous Zone content stays online after the account is gone (by design, see above). A few
  deletion queries scan collections without an index (likes/saves on posts and projects, `createdBy` on
  communities, `actor` on notifications): fine at campus scale, worth an index if those collections grow large.
  A request that was already past authentication when the account was locked can still write one record; the
  follow-up sweep removes such late records, but only once, shortly after the deletion.
- **Real Cloudinary, Redis and MongoDB Atlas were not exercised by the Phase 16 suites** (they use a local
  MongoDB, no Redis and no Cloudinary).
