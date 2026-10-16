# CampusX architecture overview

Status: Phase 4 complete (foundation, backend infrastructure, authentication, onboarding, profiles). This document describes what
exists today and the conventions that later phases must follow.

## System shape

```
Browser (React SPA, Vite)
   │  HTTPS: JSON REST at /api/v1      WebSocket: Socket.IO
   ▼
Express API (Node.js)
   ├── MongoDB via Mongoose   (primary data)
   ├── Redis                  (optional cache; in-memory fallback)
   └── Cloudinary             (images and videos)
```

Frontend and backend are separate apps in one repository. They talk over HTTP with CORS and can be
deployed independently.

## Backend

### Files and responsibilities

| File | Responsibility |
| --- | --- |
| `server.js` | Startup order, listening, graceful shutdown wiring. No business logic |
| `app.js` | Express app: middleware order and route mounting |
| `config/env.js` | The only place that reads `process.env`; defaults and production checks |
| `config/db.js` | MongoDB connect/disconnect, connection events, status for health |
| `config/redis.js` | Optional Redis client, status for health |
| `config/cloudinary.js` | Cloudinary SDK configuration and startup status |
| `config/cors.js` · `config/media.js` | CORS allow-list · upload presets |
| `sockets/socket.js` · `socketAuth.js` · `socketEvents.js` | Socket.IO server (handshake auth, per-student rooms, `emitToUser()`), event names |
| `jobs/opportunityDeadlineReminders.js` | In-process timer for opportunity deadline reminders |
| `jobs/accountDeletionCleanup.js` | In-process timer that finishes interrupted account deletions and retries their Cloudinary files |
| `middleware/*` | Request logging, rate limiting, sanitization, validation, uploads, 404, errors |
| `services/*` | `healthService` (status), `cacheService` (get/set/delete), `mediaService` (Cloudinary) |
| `utils/*` | `ApiError`, `sendSuccess`, `logger` (redacts URL credentials), `gracefulShutdown` |

### Request lifecycle (`app.js`)

```
request
  → securityHeaders     helmet for a JSON API: CSP default-src 'none', frame DENY, no-referrer, HSTS in production
  → cors                origin allow-list from CLIENT_URL (never "*", credentials enabled)
  → requestLogger       "GET /api/v1/health 200 - 12ms" when the response ends
  → noStoreByDefault    Cache-Control: no-store on /api (routes may allow private caching)
  → express.json/urlencoded   100 kB body limit (uploads use multer instead)
  → cookieParser        reads the HttpOnly refresh cookie (auth routes only use it)
  → sanitizeRequest     400 for __proto__/constructor keys, NUL bytes, absurd nesting; strips $-operator and dotted keys
  → hpp                 collapses repeated query params to the last value
  → apiRateLimiter      300 requests / 15 min per IP on /api
  → /api/v1 router      routes → validate() → controller → service → model
  → notFound            unknown routes become a 404 error
  → errorHandler        every error becomes { success: false, message, errors }
```

`hpp` must stay after `sanitizeRequest`. In Express 5 `req.query` is recomputed on every access, and
hpp edits it in place. `sanitizeRequest` pins it to a plain object so those edits stick.

### Layers

| Layer | Folder | Responsibility | Must not |
| --- | --- | --- | --- |
| Route | `routes/` | Map URL + method to middleware and a controller | Contain logic |
| Validator | `validators/` | Declare input rules (express-validator) | Touch the database |
| Controller | `controllers/` | Read `req`, call a service, send the response with `sendSuccess` | Query models directly or decide permissions |
| Service | `services/` | Business rules, authorization, orchestration, caching | Know about `req`/`res` |
| Model | `models/` | Mongoose schemas, indexes, small instance helpers | Contain request-specific rules |

Express 5 forwards rejected promises from async handlers to the error handler, so no `asyncHandler`
wrapper is needed. Services throw `ApiError` (for example `ApiError.forbidden()`) and the central
handler formats it.

### Response envelope

```json
{ "success": true, "message": "…", "data": { } }
{ "success": false, "message": "…", "errors": [{ "field": "email", "message": "…" }] }
```

`data` is always present on success (`{}` when empty); `meta` is added for pagination. `errors` is
always an array on failure.

### Error handling (`middleware/errorMiddleware.js`)

| Source | Status | Notes |
| --- | --- | --- |
| `ApiError` thrown by app code | its own | Message and `errors` passed through |
| express-validator (`validate()`) | 422 | One entry per field |
| Mongoose `ValidationError` | 422 | One entry per schema path |
| Mongoose `CastError` | 400 | e.g. malformed ObjectId |
| Duplicate key (`11000`) | 409 | Field name only, never the submitted value |
| DB unreachable / buffering timeout | 503 | Friendly "temporarily unavailable" message |
| Multer errors | 400 / 413 | |
| Invalid JSON / body too large | 400 / 413 | |
| Anything else | 500 | Generic message. Outside production a `debug` object adds name, message and stack |

5xx errors are logged server-side. Production responses never contain stack traces, internal messages,
credentials or environment values.

### Configuration

All environment access goes through `config/env.js`, which loads `backend/.env` and applies defaults.
`validateEnv()` runs first at startup. It checks durations and limits, and refuses to boot in
production without `MONGODB_URI`, `JWT_SECRET` (32+ characters) and `CLIENT_URL`.

### Startup (`server.js`)

```
CampusX API starting...
1. validateEnv()              config check (production requirements, durations, limits)
2. connectDatabase()          "MongoDB connected successfully"; unreachable URI → exit 1 with a clear message
3. connectRedis()             "Redis: connected" or a warning; never fatal
4. logCloudinaryStatus()      "Cloudinary: configured" or a warning; never fatal
5. register listeners         points/badges (gamificationEvents) and notifications (notificationEvents)
6. initSocketServer()         "Socket.IO: ready"
7. startDeadlineReminders()   opportunity deadline reminder timer
8. listen                     "CampusX API running on http://localhost:5000"
```

Without `MONGODB_URI`, development still starts (warning, health reports `database: not_configured`)
so frontend work is possible without a database. Production requires it. Connection strings are never
logged: the logger also masks `user:password@` in any URL it prints.

### Graceful shutdown (`utils/gracefulShutdown.js`)

On `SIGINT`/`SIGTERM` (also sent by `node --watch` on restart):

1. Socket.IO disconnects all clients and closes the HTTP server, waiting for in-flight requests.
2. The deadline reminder timer stops; queued points and notification handlers finish.
3. MongoDB and Redis connections close.
4. The process exits with code 0. A 10-second timer forces exit 1 if anything hangs.

A second Ctrl+C exits immediately. Unhandled rejections and uncaught exceptions also trigger a graceful
shutdown, with exit code 1.

### Database and indexes (`config/db.js`)

- `strictQuery` is on: query conditions on paths not in the schema are dropped.
- Models are added per feature phase. **Each model declares its own indexes in its schema**
  (`unique: true`, `index: true`, `schema.index(...)`); Mongoose builds them on first use (`autoIndex`).
- Planned indexes once the models exist:

| Model | Index | Purpose |
| --- | --- | --- |
| User | `email` unique | Login, prevent duplicates |
| User | `college`, `branch` | Campus and department filters |
| Post | `{ author: 1, createdAt: -1 }` | A student's posts, newest first (built) |
| Post | `{ createdAt: -1, _id: -1 }` | Campus timeline (built) |
| Post | `{ type: 1, createdAt: -1 }`, `{ moderationStatus: 1 }`, `{ 'audience.college': 1, 'audience.branch': 1, createdAt: -1 }` | Feed filters, moderation, campus/branch visibility (built) |
| Comment | `{ post: 1, createdAt: -1, _id: -1 }` | A post's comments, newest first (built) |
| PostReport | `{ post, reportedBy }` unique while `status: pending` | One open report per student per post (built; since Phase 13 new reports go to `Report`) |
| Community | `slug` unique, `{ status, memberCount }`, `{ type, status }`, `{ college, branch, status }`, `tags` | Discovery, scopes, search (built) |
| CommunityMember | `{ community, user }` unique, `{ user, status }`, `{ community, status, role, joinedAt }` | Membership, member lists (built) |
| Post | `{ community: 1, createdAt: -1 }` | Community feeds (built) |
| Project | `slug` unique, `{ owner, createdAt }`, `{ category, createdAt }`, `status`, `{ visibility, audience.college }`, `techStack`, `teamMembers.user` | Projects (built) |
| Achievement | `{ owner, date }`, `{ type, date }`, `verificationStatus`, `{ visibility, audience.college }`, `createdAt` | Achievements (built) |
| StudentGamification | `{ eligible, totalPoints, verifiedAchievements, totalReachedAt }`, campus fields + points, `{ weekKey, weeklyPoints }`, `{ monthKey, monthlyPoints }` | Leaderboards (built) |
| Notification | `{ recipient, eventAt, _id }`, `{ recipient, isRead, eventAt }`, `dedupeKey` unique while unread | Notification center, unread count, no duplicates (built) |

If collections grow large, set `autoIndex: false` in production and run `Model.syncIndexes()` as a
deploy step.

### Caching (`services/cacheService.js`)

`getCache(key)`, `setCache(key, value, ttlSeconds)` and `deleteCache(key)` use Redis while it is
ready and the in-memory store otherwise, including when Redis drops at runtime. Values are
JSON-serialised. A cache failure never fails a request: reads become misses and writes are skipped.

### Media pipeline

```
client multipart → createUploader(preset)  (multer: type + size check, temp file in backend/uploads)
                 → uploadMedia(path, preset) (Cloudinary upload; temp file always deleted)
                 → save { url, publicId, resourceType, ... } on the model
deleting         → deleteMedia(publicId, resourceType)
```

Presets live in `config/media.js`:

| Preset | Type | Max size | Folder |
| --- | --- | --- | --- |
| `profilePhoto` | jpeg/png/webp | 5 MB | `campusx/profile-photos` |
| `coverImage` | jpeg/png/webp | 8 MB | `campusx/cover-images` |
| `postImage` | jpeg/png/webp | 5 MB | `campusx/posts/images/<authorId>` |
| `postVideo` | mp4/webm | 50 MB | `campusx/posts/videos/<authorId>` |
| `communityIcon` / `communityCover` | jpeg/png/webp | 2 MB / 5 MB | `campusx/communities/icons|covers/<communityId>` |
| `projectImage` | jpeg/png/webp | 5 MB | `campusx/projects/<projectId>` |
| `achievementProofImage` / `achievementProofPdf` | jpeg/png/webp / pdf (raw) | 10 MB | `campusx/achievements/proof/<achievementId>` |

Always store `publicId` next to `url`; it is required to replace or delete media. When a profile photo
is changed or a post is deleted, the service deletes the old Cloudinary asset.

If Cloudinary is not configured the server still starts. `uploadMedia` and `deleteMedia` then throw
a 503 instead of failing silently.

### Realtime (`sockets/socket.js`)

Socket.IO shares the CORS allow-list with Express. Every handshake is authenticated like a REST request
(`socketAuth.js`: access token from the handshake `auth` payload, active account, live session) and each
connection joins `user:<id>` and `session:<id>` rooms. Services deliver with `emitToUser()`; clients send
nothing the server acts on. Details: [Notifications and real-time](#notifications-and-real-time-phase-11).

### Request logging (`middleware/requestLogger.js`)

One line per request: method, URL, status and duration. 4xx logs at WARN and 5xx at ERROR. Query
values for sensitive names (`password`, `token`, `secret`, `key`, `code`, `session`, ...) are
replaced with `[REDACTED]`. Headers, cookies and bodies are never logged.

### Security baseline

- Helmet default headers, `x-powered-by` disabled
- CORS allow-list from `CLIENT_URL`, credentials enabled for future httpOnly cookie auth
- Rate limiting with JSON 429 responses: `RATE_LIMIT_MAX` per 15 min per IP globally (generous, because
  campus networks share IPs), plus stricter login (failed attempts only) and register limiters
- 100 kB JSON/urlencoded body limit
- MongoDB operator-injection protection: request sanitization plus Mongoose `strictQuery`
- HTTP parameter pollution protection (hpp)
- Input validation via `validate(rules)` returning 422 with field errors
- Secrets only in `.env` (git-ignored); `.env.example` documents every variable

`express-mongo-sanitize`'s bundled middleware is incompatible with Express 5 (it reassigns the
read-only `req.query`), so `middleware/sanitizeMiddleware.js` uses its `sanitize()` helper directly.

## Authentication and sessions

### Building blocks

| File | Responsibility |
| --- | --- |
| `models/User.js` | Account schema, `ROLES`, `ACCOUNT_STATUSES`, `toSafeUser()` allow-list serializer |
| `models/Session.js` | One document per signed-in device: refresh token hashes, expiry (TTL), revocation |
| `services/authService.js` | Register, login, refresh, logout, lockout, account-status rules |
| `services/sessionService.js` | Create / rotate / revoke sessions, reuse detection |
| `utils/generateToken.js` | Sign and verify access tokens; generate and hash refresh tokens |
| `middleware/authMiddleware.js` | `authenticate`, `authorizeRoles(...roles)`, `identifySession` (logout only) |
| `middleware/trustedOrigin.js` | CSRF guard for the cookie-based endpoints |
| `middleware/requireDatabase.js` | 503 straight away when MongoDB is not connected |
| `validators/authValidators.js` | Register/login rules (express-validator) |
| `config/auth.js` | bcrypt cost, JWT issuer/audience, refresh cookie options |

### Token strategy

```
access token   JWT, HS256, JWT_EXPIRES_IN (15 min)  { sub: userId, sid: sessionId, role }  -> Authorization header
refresh token  48 random bytes, REFRESH_TOKEN_EXPIRES_IN (7 days) -> HttpOnly cookie cx_refresh, path /api/v1/auth
```

- **Access tokens are revocable.** `authenticate` verifies the JWT, then loads the user *and* checks
  that session `sid` is still active. Logout, reuse detection or account suspension therefore take
  effect on the next request, not when the token expires. The cost is two indexed lookups per
  authenticated request, a good point to add Redis caching later if needed.
- **Roles come from the database.** The `role` claim is informational only. Promotions and demotions
  apply immediately.
- **Refresh rotation.** Each refresh replaces the session's `currentTokenHash` atomically and keeps
  the old one as `previousTokenHash`. A replay of the previous token:
  - within 30 s (two tabs refreshing at once): gets a new access token only; the browser already has
    the new cookie.
  - after 30 s: treated as theft. The session is revoked, a warning is logged and the event is audited
    (`REFRESH_TOKEN_REUSE`).
- **Nothing reusable is stored.** Refresh tokens are kept only as SHA-256 hashes, passwords as bcrypt
  (cost 12, at most 72 bytes because bcrypt ignores anything longer).
- **Expired sessions clean themselves up** through a TTL index on `Session.expiresAt`.

### Login sequence (`authService.login`)

1. Find the user by normalised email, explicitly selecting `+passwordHash +failedLoginAttempts +lockedUntil`.
2. Unknown email: compare against a dummy hash (same timing), then 401 "Invalid email or password.".
   Failures for unknown emails are counted too (`securityService`, keyed by a one-way hash of the email),
   and after `MAX_LOGIN_ATTEMPTS` they get the same 423 lock, so no answer reveals whether an account exists.
3. Locked (`lockedUntil` in the future): 423 with the minutes remaining. The password is not checked.
4. Wrong password: `$inc failedLoginAttempts`. On reaching `MAX_LOGIN_ATTEMPTS`, set `lockedUntil`
   and reset the counter, so the student gets a fresh set of attempts afterwards.
5. Correct password: only now check `status`, so status never leaks to someone guessing.
6. Record `SUSPICIOUS_LOGIN` if this success follows 3+ failures or a lock in the last 24 h (never refused).
7. Reset the counters, record `lastLoginAt`/`lastLoginIp`, create a session, return the safe user + tokens.

### Account statuses

| Status | Can sign in | Notes |
| --- | --- | --- |
| `active` | yes | New registrations start here (there is no email verification yet) |
| `pending` | no | Reserved for future verification/onboarding gates |
| `suspended` / `blocked` | no | Moderation; existing sessions stop working on their next request |
| `deactivated` | no | Closed by the owner |
| `deleting` | no | The owner confirmed deletion; locked while its data is removed (normally seconds; the document is deleted last). See [Account deletion](#account-deletion) |

### Cookies, CORS and deployment

- In development the frontend (`localhost:5173`) and API (`localhost:5000`) are the same *site*, so
  `SameSite=Lax` works.
- In production the cookie defaults to `SameSite=None; Secure` so separate frontend/API domains work.
  Cross-site requests are still protected: CORS limits readers to `CLIENT_URL`, and
  `requireTrustedOrigin` rejects a foreign `Origin` on register, login, refresh and logout.
- **Recommendation:** serve the API from the same site as the frontend (e.g. `campusx.app` and
  `api.campusx.app`) and set `COOKIE_SAME_SITE=lax`. Some browsers (Safari) block third-party
  cookies, which would break refresh for fully cross-site deployments.

### Roles

`student` (default, the only role public registration can create), `moderator`, `admin`. Elevated
roles are granted only by the developer script `npm run user:role` until an admin panel exists.
`authorizeRoles()` rejects unknown role names when the route is defined. More granular permissions
can be layered on later (e.g. a `permissions.js` map from role to actions) without changing routes.

## Onboarding and campus identity

### Data source

`backend/data/campusOptions.js` holds colleges, branches, semesters, interests, skill suggestions and
the limits (`ONBOARDING_RULES`). Only `services/campusOptionsService.js` reads it, through **async**
lookups (`getCollege`, `listBranches`, `isKnownInterest`, `getOnboardingOptions`). Moving
colleges into MongoDB later only changes that service. The frontend gets everything from
`GET /onboarding/options` and keeps no copy of any list.

### Stored values

| Field | Type | Example | Why |
| --- | --- | --- | --- |
| `college` | String id | `"pbcoe-nagpur"` | Names can change (RCOEM → Ramdeobaba University); ids don't |
| `branch` | String id | `"cse"` | Same; ready for per-college branch lists (`branchIds`) |
| `semester` | Number | `7` | One format; the label "7th Semester" comes from the options |
| `rollNumber` | String | `"CS-21 045"` | Normalised: trimmed, single-spaced, upper case |
| `interests` | [String id] | `["web-development"]` | Feeds future personalisation |
| `skills` | [String] | `["React", "Three.js"]` | Free text; known skills use their official spelling |
| `onboardingCompleted` / `onboardingCompletedAt` | Boolean / Date | | Set once, on the first successful save |

A unique partial index on `{ college, rollNumber }` (only where `rollNumber` is set) means one
account per roll number per college. The same number at another college is fine, and students who
haven't onboarded yet don't collide.

### Request flow

```
PUT /onboarding → requireDatabase → authenticate → validate(saveOnboardingRules)
                → onboardingController.save: matchedData() only, never raw req.body
                → onboardingService.saveOnboarding(req.user.id, …) → user.save()
```

The account is always `req.user.id` from the session. `matchedData` drops everything that wasn't
validated, so fields like `userId`, `role` or `onboardingCompleted` in the body have no effect.

### Frontend flow

```
signed out                        → /login
signed in, onboarding incomplete  → /onboarding (every campus page redirects here, even typed URLs)
signed in, onboarding complete    → campus pages; /onboarding redirects to /home
```

- `OnboardingGuard` (inside `ProtectedRoute`) does the routing, based on `user.onboardingCompleted`
  from the auth store. That value is restored on every page load, so it survives refreshes.
- `onboardingStore` (Zustand) holds the draft and current step, separate from auth. It is persisted to
  **sessionStorage** and tied to the student's id (`ownerId`):
  - a reload resumes the same step;
  - another account on the same tab starts fresh;
  - an explicit logout clears it;
  - an expired session keeps it, so the same student can carry on.
- Nothing is written to the database until **Complete setup** sends one `PUT /onboarding`. Server
  field errors are shown on the matching review rows, with Edit links back to each step.
- Steps: Welcome → College → Branch → Semester → Roll number → Interests → Skills (optional) → Review.
  The progress bar counts the seven steps after Welcome.
- Guards redirect through `RedirectTo`, which shows a loader. Router navigations run as React
  transitions and keep the current screen up while a lazy page loads, so a bare `<Navigate>` would
  show a blank screen.

## Profiles and profile media

### Data

Everything stays on the `User` document; there is no separate profile collection, so names, campus
fields and interests exist in exactly one place.

| Field | Notes |
| --- | --- |
| `avatarUrl`, `coverImageUrl` | Cloudinary **delivery** URLs (transformation applied on serve) |
| `avatarPublicId`, `coverImagePublicId` | Hidden from queries (`select: false`); needed to replace/delete |
| `bio` | Up to 500 characters |
| `profileTheme` | One of five ids from `data/profileOptions.js` (enum-validated in the schema too) |
| `profileCompleted` / `profileCompletedAt` | Kept in sync with `utils/profileCompletion.js`; the date is the first time it reached 100% |

### Services

- `profileService`: own/public profile serializers, which resolve college, branch, semester and
  interest labels so any screen (and future posts) can show them directly. Also edits, completeness
  sync and editor options. The public view never includes email, roll number, completeness or
  security data.
- `profileMediaService`: `replaceProfileImage(kind, userId, file)` and
  `removeProfileImage(kind, userId)` for `avatar` and `cover`.
- `mediaService`: generic Cloudinary upload (into `campusx/profile-photos/<userId>/` and
  `campusx/cover-images/<userId>/`), delivery URLs and delete. It always deletes the temp file.
- `validators/fieldRules.js`: name and campus field rules shared by registration, onboarding and
  profile editing.

### Upload pipeline

```
POST /profile/avatar → requireDatabase → authenticate (nothing is read from anonymous requests)
  → mediaUploadRateLimiter (30/hour per student)
  → uploadImage('profilePhoto', 'photo'): multer to backend/uploads, ≤ 5 MB, one file,
    declared type + magic-byte check (JPG/PNG/WEBP), friendly 400/413/415, rejected file deleted
  → profileMediaService.replaceProfileImage('avatar', req.user.id, path)
      1. upload to Cloudinary (signed; allowed_formats restricted)
      2. save url + publicId only if the stored image is still the one we started from
         (another tab changed it → delete the new upload, 409)
      3. save failed → delete the new upload; save succeeded → delete the old image
      4. temp file always removed
```

Removing works the other way round: clear the database first (so the profile never points at a
missing file), then delete on Cloudinary. Cloudinary cleanup failures are logged ("may need manual
cleanup") and never fail the request. Cloudinary errors are logged in full; students only see "…
upload failed. Please try again." (502) or "… uploads aren't available right now" (503 when not
configured).

**Display transformations** (originals are never modified):

| Image | Transformation |
| --- | --- |
| Profile photo | `c_fill,g_auto,w_400,h_400` + `q_auto,f_auto` (square, centred on the subject) |
| Cover image | `c_fill,g_auto,w_1600,h_480` + `q_auto,f_auto` (wide banner) |
| Post video | `q_auto` up to 40 MB; larger videos are served as uploaded (Cloudinary's Free plan refuses on-the-fly video transformations above 40 MB) |

The Cloudinary API key must be allowed to upload and delete assets. A key without those permissions
passes the startup check, but every upload answers 502 and the server log shows HTTP 403 with a hint.

### Frontend

- Routes: `/profile` (own), `/profile/edit`, `/profile/:userId` (public; your own id redirects
  to `/profile`), all inside the signed-in, onboarded campus area.
- `profileStore` holds the own/viewed profile, editor options and every action
  (`fetchOwnProfile`, `fetchPublicProfile`, `updateProfile`, `uploadAvatar`, `deleteAvatar`,
  `uploadCover`, `deleteCover`). Each change replaces the local copy and updates the signed-in user
  (sidebar, menus) without another request. `services/profileApi.js` holds the HTTP calls; uploads get
  a 120 s timeout and progress events.
- `ProfileView` renders the profile for the owner, for visitors and as the editor's live preview.
  It uses **container queries**, so it lays out by its own width (two columns when wide, stacked when
  narrow). Document order is the reading order; columns only place blocks.
- Styles: `constants/profileThemes.js` maps each theme id to fixed classes (cover, pattern, ring, chips,
  cards, section order). Unknown ids fall back to Campus Green. Students can't inject CSS.
- `Avatar` falls back to initials whenever there is no photo **or the image fails to load** (e.g.
  deleted on Cloudinary), everywhere it's used.

## Campus feed and posts (Phase 5)

### Models

| Model | Fields |
| --- | --- |
| `Post` | `author` (ref User, from the session), `type`, `content` (≤ 3000), `media[]` `{ url, publicId, type, width, height }`, `visibility`, `audience { college, branch }` (set by the server), `likes[]` / `saves[]` (student ids, `select: false`), `commentsCount`, `sharesCount` (reserved), `editedAt`, `moderationStatus`, timestamps |
| `Comment` | `post`, `author`, `content` (1-1000), `editedAt`, timestamps |
| `PostReport` | `post`, `reportedBy`, `reason`, `details`, `status` (`pending` → `reviewed` / `dismissed`), timestamps (reports filed before Phase 13; new ones are stored in `Report`) |

No name, photo or campus labels are copied onto posts: `profileService.getStudentSummaries` reads
them from the authors' profiles each time (active accounts only). `audience` is the one exception:
the author's college and branch at posting time, kept so visibility can be matched inside the feed
query instead of joining users.

Post types, visibility levels, feed filters, report reasons and limits live in `data/postOptions.js`
and reach the frontend through `GET /posts/options`.

### Services

- `postService`: `visibleTo(viewer)` (the one visibility filter used by the feed, single posts,
  likes, saves, comments and reports), feed (aggregation that returns like/save state and counts
  without sending the id lists), create, edit, delete, likes (`$addToSet`/`$pull`), saves, reports.
- `postMediaService`: uploads a post's files all-or-nothing (any failure deletes the uploads that
  succeeded) and deletes a post's files.
- `commentService`: list/add/edit/delete, keeping `commentsCount` in step.
- `campusEvents`: one in-process `EventEmitter` for posts (`post:created`, `post:liked`, ...) and
  communities (`community:member-joined`, `community:role-changed`, ...), emitted with ids only.
  Points (Phase 10) and notifications (Phase 11) subscribe here without the services knowing about them.
- Likes, saves and comment counters update with `timestamps: false`, so they never look like edits.

### Upload pipeline (posts)

```
POST /posts → requireDatabase → authenticate → postRateLimiter (30/hour) → mediaUploadRateLimiter
  (multipart only) → uploadPostMedia('media'): multer to backend/uploads, ≤ 4 files, magic-byte type
  check (JPG/PNG/WEBP or MP4/WEBM), per-kind size (5 MB / 50 MB), only plain-text fields kept
  → validate(createPostRules) → postService.createPost
      1. upload every file (videos in chunks); any failure → delete the successful uploads, 502
      2. create the post; failure → delete the uploads
PUT /posts/:id → … → requirePostOwner (403 before any file is read) → upload → validate → updatePost
      upload new files → save only if the post is still the author's and unedited since loading
      (else delete the new uploads, 409) → then delete removed files
```

Temporary files are removed when the response finishes, whatever happened.

## Communities (Phase 6)

- **Models**: `Community` (name, slug, description, type, visibility, college/branch/semester scope set
  from the creator's profile, icon/cover, createdBy, official, memberCount, status, rules, tags) and
  `CommunityMember` (community, user, role, status `active | left | banned`, unique per pair). No member
  arrays on the community; `memberCount` is kept in step with `$inc` on every status change.
- **Access** (`communityAccess`): `scopeAllows(community, viewer)` / `scopeFilter(viewer)` compare the
  community's scope with the viewer's college/branch/semester from the database. Viewing needs the scope
  or an active membership; joining needs the scope, an active community and no ban.
- **Roles**: owners edit, archive, change roles and remove members/moderators; moderators remove members
  and community posts. The last owner can't leave or step down.
- **Posts**: community posts are ordinary `Post`s with `community` set and `visibility: 'community'`;
  `postService.visibleTo(viewer)` adds "posts of my active communities" (memberships cached per request
  on `req.user.$locals`), and the campus feed filters `community: null`.
- **Official communities** are upserted (by slug) the first time a student who belongs to them opens
  communities; recently ensured slugs are remembered for 10 minutes.

## Projects and achievements (Phase 7)

- **Models**: `Project` (owner, title, slug, descriptions, category, techStack, links, images
  `{ url, publicId, width, height }`, teamMembers `{ user, role, status }`, status, visibility, featured,
  views, likes, audience.college) and `Achievement` (owner, title, description, type, organization,
  eventName, date, rank, certificateUrl, proof `{ url, publicId, kind, resourceType }`, skills,
  verificationStatus + verification review, visibility, audience.college). Profiles reference them by
  owner; nothing is copied onto the user.
- **Visibility** (`showcaseAccess`): public/campus for every signed-in student, college via
  `audience.college` (the owner's college, refreshed on every edit), private for the owner. Project
  teammates also see projects they're invited to.
- **Ownership**: `loadOwnProject` / `loadOwnAchievement` return 404/403 before anything changes; the
  writes match `{ _id, owner }` again. Image/proof uploads check ownership before multer reads a file.
- **Media**: `uploadFiles` (multi-file, magic-byte check incl. PDF) → Cloudinary all-or-nothing; the
  push is conditional on room left, otherwise uploads are deleted. Deleting removes files first.
- **Views**: counted once per student per project every 6 hours via `cacheService` (Redis or memory).
- **Verification**: only `reviewAchievement` (route guarded by `authorizeRoles(admin, moderator)`) sets
  verified/rejected, and only for pending achievements that aren't the reviewer's own.

## Opportunities (Phase 8)

- **Models**: `Opportunity` (title, slug, descriptions, type, organizer, organizerLogo/image
  `{ url, publicId }`, location, mode, applicationUrl, registrationUrl, start/end dates,
  applicationDeadline, eligibility text, eligibleColleges/Branches/Semesters, skills, tags, prize, fee,
  createdBy, updatedBy, status draft/published/closed/archived, visibility public/campus/college,
  featured, views, publishedAt), `OpportunityApplication` (opportunity, user, status, appliedAt,
  statusChangedAt, notes; unique `{ opportunity, user }`) and `OpportunityReport` (same shape and statuses
  as `PostReport`, which can't be reused because it references posts and post-only reasons).
- **Roles**: the routes put `authorizeRoles(admin, moderator)` in front of create/edit/delete/manage and
  image uploads, before validation and multer. No new roles. Students track, save and report.
- **Access** (`opportunityAccess`): students see published and closed opportunities that are public/campus,
  or college-only ones listing their own college. Staff can open any status. Closed = status `closed` or
  deadline passed, worked out on every read (`displayStatus`), never written back.
- **Eligibility**: `eligibilityOf(opportunity, req.user)` compares the stored college/branch/semester
  with the rules (empty = anyone). The `eligible=true` filter builds the same rule as a query. Nothing
  from the request takes part.
- **Tracking** (`opportunityApplicationService`): one record per student per opportunity (unique index,
  races caught as 11000). Every query matches `user: req.user._id`. Outcome statuses need an earlier
  "applied"; closed opportunities can't be newly tracked.
- **Recommendations** (`opportunityRecommendationService`): deterministic points from skills, interests
  (`INTEREST_MATCHES` in `data/opportunityOptions.js`), college/branch/semester targeting and a near
  deadline; only open, eligible, untracked opportunities that match the profile; reasons are returned,
  points are not.
- **Media**: `uploadImage` + `opportunityMediaService` (same replace-then-delete pattern as community
  images), presets `opportunityImage` (5 MB) and `opportunityLogo` (2 MB).
- **Events**: `opportunity:published|updated|closed|archived|deleted|reported` and
  `opportunity:tracking-changed` on `campusEvents`. Status events carry `previousStatus`; `updated` lists
  only fields whose values really changed. Phase 11 turns them into notifications for tracking students.
- **Frontend**: `opportunityStore` + `opportunityApi`; pages `opportunities/` (discovery, details, My
  Opportunities, Saved) and `admin/opportunities/` (manage, editor). Countdowns use `deadlineInfo()` with
  a shared minute clock (`useNow`). External links open only after `safeExternalUrl()` accepts them
  (http/https, no credentials), in a new tab with `rel="noopener noreferrer nofollow"`.

## Anonymous Zone (Phase 9)

- **Models**: `AnonymousPost` (author, category, title, content, media, visibility, community,
  audience.college, status active/hidden/deleted, moderationStatus, reportsCount, commentsCount, likes,
  editedAt, deletedAt), `AnonymousComment` (post, author, content, status, moderationStatus,
  reportsCount, editedAt, deletedAt) and `AnonymousReport` (targetType post/comment, target, post,
  reportedBy, reason, details, status; unique per target + reporter). `author`, `audience` and `likes` are
  `select: false`. Campus `Comment`/`PostReport` aren't reused because they are shown with the author's
  profile and reference campus posts.
- **Anonymity**: responses are built from allow-lists (`toAnonymousPostView`, `toCommentView`);
  `isOwner` and like state are computed in the database. Images go to `campusx/anonymous/<postId>`
  (never a user id) after `utils/imageMetadata.js` strips EXIF/GPS, XMP, IPTC, comments, PNG text and
  appended previews (JPEG orientation kept). Events carry ids only, so later notifications say
  "Someone commented on your anonymous post".
- **Access** (`readableBy`): active + approved/flagged, and campus, the reader's own college
  (`audience.college`), or one of their communities. Owners can always open their own non-deleted posts.
- **Ownership**: `loadOwnPost` / `loadOwnComment` select the hidden author and compare it with
  `req.user`; writes match `{ _id, author }` again. Deletes are soft.
- **Safety**: `utils/personalInfo.js` refuses phone numbers, emails, UPI ids, card/ID numbers,
  passwords/OTPs and home addresses in titles, content and comments; `textRule` refuses markup.
- **Rate limits**: `ANONYMOUS_RATE_LIMITS` in `data/anonymousOptions.js`; `createRateLimiter({ name })`
  counts on `SharedCounterStore` (Redis keys `campusx:rl:<limiter>:<key>`, memory fallback).
- **Moderation**: `services/anonymousModeration.js` (`getAnonymousAuthorForModeration`,
  `getAnonymousCommentAuthorForModeration`) is the only code that reveals an author. It requires a
  moderator/admin, writes an audit line (who looked at what, never the identity) and is imported by no
  route yet; the admin phase will build on it. The request logger records method, URL and status only.

## Campus Rankings and gamification (Phase 10)

- **Config**: `data/gamificationOptions.js` holds every point rule (points, label, caps per day / week /
  lifetime, own activity or received), the quality rules (post ≥ 20 characters or media, comment ≥ 10),
  levels, badge definitions, ranking scopes and periods. `GET /gamification/rules` shows the same data.
- **Ledger**: `PointTransaction` rows of kind award / reversal / reinstatement. Awards carry a unique
  `rewardKey` (user + action + sourceType + sourceId), so one event is rewarded once even under concurrent
  requests; reversals flip the award with a conditional update (`reversed: false → true`) and add a
  negative row; reinstatement flips it back. Totals always equal the ledger sum.
- **Student record**: `StudentGamification` (one per user): total and lifetime points, level fields,
  weekly/monthly points with their period keys, per-action counts, verified achievements (tie-breaker),
  badges, streak, campus fields and `eligible`. Every change is one atomic update pipeline
  (`updatePipeline: true`) that also rolls the weekly/monthly counters over when a new period starts.
- **Events** (`gamificationEvents.js`, registered at startup): subscribes to `campusEvents` (posts, likes,
  comments, projects, achievements, communities, memberships, opportunity tracking, profile changes).
  Each handler re-reads the content and makes the awards match its state (award / reverse / reinstate),
  so handlers are idempotent and order-independent; handlers for the same source run one at a time.
  Self-likes, self-comments, private items, moderated content, inactive accounts and the Anonymous Zone
  earn nothing. Shutdown waits for queued handlers.
- **Levels, badges, streaks**: `calculateLevel()` in `gamificationService` is the only level calculation;
  badges are checked after every positive change and granted once (`$push` guarded by
  `badges.key $ne`); streaks count days with the student's own activity in `GAMIFICATION_TIMEZONE`
  (`utils/periods.js`).
- **Rankings** (`rankingService.js`): filters on the record's campus fields (kept in step with the profile
  through `STUDENT_PROFILE_CHANGED`), sorted points ↓, verified achievements ↓, reached-at ↑, user ↑. A
  student's rank is a count of the records ordered before them. Pages are cached under
  `ranking:<version>:...` (Redis or memory) where the version changes on every points change.
  Inactive accounts found while building a page are marked ineligible. Leaderboards themselves need no
  cron jobs or snapshots: the weekly/monthly keys make periods self-resetting. (Ranking snapshots exist only
  for the elite rank tokens, below.)
- **Events out**: `gamification:level-reached`, `gamification:badges-earned`, `gamification:points-earned` and
  `gamification:rank-milestone` (Phase 11 notifications). Ranking milestones (`RANK_MILESTONES`): after a
  student gains points, their all-time rank on CampusX and at their college is checked with the same
  ranking rules; reaching the top 10 / top 3 / #1 (with more ranked students than the milestone and at
  least 5) is recorded once in `rankMilestones` and announced only when it beats their best. CampusX-wide #1
  and top 3 are still recorded but announced by the elite rank token notification instead (never twice).

## Elite rank tokens and the Hall of Fame

The Gold, Silver and Bronze tokens (Golden Champion, Silver Elite, Bronze Elite) belong to #1, #2 and #3 of
ONE leaderboard: the CampusX-wide all-time ranking (`ELITE_RANK_RULES.scope/period` in
`data/gamificationOptions.js`), so scopes are never mixed and at most three students hold a token. Nothing a
request sends can choose, claim or move a token: the only routes are reads.

- **Snapshots** (`services/eliteRankService.js`): a refresh calculates the top three with the leaderboard's
  own rules (`rankingService.topOfLeaderboard`: eligible students with points, same order and tie-breakers,
  inactive accounts leave the rankings on the way). A read that fails or doesn't look like a ranking moves
  nothing. Refreshes are asked for by `gamification:rankings-changed` (every points or eligibility change,
  debounced `refreshDelayMs`), by account deletion, and every `refreshEveryMinutes` by
  `jobs/eliteRankRefresh.js` (also shortly after start-up). One process runs them one at a time.
- **Ownership** (`EliteRankState`, one document per scope): same holders → only `checkedAt` changes. New
  holders → ONE compare-and-set on `{ seq, historySeq, checkedAt < computedAt }` moves all three tokens, so a
  slower, older snapshot or a second instance can never overwrite a newer result. That update is the commit
  point and saves what the history needs (`pending`).
- **History** (permanent, kept after a token is lost): `RankingSnapshot` (the top three as ranked, per `seq`),
  `EliteRankReign` (one uninterrupted holding: gained/lost times, reasons, `enteredTopThree`) and
  `EliteRankTransfer` (one token changing hands). All are upserts keyed by the snapshot number, so writing a
  snapshot's history again adds nothing. On a replica set (Atlas) the commit and the history run in one
  transaction (`utils/transactions.js`); on a standalone server whoever finds `historySeq < seq` finishes
  the history from `pending` before taking a new snapshot. Reasons: `first-snapshot`, `ranking`,
  `left-rankings` (account suspended or closed, no points).
- **After a change**: the holders cache (`services/eliteRankHolders.js`, a few seconds per process) and the
  leaderboard page cache are dropped, `gamification:elite-rank-changed` is emitted per student whose rank
  changed (→ `ELITE_RANK_CHANGED` notification, category `rankings`, dedupe key `elite:<scope>:<seq>` with
  policy `once`, so a repeated snapshot never notifies twice) and `elite:updated` `{ seq, at }` is broadcast
  to every socket (id-free: "read the holders again"). Then `historySeq` is set.
- **Identity**: `toStudentSummary` and public profiles carry `eliteRank` (`{ tier, rank, title, token, since }`
  or null) from the holders cache, so leaderboards, profiles, search, follower lists, recommendations and post
  authors all show the server's answer. If the state can't be read the last known holders are used (never
  guessed).
- **API**: `GET /rankings/elite` (holders, the viewer's own `you`), `GET /rankings/hall-of-fame?page&limit`
  (holders, previous holders per token, longest Gold reign, most top-three entries, totals, paged transfers),
  `GET /rankings/elite/students/:userId` (one student's reigns and stats; 404 for inactive accounts).
  Accounts that are no longer active appear in history as "a former CampusX student" (no id, no name).
- **Frontend**: `components/elite/` — `EliteRankName` (metal gradient text over a solid AA colour; `shine`
  only where a student is featured), `EliteProfileFrame` (ring outside the photo, emblem in the corner, same
  box with or without a token, cross-fades on change), `RankTokenBadge` (full / compact / icon, always with
  words for screen readers), `RankChangeAnimation` (short celebration or calm notice, `useEliteCelebration`
  remembers the last tier seen per device) and `EliteRankHistory` (profile section). Store
  `store/eliteStore.js`; page `/rankings/hall-of-fame`. Colours are `--elite-*` tokens in `styles/index.css`
  (every text stop ≥ 4.5:1 on Campus and Aurora, light and dark); shine and glow stop for reduced motion.
- **Tests**: `tests/api/elite-ranks.mjs` (incl. interrupted, repeated, stale, failed and concurrent snapshots
  through `tests/lib/elite-refresh.mjs`, and the transactional path on a replica set) and
  `tests/browser/elite-ranks.mjs`.

## Notifications and real-time (Phase 11)

- **Config**: `data/notificationOptions.js` holds the types (category, default title, repeat policy),
  preference categories, opportunity fields worth announcing, page sizes, deadline reminder timing and
  socket limits. Only activity CampusX has gets a type: no replies, mentions, follows or project comments.
- **Models**: `Notification` (recipient, actor or null, type, title, message with an `{actor}` slot filled
  with the actor's current name when shown, entity type/id, metadata, `dedupeKey`, `count`, `eventAt`,
  `isRead`, `readAt`). `NotificationPreference` stores only changed categories; missing means on.
- **Service** (`notificationService.js`, the only writer): `createNotification` / `createBulkNotifications`
  drop self-actions, inactive recipients and muted categories (system always arrives), apply the type's
  policy (`once`: never twice per key; `group`: update the unread one and count up, via an update pipeline;
  `always`), save in batches of 500, then push `notification:new`. `withdrawNotification` takes back an
  unread one when its event is undone (unlike). Reads (`getUserNotifications`, `getUnreadCount` with
  `countDocuments` on `{ recipient, isRead }`) check in batch whether linked content still exists.
- **Events** (`notificationEvents.js`, registered at startup): listens on `campusEvents`, re-reads the
  current state (a like already taken back notifies nobody) and takes recipients from the database:
  post authors, project owners and invitees, achievement owners (the reviewer stays internal), community
  owners (joins) and members whose own profile still fits the scope (announcements = posts by owners and
  moderators), students tracking an opportunity (updates, status, deadlines), and the student themself
  (badges, levels, ranking milestones, welcome). Handlers for the same subject run one at a time
  (`utils/keyedQueue.js`, shared with the gamification listeners).
- **Anonymous Zone**: anonymous like/comment events carry the post id only. The listener looks up the
  author internally and stores `actor: null` with "Someone ..." text: no name, id, photo or college of
  whoever acted reaches a notification, a socket payload or a log line.
- **Deadline reminders** (`jobs/opportunityDeadlineReminders.js`): a 30-minute in-process timer (no
  scheduler) reminds eligible students who saved, or are interested in, an opportunity whose deadline is
  within 24 hours. One reminder per deadline (dedupe key), so restarts and several instances are safe.
- **Sockets**: delivery only, to `user:<id>` rooms. A connection lasts as long as its access token; any
  session revocation (logout, token reuse, inactive account) emits `auth:session-ended` and disconnects
  that session's sockets. Handshakes are rate limited per IP (shared Redis/memory counter) and capped at
  10 open connections per student. Several API instances would need the Socket.IO Redis adapter (not added).
- **Retention**: nothing is deleted automatically. The `eventAt` index keeps a later retention job (or a
  TTL index on read notifications) simple.
- **Frontend**: `notificationStore` + `notificationApi`; `services/socket.js` keeps one connection per tab
  (token in the handshake, silent refresh after `unauthorized` or a server disconnect, automatic
  reconnection); `useNotificationsSocket()` in `CampusLayout` feeds socket events into the store and
  re-syncs over REST after a reconnect. The bell sits in the sidebar (dropdown panel) and the phone top bar
  (link to `/notifications`); `constants/notifications.js` maps types to icons and entities to pages.

## Search & Discovery (Phase 12)

- **Config**: `data/searchOptions.js` holds the search types and tabs, the sorts each category offers
  (only orderings backed by real fields), limits (2–100 characters, 6 words used, 5 per group in global
  search, 20 per page up to 30, 50 pages), the relevance weights, the text-index weights, stop words and the
  per-student rate limits.
- **Engine** (no AI, no embeddings): for each category one aggregation does
  `$match` (the feature's own visibility rule + filters + keywords) → `$addFields` (score) → sort → page,
  returning ids only; the page is then built by the feature's own allow-list view and checked against the
  visibility rule a second time. Keywords match through a weighted MongoDB **text index** (`search_text`
  on posts, anonymous posts, projects, communities, opportunities and achievements; stemming finds
  "hackathon" in "hackathons"), **word-prefix** regexes on short indexed fields ("rea" finds "React Campus
  App"), and the **ids of options** the query names ("CSE" → branch `cse`, "hackathon" → type `hackathon`,
  "VNIT" → college `vnit-nagpur`, "5th sem" → semester 5). MongoDB requires every clause beside `$text` in an
  `$or` to use an index, which is why `title`/`name`/`branch` got single-field indexes. Students are
  searched without a text index (names need prefix matching): every word must match a name, a skill or a
  campus option; describing words ("students", "sem", "engineering") are optional.
- **Query safety** (`services/searchQuery.js`): input is trimmed, single-spaced, stripped of control
  characters and capped; every word is escaped and used literally (never a user regex), the `$text`
  string is rebuilt from letters and digits (no quotes or `-` negations), and each search runs with
  `maxTimeMS` (answered 503 at the limit). Express-validator refuses short/long/punctuation-only queries
  and unknown filter values; `hpp` and the `$`-key sanitizer handle arrays and operators.
- **Relevance** (`services/searchRelevance.js`, one module): exact name/title 100, prefix 60, each word
  starting a title word 25 (+10 when it is a whole word), each tag/skill/tech match 20, each matched option
  15, a campus post by a student whose name matches 25, text-index score ×4 (max 40; title words weigh 10×
  a description), recent +6/+3, featured/official +5, closed opportunities −25. `calculateSearchScore()`
  (JavaScript, for suggestions) and `scoreExpression()` (aggregation) apply the same weights.
- **Visibility**: posts use `postService.visibleTo` (campus/branch/public/community membership, moderation
  status, own posts); Anonymous Zone posts `anonymousService.readableBy`; projects `projectVisibleTo`
  (+ not archived); achievements `showcaseVisibleTo`; communities `status: active` and
  (`communityAccess.scopeFilter` or an active membership), so a college/branch/class community never
  reaches anyone outside its scope; opportunities `opportunityAccess.listedFor` (published or closed only,
  for everyone, staff included: drafts and archived ones stay on the management pages). Students: active,
  onboarded accounts; email, roll number and account fields are never searched or returned. Content from
  inactive accounts is left out like everywhere else. Filters are discovery filters only.
- **Anonymous Zone**: posts merge into post results (same scorer, merged a page at a time), matched on
  title and content only. The author is never read, matched, scored or returned, so a search for a
  student's name can't surface their anonymous posts; results pass an allow-list without author/audience.
- **Results** (`sanitizeSearchResults`): one allow-list per type on top of each feature's own view, with
  people reduced to the public student summary; opportunities in the student view (no `createdBy`), and
  achievements without proof files or reviewer notes.
- **Suggestions**: topics from the static lists (skills, tech, interests, branches, colleges, opportunity
  types), "Students with X skills" / "X projects", plus up to 3 students, projects, communities and
  opportunities by prefix on indexed names. Collection lookups are cached for 30 s per campus scope
  (college, branch, semester) and include only things everyone in that scope may see; never anonymous
  posts, drafts, private or members-only items. The app debounces typing (300 ms) and cancels stale requests.
- **History** (`SearchHistory`, `searchHistoryService.js`): the query text and when it was last searched,
  one entry per query (unique `user + key`), newest 20 kept, page 1 searches only, nothing that looks like
  an email or phone number; listed, deleted one by one or cleared by its owner only.
- **Rate limits** (shared Redis/memory store, per student): 60 searches/min, 120 suggestion lookups/min,
  120 history requests per 15 min.
- **Frontend**: `searchStore` + `searchApi` (the shared Axios client); `/search` keeps the search in the
  URL (`q`, `type`, filters, `sort`, `page`) so refresh, links and back/forward work. Components live in
  `components/search/`: `GlobalSearch` (sidebar box on laptops, button on the tablet rail and phone top
  bar), `SearchInput` (ARIA combobox: ↓/↑, Enter, Escape), `SearchSuggestions`, `SearchTabs` (tab list,
  ←/→), `SearchFilters` (filter bar; bottom sheet on phones), `SearchResultSection`, one card per type,
  `SearchEmptyState`, `SearchSkeleton`, `RecentSearches`. Campus posts reuse the feed's `PostCard`
  (`feedStore.external` keeps their likes/saves/edits in step); anonymous posts use the Anonymous Zone's
  byline ("Anonymous Student"). `constants/search.js` holds `searchResultPath()`, the one place results
  are mapped to routes.

## Trust & Safety (Phase 13)

- **Config**: `config/moderationConfig.js` (content statuses and which are public/searchable, risk levels and
  thresholds, actions, the original SpamDetector rules, link/abuse/promotion/opportunity/comment/account
  signals, the enforcement ladder, report reasons per target type, legacy reason mapping, case decisions) and
  `config/moderationLimits.js` (behaviour limits that become signals, fake-engagement limits, 429 limits). No
  moderation number lives anywhere else.
- **Statuses** (posts, comments, projects, achievements, communities, anonymous posts/comments; shared fields
  in `models/moderationFields.js`): `approved` (default, content goes live at once) · `flagged` (still visible,
  but out of search and rankings) · `pending`/`restricted` (only the owner sees it, with a short notice) ·
  `removed` (soft delete: `deletedAt`, `deletedBy`, `deletionReason` kept internally). Automated checks only
  move content up this ladder; only a moderator (or reports for `flagged`) changes it otherwise.
- **Pipeline** (`services/moderationService.js`): content services call `analyzePost` / `analyzeComment` /
  `analyzeAnonymousPost` / `analyzeAnonymousComment` / `analyzeProject` / `analyzeAchievement` /
  `analyzeCommunityContent` / `analyzeOpportunity` before saving, save with the returned status, then call
  `recordOutcome` (case, audit log, owner notification, progressive enforcement). Every analysis returns
  `{ score, riskLevel, flags, reasons, recommendedAction, status }`: low → publish, medium → publish + flag
  (LIMIT when only behaviour is off), high → hold (restricted), critical → restrict + escalate. Signals:
  - the **original SpamDetector** (`services/spamDetectionService.js`, ported from the earlier CampusX build
    word for word: spam phrases +25, clickbait +15, capitals +20, `!!!`/`???` +15, exact duplicate of one of
    the author's last 5 posts in an hour = 100, Jaccard > 0.8 = 85, cap 100; added: texts under 3 words are
    never duplicates)
  - links (unsafe schemes are severe; IP hosts, `user@host` tricks, punycode, shorteners and many links add
    up; ordinary links score 0), threats (always escalated), harassment and abusive words, promotion,
    pay-to-claim wording (opportunities only), copy-paste / very short repeated comments
  - behaviour: per-student counters on the shared Redis/memory store (`SharedCounterStore`, the rate limiters'
    store), e.g. a 6th post in 10 minutes; account signals (repeat offender, high risk, new account acting
    fast) only add weight to something already suspicious.
  Opportunities are staff content: never hidden automatically, a suspicious one only opens a case.
- **Fake engagement**: likes are tracked per student (more than 40 a minute), per student and item (like/unlike
  toggling) and per item (a burst of 30 a minute). Nobody is punished: the student's likes and comments stop
  counting for rankings for 10 minutes (`engagementCounts`), internal risk rises, an item burst opens a case.
  Self-likes and self-comments are allowed as actions but never earn points or notify.
- **Enforcement** (per student, internal `User.moderation`, `select: false`, never serialised): a violation
  (content held, restricted or removed) → warning; 3 in 30 days → no new content for 24 h; 5 → 72 h + a
  critical case for a moderator. Reading, liking and reporting keep working; nothing bans an account.
- **Reports** (`models/Report.js`, `services/reportService.js`): one model for posts, comments, projects,
  communities, opportunities, achievements, students and anonymous posts/comments. One active report per
  student per target (unique partial index), reasons per target type, can't report your own things or what
  you can't see (404). Each report joins the target's case; 3 different reporters flag the content (never hide
  it). Report abuse: 10 an hour (429); many a day or more than 5 about the same person → `suspicious`, lower
  priority, internal risk; a pause after too many. Phase 5/8/9 report endpoints still work (reasons mapped);
  older reports stay in `PostReport`, `OpportunityReport`, `AnonymousReport`.
- **Cases and audit**: `ModerationCase` (one active per target; sources automated/report; score, level,
  flags, reasons, priority; internal `targetOwner` and `reportedBy`) and `ModerationAuditLog` (append-only:
  actor or system, action, previous/new status, short reason, ids/scores/flags only; no content text).
  `services/moderationCaseService.js` + `/api/v1/moderation` (staff only) lists and decides cases: approve,
  restrict, remove, warn, dismiss, escalate. The Phase 15 dashboard builds on it.
- **Integrations**: gamification counts only `approved` content and reconciles on `CONTENT_MODERATED`
  (reversals and reinstatements through the existing ledger); notifications for held/removed/restored
  content, warnings, posting pauses and reviewed reports (`category: system`), and held content never
  triggers like/comment/announcement notifications; search returns `approved` content only.
- **Anonymous Zone**: analysed and enforced like everything else, with the author used internally only. Events
  about anonymous content carry no user id; case and report responses never include the author; the audited
  `services/anonymousModeration.js` lookup stays the only way to reveal one.
- **Frontend**: `ReportModal` + `ReportButton` (one form for every target; reasons from `/reports/options`),
  `ModerationNotice` (owner-only status), `ContentWarning`, `SafetyGuidelines`, `/safety` (also
  `/community-guidelines`) with the student's own reports and withdraw, `reportStore` + `reportApi`. The Phase
  5/8/9 report modals were replaced by the shared form.

## Recommendations (Phase 14)

A transparent, rule-based discovery engine. No machine learning, no external AI, no embeddings: every
item is scored by fixed weights and students only see plain reasons ("Matches your React skills"), never
scores. Same student, same content, same moment → same order.

- **Config**: `config/recommendationConfig.js` holds everything: `RECOMMENDATION_TYPES` (posts, projects,
  communities, opportunities, students, achievements, campusActivity), `RECOMMENDATION_WEIGHTS` (interest 30,
  skill 30, college 15, branch 15, semester 10, recent activity 10, popularity 5, freshness 10, community 15,
  opportunity type 20, quality 5, deadline 10; penalties: "Not interested" in similar 25, ignored 10),
  match rules, freshness half-lives per type, diversity rules, candidate limits and windows, result sizes,
  profile/feedback/interaction rules, cache TTL, rate limits, the interest → area mapping
  (`INTEREST_SIGNALS`, built on Phase 8's `INTEREST_MATCHES`), every reason string and the reason order.
- **Pipeline** (`services/recommendationService.js`): student profile → candidate retrieval → eligibility and
  visibility (inside the queries) → scoring → diversity → safety filtering of the final views → top N.
  - `buildStudentProfile(viewer)`: the account itself (college, branch, semester, interests, skills, read from
    `req.user` on every request) plus the derived profile, communities, tracked opportunities, dismissed and
    reported items, "Not interested" traits and ignored items.
  - **Derived profile** (`models/RecommendationProfile.js`, `services/recommendationProfileService.js`): what
    CampusX learned from activity, never a copy of the account: learned interests, skills used in the
    student's own projects/achievements, topic keywords, preferred post types / opportunity types / community
    types / project categories / achievement types, activity counts and the newest 100 signals (likes,
    comments, recommendation clicks, as plain traits like `postType:event`, `keyword:react`). Rebuilt from
    indexed per-student data when stale (30 min, or marked stale by an event). Searches are mapped to CampusX's
    own topic lists; no search text is stored. Nothing from the Anonymous Zone is ever recorded.
  - **Events** (`services/recommendationEvents.js`, registered in `server.js`): likes/comments on campus posts and
    project likes add signals (checked against the database, undone on unlike, never for one's own content);
    profile edits, joining/leaving communities, tracking opportunities and the student's own projects and
    achievements mark the profile stale and start a new cache version.
  - **Candidates** (`services/recommendationCandidates.js`): per type, 2–4 small capped "pools" (profile match,
    recent, campus, communities), never a collection scan. Posts use the Phase 12 text index for topics. Each
    pool already applies the feature's own visibility rule, `RECOMMENDABLE` (= search's approved-only rule
    from Phase 13), never the student's own content; opportunities must be listed, open (`openFilter`) and
    eligible for the student's own college/branch/semester (`eligibleFilter`); communities must fit the
    student's scope and not be joined or banned from; students must be active and onboarded. A new
    `users.interests` index serves "Students with similar interests".
  - **Scoring** (`services/recommendationScoring.js`, pure): `calculateRecommendationScore(item, context)` =
    profile fit (interests, skills, campus, communities, opportunity type, learned activity) + popularity
    (log-scaled) + `applyFreshness` (half-life per type) + deadline + quality − penalties; returns the score,
    the profile-fit part and up to two reasons (strongest first, specific before generic on ties).
    `applyDiversity` picks greedily with a decay per repeated key (category, author, organizer, ...), caps
    per key, and gives every 4th slot to the best non-profile item (new or popular campus content), so lists
    never narrow to one topic. `mixRecommendations` builds "For you" across kinds (at most 2 of each).
  - **Trending** (kept apart from "For you"): campus posts and projects by recent engagement over age
    (`(likes + 2·comments) / (hours + 2)^1.5`, own campus ×1.5) and Anonymous Zone discussions the student may
    read (only engagement and age are read; reason "Trending anonymous campus discussion").
- **Cache**: each ranked list (ids + reasons, scores stay server-side) is cached per student for 10 minutes
  under `recommendations:v1:user:<id>:<version>:<type>` (Redis when connected, memory otherwise; a cache outage
  only means ranking each time). Events and "Not interested" bump the student's version. Items are always
  hydrated fresh through each feature's own views and filters (`filterUnsafeContent` drops own items,
  dismissed/reported items, joined communities, closed/ineligible/tracked opportunities), so anything deleted,
  held, made private or expired after ranking disappears at once.
- **Feedback** (`models/RecommendationFeedback.js`): `{ user, targetType, targetId, action, traits, createdAt }`,
  TTL 90 days. "Not interested" hides the item and lowers similar items of the same kind for 14 days (traits
  are scoped per kind, e.g. `communities|interest:ai-ml`); "dismiss" only hides the item. Reported items are
  never recommended to their reporter. No block system exists yet; the hidden sets are where blocked users
  will plug in.
- **Interactions** (`models/RecommendationInteraction.js`): one small counter document per student per item
  (impressions, at most one an hour; clicks), TTL 30 days. Shown 5+ times and never opened → ignored penalty;
  a click also teaches the derived profile.
- **API** (`routes/recommendationRoutes.js`, `controllers/recommendationController.js`,
  `validators/recommendationValidator.js`): home, discover, one list per type, dismiss, interactions; always
  `req.user`, per-student rate limits. The Phase 6/8 widgets (`/communities/recommended`,
  `/opportunities/recommended`) keep their own rules unchanged.
- **Frontend**: `recommendationStore` + `recommendationApi`; `components/recommendations/`
  (`RecommendationSection` rows/grids/lists with arrows on wide screens, `RecommendationCard` compact
  mixed card + "Not interested" menu, `Recommended{Post,Project,Community,Opportunity,Student,Achievement}Card`
  reusing the feed's `PostCard` and Phase 12's compact cards via optional `reason`/`menu` slots,
  `RecommendationReason`, `RecommendationSkeleton`, `TrendingSection`, `ForYouFeed`); `/discover`
  (`DiscoverPage`: For you, six sections, chips for one kind, trending); `/home` keeps the campus feed as the
  default with a "Campus | For you" switch, a short "Recommended for you" row and trending + opportunities in
  the sidebar. "Discover" is in the campus navigation.

## Admin control center (Phase 15)

A separate console at `/admin` for CampusX moderators and admins, built on the Phase 13 moderation backend
rather than beside it: no second audit log, case system, JWT system, database connection or opportunity
service.

- **Authorization chain** (`routes/adminRoutes.js`): `middleware/adminAuth.js` (`requireDatabase` →
  `authenticate` → staff role from the database, 403 + `ACCESS_DENIED` audit for students → per-staff rate
  limit → `no-store`, the caller's address on `req.user.$locals.auditIp`, cache invalidation after successful
  changes) → `middleware/adminPermission.js` `requirePermission(...)` → validator
  (`validators/adminValidator.js`) → controller (`controllers/admin/*`) → service (`services/admin/*`), which
  calls `assertPermission` again.
- **Permissions** (`config/adminConfig.js`): `ROLE_PERMISSIONS` maps roles to permission names; nothing checks
  `role === 'admin'` for access. Admins: all eleven. Moderators: dashboard, reports, moderation, content,
  opportunities, the audited anonymous-author reveal. Admin-only: users, communities, analytics, audit logs,
  system (status changes of moderator accounts). The same file holds every admin action (with its
  `confirm`/`reason` requirements), page sizes, cache lifetimes and rate limits.
- **Services**: `dashboardService` (cards with 7-day trends, 14-day activity, content creation, case status,
  risk radar, threat monitor, system status), `moderationService` (queue with filters, case detail, decisions
  through `moderationCaseService.decideCase`, the reveal through `anonymousModeration`), `reportService`
  (atomic review/resolve/reject/escalate; closing reuses Phase 13's `closeReport`), `userManagementService`
  (allow-listed projections, search across names/email/college/branch names, status changes that revoke every
  session), `contentManagementService` (content tabs and communities; actions go through the open case when
  there is one, else `applyModerationAction` + `recordViolation`; achievement verification via Phase 7's
  `reviewAchievement`), `analyticsService` (7/30/90-day series and distributions), `auditService` (the admin
  side of `ModerationAuditLog`), `adminTargets` (one preview loader per kind), `adminSeries` (day buckets in
  the CampusX time zone), `adminCache` (cache keys and invalidation), `adminRealtime` (staff socket events).
  Opportunity management reuses the Phase 8 controller handlers behind the admin gate.
- **Phase 13 extensions** (no behaviour removed): a `flag` case decision (keeps the case open), one decision per
  case at a time (`utils/keyedQueue.js` `createKeyedLock`; the second gets 409), `REPORT_CREATED` and
  `MODERATION_CASE_OPENED` campus events, `closeReport` for single reports, `ip` and a `student` actor role on
  audit rows, and anonymous-author lookups written to the audit log (`ANONYMOUS_AUTHOR_REVEALED`).
- **Audit**: everything goes to `ModerationAuditLog`: staff sign-ins (`authController.login`), refused admin
  requests (deduplicated for 10 minutes), status changes, report handling, opportunity changes (both route
  groups), verification, reveals and every moderation decision. Ids, statuses and short reasons only; never
  passwords, tokens, secrets or content text.
- **Anonymity**: anonymous content is previewed without any author; the reveal needs a permission, an open
  case about that content, a reason, and is audited. Phase 13 enforcement rows (a warning recorded against a
  student because their anonymous post was removed) would link the two by their `metadata.source`, case id and
  timestamp, so the audit views leave those rows out of the student's own history and show them without the
  student (`anonymityProtected`) in the full log. Student detail never counts or lists anonymous content.
- **Real time**: `sockets/socketAuth.js` reads the role from the database; staff sockets join a `staff` room;
  `emitToStaff` sends `admin:newReport`, `admin:newModerationCase` and `admin:systemAlert` (real database and
  Redis connection events). Payloads are ids, kinds and levels.
- **Caching**: dashboard (30 s), moderation summary (30 s) and analytics per range (120 s) on the existing
  `cacheService` (Redis, memory fallback). Successful admin changes clear them; builds read a fresh summary
  so the numbers on one page agree.
- **Frontend**: `layouts/AdminLayout.jsx` (lazy-loaded: students never download admin code) calls
  `useAdminThemeScope()`, so `<html>` carries `admin-theme` plus the Aurora Glass classes in the admin's own
  light/dark variant while it is open (see Theming). `styles/index.css` maps the `--ax-*` tokens onto the
  shared Aurora Glass palette (chart series validated against both glass surfaces for colour-vision
  deficiency), and the semantic `--cx-*` tokens follow the same palette, so shared pieces (inputs, modals,
  toasts, the Phase 8 opportunity form) match without changes. `components/admin/*` (sidebar with full / rail / drawer variants, header with live
  alerts and real system status, stat cards, SVG charts with hover/keyboard readouts and data tables, risk
  radar, tables with phone layouts, case detail, confirmation modal), `pages/admin/*`, `routes/AdminRoute.jsx`
  (per-page permission guard, UX only), `store/adminStore.js`, `services/adminApi.js`,
  `hooks/useAdminSocket.js`. Opportunity management API calls now go through `/admin/opportunities`.

## Security hardening (Phase 16)

Everything below is deterministic; the full checklist with known gaps is
[docs/security/SECURITY_CHECKLIST.md](../security/SECURITY_CHECKLIST.md).

| File | Responsibility |
| --- | --- |
| `config/securityConfig.js` | Every Phase 16 rule: request screening limits, sign-in rules, security events and their throttles, abuse pattern, upload names, PDF markers, placeholder secrets |
| `services/securityService.js` | `recordSecurityEvent()` (throttled log line + per-process counters + audit row for account events), `sanitizeSecurityMetadata()`, `checkRequestRisk()`, unknown-email lock, `detectSuspiciousLogin()`, `recordRateLimitHit()` and `detectAbusePattern()` |
| `utils/sharedCounterStore.js` | The Redis-or-memory counter store (moved out of `middleware/rateLimiter.js`, which re-exports it) |
| `utils/uploadSafety.js` | Upload file-name rules and the PDF active-content check |
| `services/admin/securityStatusService.js` | `GET /admin/security/status` (`VIEW_SECURITY`, admins) |

- **Startup** (`config/env.js`): production refuses missing, short or example `JWT_SECRET`, `*`/malformed/http
  origins and access tokens longer than 1 h, and never generates a secret. Development warns about short secrets.
- **Security events** go to the server log (throttled, sanitized); events about an account also go to the admin
  audit log under Security, written as the automated system. Events caused by Anonymous Zone requests keep
  neither the student nor the address and never count toward the abuse pattern.
- **Rate limiter refusals** are events (`label` per limiter). Three separate limit episodes in 24 h raise the
  student's Trust & Safety risk a little and add the `rate_limit_abuse` flag (`moderationService.adjustRisk`).
- **Uploads**: the temporary file name comes from the allowed MIME type, never the client; names and PDFs are
  screened before Cloudinary sees anything; busboy parse errors become 400.
- **Socket.IO**: 16 KB inbound message cap; the staff room is re-checked against the database (role, status,
  live session) before each staff broadcast.
- **Logs**: `utils/logger.js` masks URI credentials, bearer tokens, JWTs and secret-looking key/value pairs.

## Semester Roadmap

A semester-by-semester career path on the student's own profile (`/profile/roadmap`). API details:
[docs/api/README.md](../api/README.md#semester-roadmap).

| File | Responsibility |
| --- | --- |
| `data/roadmapOptions.js` | Career goals (with the interests/branches that suggest them), branch tracks (computing, electronics, core), semester focus, every milestone (category, difficulty, effort, objectives, skills, prerequisites, per-goal variants, `optionalFor` / `requiredFor`), checked https resources and allowed CampusX paths, rate limits. `assertRoadmapCatalog()` runs at import, so a bad id, link or prerequisite stops the server |
| `models/StudentRoadmapProgress.js` | One record per student: `careerGoal`, `goalChosenAt`, `selectedSemester`, `milestones` (map of milestone id → `{ status, startedAt, completedAt, updatedAt }`), `templateVersion`, `lastActivityAt`. Unique on `user`. No campus details copied from the User |
| `services/roadmapService.js` | `resolveRoadmap(goal, track)` (catalog + variant, optional/required), `buildRoadmapView()` (states, progress, next milestone, skills; all calculated, nothing stored), reads, `setMilestoneStatus()` and `updatePreferences()`; checks at start-up that every goal on every track has required milestones in all eight semesters |
| `routes/roadmapRoutes.js`, `controllers/roadmapController.js`, `validators/roadmapValidator.js` | `/api/v1/roadmap`: authenticated, the signed-in student only, `roadmapUpdateRateLimiter` on changes |
| `services/gamificationEvents.js` (`reconcileRoadmap`) | `ROADMAP_PROGRESS_CHANGED` and `STUDENT_PROFILE_CHANGED` → award or reverse `ROADMAP_SEMESTER_COMPLETED` per semester from the stored state (keyed queue per student) |

- **Changes are conditional updates** on the milestone's own path (`milestones.<id>.status` not already the
  target), so double clicks, retries and simultaneous requests change it once. Whether a change completed its
  semester is judged on the record just before that update plus the change itself, so exactly one of two
  simultaneous "last milestone" requests reports `semesterCompleted`.
- **Goal changes never delete records**: the view simply resolves the roadmap for the new goal. Shared milestone
  ids (most semester 1–4 and career milestones) stay complete; the others are reported as `savedElsewhere` and
  count again after switching back. The suggested goal is saved with the first change so a later change of
  interests can't swap the roadmap.
- **Rewards** go through the Phase 10 ledger only (once per semester number, reversal and reinstatement like
  any other award), never from the request itself.
- **Frontend**: `store/roadmapStore.js` applies only the server's answer (no optimistic ticks; one request per
  milestone at a time); `pages/roadmap/SemesterRoadmapPage.jsx` keeps the open semester in `?semester=` and saves
  it quietly (debounced) as `selectedSemester`. `components/roadmap/` holds the hero, the journey/tabs
  (`SemesterTimeline`, roving tabindex, arrow keys), `SemesterPanel` (direction-aware `AnimatePresence`
  transition with staggered milestones; under reduced motion the new semester replaces the old in the same
  frame), `MilestoneCard` (tick drawn after the save, one-off sparkle, details with objectives, project and
  resources), the in-place `SemesterCompletionCelebration` (never a modal), `SkillMastery`, `NextTaskCard`,
  `CareerGoalPicker` and the profile entry `RoadmapProfileCard` (passed to `ProfileView` as `banner`).
- **Follow-up, not built**: managing templates from the admin control center (create and edit milestones,
  assign semesters, branch tracks and goals, resource links, publish/archive, preview). Templates are reviewed
  code for now. Moving them to a `RoadmapTemplate` collection needs a new admin-only permission (moderators
  would not get it automatically), an editor with the same link checks on save, audit rows, and a version bump
  that keeps students' stored milestone ids valid.

## Resume Builder

Students build resumes from their CampusX profile (`/resume-builder`, opened from the Resume Builder card on their
own profile and from the phone account sheet). API details:
[docs/api/README.md](../api/README.md#resume-builder).

| File | Responsibility |
| --- | --- |
| `data/resumeOptions.js` | Templates (id, category `fresher`/`general`, offered accents and fonts, default spacing and page mode, default section order), target roles (suggested template, common skills), sections, accents, limits sized to the request screening, rate limits, AI tasks, and the word lists the importer and checker use (skill groups, known skills for job descriptions, vague phrases, action verbs) |
| `models/Resume.js` | One document per resume: `owner`, `name` + `nameKey` (unique per owner), `targetRole`, `customRole`, `template`, `isDefault` (unique partial index: one default per owner), `settings`, `sections` (`order`, `hidden`, `titles`, `customOrder`), `content` (one object, shape enforced by the service), `revision`, `importedAt`, `lastExportedAt`, `exportCount` |
| `services/resumeContent.js` | The allow-list for every write: field by field, lengths, http(s) links with real hosts, `YYYY`/`YYYY-MM` dates, list limits, item ids; section order completion; settings a template offers |
| `services/resumeService.js` | Every read and write, always filtered on `owner: req.user._id`; names ("(2)" when taken), the 20-resume limit, default handling, optimistic concurrency on `revision`, duplicate, delete with default promotion, export counting |
| `services/resumeImportService.js` | "Import My CampusX Profile": a read-only draft from the student's own profile, projects (owned or accepted team place), achievements and completed roadmap learning; removed or rejected items left out |
| `services/resumeAnalysisService.js` | The resume checker (explained rules, a weighted score, keyword matching for job descriptions); also used by the AI guard rails |
| `services/aiProvider.js`, `services/resumeAiService.js` | The server-side AI provider abstraction (Google Gemini through `@google/genai`, `models.generateContent` with `responseJsonSchema`; `null` without a key; quota → 429, outages retried once, no provider details passed on) and the resume assistant tasks: prompts with resume facts only (no contact details), JSON-schema answers, size caps, and warnings for numbers or technologies not in the resume |
| `routes/resumeRoutes.js`, `controllers/resumeController.js`, `validators/resumeValidator.js` | `/api/v1/resumes`: authenticated, the signed-in student only, per-student rate limits on writes, checks and AI |

- **Ownership**: no route takes a user id; every query includes the owner, so another student's resume is a 404
  and can't be read, changed, copied, exported, checked or deleted. Account deletion removes a student's resumes
  (`services/accountDeletionService.js`).
- **Concurrency**: updates name the `revision` they were based on and are applied with a conditional update, so a
  stale tab gets a 409 instead of overwriting newer work. Default changes and downloads don't bump the revision.
- **No invented content**: the importer copies only what the student wrote on CampusX and leaves unknown details
  (phone, links, degree, dates, CGPA) empty; the checker never promises outcomes; AI suggestions are reviewed and
  edited by the student, with unsupported numbers and technologies flagged.
- **Frontend**: `pages/resume/ResumeBuilderPage.jsx` (saved resumes: create, edit, download, duplicate, rename,
  default, delete) and `pages/resume/ResumeEditorPage.jsx` (ten steps in `?step=`, live preview, autosave via
  `hooks/useResumeEditor.js`, which saves 1.2 s after typing stops, before downloads, checks and leaving, and
  reports conflicts). Steps live in `components/resume/steps/`; the phone preview is a portal (the routed page
  sits in a transformed container); `StepNav`'s scrolling list is `relative` so its `sr-only` labels can't widen
  the page.
- **Layout and PDF** (`utils/resume/`): `layout.js` is a small layout engine (paragraphs with styled runs, rows
  with right-aligned dates, bullets, tags, columns, keep-together stacks, flows across A4 frames) that measures
  text with jsPDF's own font metrics (kerning off, as jsPDF draws it) and produces drawing operations per page.
  `templates/*.js` are the ten layouts (each genuinely different: centred ruled classic, accent graduate,
  developer with links header and skills table, tinted section bands with an objective box, compact one-page, CV
  with a date column, left-aligned classic, colour header band with project cards, side headings, two columns
  with a tinted sidebar). `document.js` builds the theme from the settings and, for "fit on one page", tightens
  spacing and type (body text never below 9 pt), keeping extra pages rather than cutting anything.
  `components/resume/ResumePage.jsx` draws the operations as SVG (each run's `textLength` pinned to the measured
  width) and `pdf.js` writes the same operations with jsPDF, so the preview and the PDF match. `characters.js`
  maps text to what the standard PDF fonts can draw (₹ → Rs., ā → a), the same table the backend checker uses.
  Printing renders the pages into a print-only container (`styles/index.css`, "Resume printing").
- **Dependencies**: `jspdf` (frontend, loaded only with the resume pages) and `@google/genai` (backend, used
  only when `GEMINI_API_KEY` is set).

## Follows, blocks and direct messages

Follow / Following on profiles, lists and student cards; student-to-student blocks; one-to-one conversations.
API details: [docs/api/README.md](../api/README.md#follows-and-blocks).

| File | Responsibility |
| --- | --- |
| `data/socialOptions.js` | Page sizes, message limits, rate limits (`SOCIAL_RATE_LIMITS`) |
| `models/Follow.js` | `{ follower, following, followerActive, followingActive, createdAt }`; unique on follower + following; `{ following, followerActive, _id }` and `{ follower, followingActive, _id }` for counts and cursor lists |
| `models/Block.js` | `{ blocker, blocked }`; unique pair, plus `blocked` for account deletion |
| `models/Conversation.js` | Two `participants`, unique `pairKey` ("smaller id:larger id"), per-member `lastReadId` / `lastReadAt`, `lastMessage` preview and `lastMessageAt` (null until the first message, so empty conversations are in no inbox) |
| `models/Message.js` | `{ conversation, sender, text, clientId? }`; `{ conversation, _id }` for history and unread counts; unique `{ conversation, sender, clientId }` for retried sends |
| `services/followService.js` | The only writer of follows and blocks: follow/unfollow (upsert on the unique index; re-checks blocks and status after inserting), lists (cursor on `_id`, name search through a `$lookup` with a time limit), follow status for cards, block/unblock (ends follows both ways), `syncFollowVisibility()` (called by `admin/userManagementService.changeUserStatus`), live updates |
| `services/messageService.js` | The only reader/writer of conversations and messages: `loadOwnConversation()` (participant filter in the query itself, 404 otherwise), open (find or create on `pairKey`), inbox, history, send (retry → saved message; active account, blocks, `assertCanPublish`, unsafe links), mark read (forward only), unread conversation count, delivery |
| `routes/userRoutes.js`, `routes/conversationRoutes.js` + `controllers/followController.js`, `controllers/messageController.js`, `validators/socialValidator.js` | `/api/v1/users/...` and `/api/v1/conversations/...`: `authenticate`, per-student limiters, validated ids and bodies (only `text` and `clientId` reach `sendMessage`) |
| `services/notificationEvents.js` (`onFollowChanged`) | `STUDENT_FOLLOWED` / `STUDENT_UNFOLLOWED` → `STUDENT_FOLLOWED` notification once per follower (dedupe key `follower:<id>`), withdrawn when unfollowed unread |

- **Counts come from the relationships.** `countDocuments` on the indexes above, never a stored counter, so
  duplicates are impossible (unique index) and there is nothing to drift. The `…Active` flags keep suspended,
  blocked or closed accounts out of counts and lists without deleting the relationship.
- **Concurrency.** Follows and conversations are created with an upsert / insert on a unique key, and a duplicate-key
  error means "someone else just created it" (the existing one is used). Read pointers only move forward
  (`lastReadId` compared in the update filter), the inbox preview only moves to a newer message, and a retried send
  is answered from the unique `clientId`.
- **Realtime.** Sockets stay delivery-only (`sockets/socketEvents.js`): `relationship:updated` to the acting
  student's own tabs, `follow:counts` (numbers only, never who) to the student whose counts changed,
  `message:new` / `conversation:read` / `message:unread-count` to the two participants' rooms. Results carry `at`
  (server time) so the app ignores a late update older than an answer it already has.
- **Account deletion** (`accountDeletionService.purgeAccountData`, step 7) removes follows and blocks in both
  directions, and the account's conversations with their messages (messages first, so a repeat still finds them).
- **Frontend**: `store/followStore.js` (one entry per student shared by every screen; optimistic follow with exact
  rollback; one request per student at a time; batched follow status for cards), `store/messageStore.js` (inbox,
  threads with cancellable loads, optimistic sends with `clientId` and retry, read marking while a chat is visible,
  resync after a reconnect), `hooks/useNotificationsSocket.js` (feeds all three stores from the one socket).
  `components/social/FollowButton.jsx` holds the follow animation (spring press, glow, six "+" sparks, drawn tick,
  label roll; `useReducedMotion` → crossfade only), `AnimatedCount`, `FollowStats`, `FollowListModal` (the shared
  `Modal`, tabs with arrow keys, `?list=` in the URL, staggered rows, infinite scroll, server-side search),
  `MessageButton`, `BlockDialog`. `pages/messages/MessagesPage.jsx` + `components/messages/` (inbox, chat, thread
  with day separators, "Seen", load-earlier keeping the scroll position, composer).
- **Not built**: message deletion/editing, attachments, typing indicators (clients never send over sockets),
  message requests or "who can message me" settings, hiding a blocked student's posts elsewhere on CampusX, and
  a list of blocked students (unblock is on the student's profile or in the chat).

## Account deletion

A student deletes their own account from the Danger Zone at the bottom of `/profile`. API details and the full
data policy: [docs/api/README.md](../api/README.md#delete-authaccount).

| File | Responsibility |
| --- | --- |
| `routes/authRoutes.js` → `controllers/authController.js` → `services/authService.js` (`deleteAccount`) | `DELETE /auth/account`: origin check, `authenticate`, `accountDeletionRateLimiter`, `deleteAccountRules` (password + typed `DELETE`); the service refuses staff and checks the password with the same `passwordMatches()` helper as sign-in and password change |
| `services/accountDeletionService.js` | Lock (`status: "deleting"` while the checked hash is current) → `purgeAccountData()` (in a transaction when `supportsTransactions()`; idempotent steps otherwise) → `finishDeletion()` (closes sockets, emits `POST_UNLIKED` / `COMMENT_DELETED` / `COMMUNITY_ARCHIVED` so listeners reconcile other students' points and notifications, notifies new community owners, refreshes leaderboards, audits) → background follow-up (Cloudinary removal, then one sweep for late records) |
| `models/AccountDeletion.js` | One record per deletion: `purgedAt` / `finishedAt` / `completedAt`, the affected posts and communities until the follow-up ran, Cloudinary ids still to remove with attempts and next retry, counts. TTL 30 days after completion |
| `jobs/accountDeletionCleanup.js` | Every 10 minutes (and 30 s after start): `resumeDeletions()` finishes locked accounts left alone for 5 minutes, follow-ups that never ran, and due file retries |
| `sockets/socket.js` | `AUTH_ACCOUNT_DELETED` disconnects every socket in the student's room |
| Frontend: `components/profile/DangerZoneCard.jsx`, `DeleteAccountDialog.jsx`, `hooks/useDeleteAccount.js`, `store/clearAccountData.js` | Danger Zone (staff see a note instead), the confirmation dialog (password with show/hide, typed `DELETE`, one request at a time, cannot be closed while running), then: socket closed, session cleared (other tabs follow through the session-hint `storage` event), every store reset, onboarding draft and per-account local flags removed, login page with a confirmation |

- **Ordering keeps it safe.** Files are listed before their records are deleted and removed from Cloudinary only
  after `purgedAt`; the user document is deleted last, so a locked account is always found again by the job
  until everything else is gone.
- **Transactions.** With a replica set (Atlas) the whole purge is one transaction: a failure rolls back, the
  account is reopened and the request answers 500 with the session intact. A standalone server (local MongoDB,
  the test mongod) runs the same steps one by one; an interruption answers 202, keeps the account locked and
  signed out, and the job finishes it. Counters touched on other students' content (comments, members) are
  recalculated from what remains rather than decremented, so repeating a step can't skew them.
- **Anonymity.** Nothing in the Anonymous Zone is changed, and the audit row carries counts of campus content
  only, so neither other students nor staff screens can tie anonymous posts to the deleted account by timing.

## Authorization and ownership

**Rule:** a student can always edit and delete their own posts and comments, and can never edit or
delete anyone else's. The backend enforces this; hiding buttons in the UI is only a convenience.

```js
// services/postService.js
export async function loadOwnPost(postId, viewer) {
  const id = toObjectId(postId);
  const post = id ? await Post.findById(id) : null;
  if (!post) throw ApiError.notFound(POST_NOT_FOUND);
  if (!post.author.equals(viewer._id)) throw ApiError.forbidden(NOT_POST_OWNER); // "You can only modify your own post."
  return post;
}
```

- `authenticate` verifies the token and session and sets `req.user` from the database. Controllers
  pass `req.user` to the services and never read an author id from the request; validators plus
  `matchedData` keep anything else in the body out.
- Ownership is checked twice: `loadOwnPost` before anything is uploaded or changed (`PUT` runs it as
  `requirePostOwner` before multer), and again in the write itself (`{ _id, author: viewer._id }`).
- Comments use the same pattern (`403 "You can only modify your own comment."`). Post authors can't
  delete other students' comments in this phase.
- The checks live in the services, so every future entry point (sockets, jobs) gets them.
- Admin moderation (Phase 15) uses its own explicit permission checks (`config/adminConfig.js`) and acts
  through the moderation services. It never relies on skipping the owner check.
- Deleting a post removes its Cloudinary files first (failures logged, never blocking), then the post
  and its comments. Reports stay for moderation.

## Frontend

### Structure

- `routes/router.jsx`: one data router. Pages are lazy-loaded chunks. Three layout groups:
  `PublicLayout` (landing, login, register), `CampusLayout` (everything inside campus) and `AdminLayout`
  (the `/admin` control center for moderators and admins, its own lazy chunk).
- `components/ui`: generic, stateless building blocks with no business logic.
- `components/layout`: page scaffolding and navigation.
- `services/api.js`: a single Axios instance holding the in-memory access token and the 401 →
  refresh → retry interceptor. Every failure is normalised into `ApiRequestError` (`message`,
  `status`, `errors`). Feature services (`authApi.js`, `profileApi.js`, `postApi.js`, ...) wrap endpoints;
  pages never call Axios directly.
- `store/`: Zustand stores. `authStore` is the single source of auth state
  (`user`, `status`, `isAuthenticated`, `initialize`, `login`, `register`, `logout`, `fetchCurrentUser`);
  `themeStore` holds the theme; `feedStore` holds the feed (posts, pagination, filter, the open post,
  in-flight flags, and every post action with optimistic likes/saves); `toastStore` drives the
  `<Toaster />` mounted in `App.jsx` ("Posting..." → "Posted to CampusX!").
- `routes/ProtectedRoute.jsx` / `GuestRoute.jsx`: UX guards only (redirect to `/login` and back;
  the `roles` prop shows AccessDenied). The API enforces the real rules.
- `constants/app.js`: the one place the API base URL is read (`VITE_API_URL`).
- `pages/dev/`: development-only tools, never shipped in production builds: `/dev/ui` (design system
  gallery) and `/dev/status` (backend connection, database and Redis status from `/health`). The
  footer pill on public pages links to the status page in development.

### Auth flow in the browser

```
page load -> authStore.initialize()
              no "has session" hint in localStorage -> signed out (no request)
              otherwise POST /auth/refresh (cookie) -> access token kept in api.js memory, user in authStore
request   -> Authorization: Bearer <in-memory token>
401       -> one shared POST /auth/refresh -> retry once -> still failing? clear session -> /login
logout    -> POST /auth/logout -> server revokes session, clears cookie -> hint removed -> other tabs sign out
```

- Tokens never touch localStorage, sessionStorage, Zustand state or `document.cookie`. localStorage
  only holds the non-secret hint `campusx-has-session`, which avoids a pointless refresh call for
  visitors who never signed in.
- Forms (`hooks/useForm.js`) validate on the client for quick feedback and map the API's field
  `errors` onto inputs. The API validates everything again.
- Passwords live only in the form's local state while typing and are never stored anywhere else.

### Responsive shell

| Viewport | Navigation |
| --- | --- |
| Phone (< 768 px) | Sticky top bar (search button, bell, explore, theme, account) + bottom tab bar (5 destinations) |
| Tablet (768 px and up) | Icon rail on the left, with a search button |
| Laptop/desktop (1024 px and up) | Full sidebar with labels and a "Search CampusX" box |

`PageContainer` caps content width (`narrow` / `default` / `wide`) with responsive gutters
(`gutter-x`: 16, 24, then 32 px).

### Design system

Defined in `src/styles/index.css` with Tailwind v4 CSS-first config:

- **Brand scales:** `leaf` (nature green) and `sun` (warm accent for achievements and highlights).
- **Semantic tokens:** `canvas`, `surface`, `surface-muted`, `ink`, `ink-muted`, `ink-subtle`, `line`,
  `primary`, `primary-soft`, `accent-soft`, `danger` and so on. Each is defined once for light and once
  for dark, so components never need `dark:` variants for colour.
- **Shadows:** `shadow-soft`, `shadow-lift`, `shadow-glow` (green glow, stronger in dark mode).
- **Floating layers:** `bg-overlay` for menus, dialogs, toasts and sticky bars (equal to `surface` in the
  Campus themes, stronger frosted glass in Aurora Glass).
- **Type:** Plus Jakarta Sans (body), Bricolage Grotesque (display). Aurora Glass and the admin use Space
  Grotesk for display and JetBrains Mono for technical details (IDs, times, metrics); body text stays Plus
  Jakarta Sans. Fonts load from Google Fonts with system fallbacks.
- **Shape language:** rounded-3xl cards, rounded-xl buttons and inputs, squircle avatars.
- **Campus motifs:** dotted map texture (`campus-grid`), campus-map landing illustration, gate logo mark.

### Theming

Four app themes (`constants/appThemes.js`): **Campus Light**, **Campus Dark** (the default green look) and
**Aurora Glass Light**, **Aurora Glass Dark** (deep navy / pale lavender, violet, electric blue and mint, with
frosted glass). A theme is a *style* (`campus` · `aurora`) plus a *mode* (`light` · `dark` · `system`). The
five profile styles (`constants/profileThemes.js`) are separate and sit on top of whichever app theme is on.

- **State:** `store/themeStore.js` (Zustand, persisted to `localStorage` under `campusx-theme` as
  `{ theme, style, adminMode }`; older `{ theme }` saves still load, unknown values fall back to the
  defaults). It also holds Theme Studio's unsaved `preview` and the `scope` (`campus` or `admin`), which are
  not saved. Theme choices are device settings and survive sign-out, as before.
- **Classes:** `hooks/useThemeSync.js` (a layout effect, so nothing paints in the wrong theme) sets `dark`,
  `theme-aurora` and `admin-theme` on `<html>` and the `theme-color` meta. A chosen theme crossfades once
  through the View Transitions API (skipped under reduced motion or where unsupported). The inline script in
  `index.html` applies the saved student theme before first paint.
- **Tokens:** `styles/index.css` holds the Aurora palette as `--ag-*` per variant and maps it onto the
  semantic `--cx-*` and admin `--ax-*` tokens. `[data-theme-preview="<id>"]` declares a theme's tokens on any
  element, which is how Theme Studio previews render with the real values.
- **Glass hooks:** `glass-card` (sheen; `glass-reflect` adds a hover reflection), `glass-overlay` (backdrop
  blur for floating layers), `glass-primary` (gradient primary action), `glass-danger`, `glass-cover`. They
  only take effect under `theme-aurora`, so the Campus themes are unchanged. Resting cards and admin panels
  are never blurred (cheap to scroll); only floating layers are. Without `backdrop-filter`, or with
  `prefers-reduced-transparency`, the glass turns near-opaque. The ambient aurora is one fixed
  `body::before` layer, drifting slowly only for students on large screens without reduced motion.
- **Theme Studio** (`/theme-studio`, `pages/ThemeStudioPage.jsx`; linked from the sidebar and the phone
  account sheet): preview cards for the four themes, "Match my device", live preview across the app,
  Apply / Cancel / Reset. Leaving without applying restores the saved theme.
- **Admin control center:** always Aurora Glass, Dark by default. Staff switch its variant from the admin
  header or in Theme Studio (shown to admins and moderators only); it is saved as `adminMode` and never
  changes the student theme, and the student theme never reaches the admin.
