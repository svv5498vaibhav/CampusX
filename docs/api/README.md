# CampusX API

Base URL (development): `http://localhost:5000/api/v1`

All endpoints are versioned under `/api/v1`. A breaking change gets a new version prefix instead of
changing `v1` in place.

## Conventions

### Success

Every successful response has the same shape. `data` is always present (`{}` when there is nothing to
return). `meta` appears only on paginated lists.

```json
{
  "success": true,
  "message": "Human readable summary",
  "data": {}
}
```

### Errors

Every error response has the same shape. `errors` is always an array, empty unless there are
field-level problems.

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "email", "location": "body", "message": "Please enter a valid email." }]
}
```

| Status | When |
| --- | --- |
| 400 | Malformed request (invalid JSON, invalid id format, unsupported file type) |
| 401 | Not signed in, or the session expired / was revoked |
| 403 | Signed in but not allowed (role, account status, or someone else's resource) |
| 404 | Unknown route or resource |
| 409 | Duplicate value on a unique field (only the field name is returned, never the value) |
| 413 | Body or file too large |
| 422 | Input validation failed (`errors` lists each field) |
| 423 | Sign-in temporarily locked after repeated wrong passwords |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error (generic message; details only outside production, under `debug`) |
| 503 | A dependency is unavailable or not configured (database down, media uploads not configured) |

### Rate limits

`RATE_LIMIT_MAX` (default 1000) requests per 15 minutes per IP across `/api`. Auth routes have
stricter limits (see Authentication). Responses include the IETF draft-8 `RateLimit` and
`RateLimit-Policy` headers.

### Request limits and input hardening

- JSON and URL-encoded bodies are capped at 100 kB. File uploads use multipart endpoints with
  per-preset limits (see `docs/architecture/overview.md`).
- Keys starting with `$` or containing `.` are stripped from bodies and query strings.
- Repeated query parameters (`?sort=a&sort=b`) are collapsed to the last value (hpp).
- `400` "This request contains data CampusX can't accept." for `__proto__`, `constructor` or `prototype`
  keys, NUL bytes, JSON nested deeper than 8 levels, more than 500 keys or arrays longer than 500
  (bodies, query strings and multipart fields).
- Uploads: the file name's last extension must match an allowed type, disguised names (`photo.php.jpg`) and
  control characters are refused (`415`), the content is checked by its first bytes, PDFs with scripts,
  launch actions or attachments are refused (`415`), and a malformed multipart body is `400`.
- Every response defaults to `Cache-Control: no-store` (option lists allow `private, max-age=300`) and
  carries `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; HSTS in production.

## Endpoints

### `GET /health`

Liveness check plus non-sensitive service status. No authentication. Not cached (`Cache-Control: no-store`).

```bash
curl http://localhost:5000/api/v1/health
```

```json
{
  "success": true,
  "message": "CampusX API is running",
  "data": {
    "environment": "development",
    "database": "connected",
    "redis": "unavailable"
  }
}
```

| Field | Values |
| --- | --- |
| `environment` | `development`, `production`, ... |
| `database` | `connected`, `connecting`, `disconnected`, `disconnecting`, `not_configured` |
| `redis` | `connected`, `unavailable` (configured but unreachable), `not_configured` |

## Authentication

### How clients authenticate

- **Access token**: a short-lived JWT (`JWT_EXPIRES_IN`, default 15 min) returned in the JSON body
  of register, login and refresh. Send it as `Authorization: Bearer <token>`. Keep it in memory,
  not in localStorage.
- **Refresh token**: an opaque token in the HttpOnly cookie `cx_refresh`, scoped to
  `/api/v1/auth`. It rotates on every refresh and is stored only as a SHA-256 hash.
- When a request returns 401, call `POST /auth/refresh` once and retry. If refresh also fails,
  the session is over and the user must log in again.
- Browser clients must send requests with credentials (`withCredentials: true`). Register, login,
  refresh and logout reject requests whose `Origin` header is not in `CLIENT_URL` (CSRF guard).
- All auth responses are sent with `Cache-Control: no-store`.

### Rate limits and lockout

| Limit | Value |
| --- | --- |
| `POST /auth/login` | 20 **failed** attempts per 15 min per IP (successful logins don't count) |
| `POST /auth/register` | 15 per hour per IP |
| `PUT /auth/password`, `DELETE /auth/account` | 5 attempts each per 15 min per signed-in student (every attempt counts, right or wrong) |
| Per account | `MAX_LOGIN_ATTEMPTS` (5) wrong passwords lock sign-in for `LOGIN_LOCK_MINUTES` (15), then the counter resets |
| Per unknown email | Exactly the same lock and answers, so a `423` never reveals whether an account exists |

Security events (admin audit log, Security category): `ACCOUNT_LOCKED` when a lock starts, `SUSPICIOUS_LOGIN`
for a successful sign-in right after 3+ wrong passwords or within 24 h of a lock (never refused),
`REFRESH_TOKEN_REUSE` when a replayed refresh cookie signs a device out, and `ACCOUNT_DELETED` when a student
deletes their account (counts only).

### `POST /auth/register`

Creates a **student** account and signs it in. Any `role`, `status` or verification fields in
the body are ignored.

| Field | Rules |
| --- | --- |
| `firstName`, `lastName` | Required, trimmed, at most 50 characters, letters plus spaces, hyphens, apostrophes and periods |
| `email` | Required, valid, at most 254 characters; trimmed and lowercased |
| `password` | 8–72 characters, at least one letter and one number, not a common password |
| `confirmPassword` | Must equal `password` |

`201 Created` (also sets the `cx_refresh` cookie):

```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": { "id": "…", "email": "riya@college.edu", "firstName": "Riya", "lastName": "Sharma", "role": "student", "status": "active", "...": "…" },
    "accessToken": "eyJ…"
  }
}
```

Errors: `422` field errors · `409` "An account with this email already exists." (field `email`) ·
`429` too many sign-ups.

### `POST /auth/login`

Body: `{ "email", "password" }`. `200` returns `{ user, accessToken }` and sets the cookie.

| Status | Message | When |
| --- | --- | --- |
| 401 | Invalid email or password. | Wrong password **or** unknown email (identical response and timing) |
| 423 | Too many failed sign-in attempts. Please try again in N minutes. | Account temporarily locked |
| 403 | Account-status message (suspended, blocked, deactivated, pending) | Only after the correct password |
| 429 | Too many sign-in attempts from this network… | IP limiter |

### `POST /auth/refresh`

Uses the `cx_refresh` cookie and needs no body. `200` returns `{ user, accessToken }` and a rotated
cookie. Two requests racing with the same cookie within 30 s both succeed. Replaying an old,
already-rotated cookie after that window is treated as theft and revokes the whole session.
`401` (cookie cleared) when the session is missing, expired or revoked; `403` if the account is
no longer active.

### `POST /auth/logout`

Revokes the session behind the cookie (and behind the bearer token, if sent) and clears the cookie.
Access tokens from that session stop working **immediately**, because every request checks that its
session is still active. Idempotent: always `200` "Logged out successfully". Other devices stay
signed in.

### `GET /auth/me`

Requires a bearer token. `200`:

```json
{ "success": true, "message": "Current user", "data": { "user": { "id": "…", "email": "…", "firstName": "…", "lastName": "…", "role": "student", "status": "active" } } }
```

`401` "Please log in to continue." (no token) or "Your session has expired. Please log in again."
(invalid, expired or revoked); `403` if the account is not active.

### `DELETE /auth/account`

Permanently deletes the **signed-in student's own account**. Requires a bearer token; the account is always
the one behind the token (there is no id in the path, and `userId`/`id`/`user` in the body are ignored).
Origin-checked like the cookie routes, because it clears the refresh cookie.

Body (nothing else is read):

| Field | Rules |
| --- | --- |
| `password` | The current password, checked against the stored bcrypt hash. Never stored or logged |
| `confirmation` | Exactly `DELETE` (surrounding spaces ignored; lower case is refused) |

`200` (everything is gone; the `cx_refresh` cookie is cleared, `Cache-Control: no-store`):

```json
{ "success": true, "message": "Your account has been permanently deleted.", "data": { "status": "deleted" } }
```

`202` `{ "data": { "status": "scheduled" } }` "Your account has been closed and is being deleted. This finishes
automatically.": only on a MongoDB server without transactions, when the removal was interrupted. The account
is already locked and signed out everywhere; the cleanup job finishes it. Clients treat it like `200`.

| Status | Message | When |
| --- | --- | --- |
| 401 | Please log in to continue. / Your session has expired… | No, invalid or revoked token |
| 403 | Requests from this origin are not allowed. | Foreign `Origin` |
| 403 | Moderator and admin accounts can't be deleted here. Ask a CampusX admin to remove your staff role first. | Staff accounts |
| 422 | Your password is incorrect. (field `password`) | Wrong password: a field error, **never 401**, so the app keeps the student signed in |
| 422 | Please enter your password. / Type DELETE to confirm. (field `password` / `confirmation`) | Validation |
| 409 | Your account changed while we were checking. Please try again. | The password changed, or another deletion started, after the check |
| 429 | Too many account deletion attempts… | 5 per 15 min per student |
| 500 | We couldn't delete your account right now, so nothing was removed. Please try again in a few minutes. | The transaction failed and was rolled back; the account is open again and the session still works |

**What happens** (`backend/services/accountDeletionService.js`):

1. The account is locked (`status: "deleting"`) only while it is active and the checked password is still its
   password. From then on every request, refresh, sign-in (`403` "This account is being deleted.") and socket
   handshake of the account is refused.
2. Its data is removed in one MongoDB transaction when the server supports them (replica sets, Atlas):
   all or nothing. Without transactions the same steps run one by one; each is safe to repeat.
3. The user document goes last; then all its live sockets are closed, other students' points and counts are
   reconciled, and an `ACCOUNT_DELETED` audit row is written (counts only, Security category).
4. Its Cloudinary files are removed once no record points at them, retried with a growing delay (5 min
   doubling, up to 6 h, 10 attempts) by the cleanup job, then logged for manual cleanup.

| Data | Policy |
| --- | --- |
| Account, sessions, profile photo and cover | Deleted (files removed from Cloudinary) |
| Campus posts | Deleted with their media **and the comments on them** (as when a student deletes a post) |
| Its comments, likes and saves elsewhere; places on other students' project teams | Removed; comment counts recalculated; the post authors' points for those likes/comments reversed |
| Projects, achievements (images, proof files) | Deleted (files removed) |
| Community memberships | Removed; member counts recalculated |
| Communities it owned alone | Handed to the longest-serving moderator (who is notified), or archived when there is none; never deleted. `createdBy` is cleared |
| Opportunity tracking, roadmap progress, points ledger, gamification record, notification settings, search history, recommendation data | Deleted |
| Notifications it received, and notifications it caused for others (they quote removed content) | Deleted |
| Reports it filed, reports/cases/audit rows about it or its content | Kept for safety (ids only) |
| Anonymous Zone posts, comments, likes and reports | **Untouched**: never linked to the student in public, and changing them at that moment would reveal which anonymous posts were theirs. Students can delete them first |
| Deletion record (`accountdeletions`) | Account id, dates, counts and Cloudinary ids still to remove; kept 30 days after completion |

The email address can be used again for a new account.

### The user object

`id, email, firstName, lastName, role, status, emailVerified, isVerified, onboardingCompleted,
onboardingCompletedAt, college, branch, semester, rollNumber, interests, skills, avatarUrl,
coverImageUrl, bio, profileTheme, lastLoginAt, createdAt`. `college`, `branch` and `interests` are option **ids** (see onboarding
options); `semester` is a number from 1 to 8. Fields not set yet are `null` (or `[]` for lists). It is
built from an allow-list. `passwordHash`, login counters, lock times, IP addresses and `avatarPublicId` are never
returned.

## Onboarding

All onboarding routes require a bearer token. The account being read or changed is always the
signed-in one: any `userId`, `role`, `email` or `onboardingCompleted` sent in a body is ignored.

### `GET /onboarding/status`

```json
{ "success": true, "message": "Onboarding status", "data": { "completed": false } }
```

### `GET /onboarding/options`

The authoritative option lists. The frontend keeps no copy of them. Sent with
`Cache-Control: private, max-age=300`.

```json
{
  "success": true,
  "data": {
    "colleges": [{ "id": "vnit-nagpur", "name": "Visvesvaraya National Institute of Technology (VNIT) Nagpur", "city": "Nagpur", "aliases": ["VNIT"] }],
    "branches": [{ "id": "cse", "name": "Computer Science Engineering" }],
    "semesters": [{ "value": 7, "label": "7th Semester" }],
    "interestGroups": [{ "id": "build", "name": "Build & code" }],
    "interests": [{ "id": "web-development", "name": "Web Development", "group": "build" }],
    "skillSuggestions": ["JavaScript", "React", "Node.js"],
    "rules": { "interests": { "min": 3, "max": 8 }, "skills": { "max": 15, "maxLength": 30 }, "rollNumber": { "maxLength": 30 } }
  }
}
```

(Lists shortened.) A college may later include `branchIds` to restrict its branches.

### `PUT /onboarding`

Saves the campus identity. The first successful save sets `onboardingCompleted: true` and
`onboardingCompletedAt`. Later saves update the details and keep the original completion time.

```json
{
  "college": "pbcoe-nagpur",
  "branch": "cse",
  "semester": 7,
  "rollNumber": "CS-21 045",
  "interests": ["web-development", "ai-ml", "hackathons"],
  "skills": ["React", "Node.js", "MongoDB"]
}
```

| Field | Rules | Stored as |
| --- | --- | --- |
| `college` | Required; a college `id` from the options | the id |
| `branch` | Required; a branch id offered by that college | the id |
| `semester` | Required; integer 1–8 (`"7"` accepted); rejects 0, 9, negatives, decimals, text | number |
| `rollNumber` | Required; 1–30 characters; letters, digits, spaces, `- / . _`; **unique per college** | trimmed, single-spaced, upper case |
| `interests` | Required list; 3–8 entries; known interest ids; no duplicates | lower-case ids |
| `skills` | Optional list; up to 15; each 1–30 characters (letters, digits, spaces, `+ # . & / - _`); no duplicates (case-insensitive) | trimmed; known skills use their official spelling ("react" → "React") |

`200` → `{ "data": { "user": { … } } }` with the updated user. Errors: `422` with field errors (e.g.
"Please choose at least 3 interests.", "Please select a college from the list."); `409` on
`rollNumber` when that roll number is already registered at the same college; `401`/`403` as for
any authenticated route.

## Profiles

Every profile route requires a bearer token: profiles are visible to signed-in CampusX members
only. **Changes always apply to the signed-in student.** No route takes a user id to edit, and
`PUT`/`POST`/`DELETE` on `/profile/:userId` (or its `/avatar`, `/cover`) return
`403 "You can only change your own profile."`. All responses are `Cache-Control: no-store`.

### The profile object

```json
{
  "id": "…", "firstName": "Riya", "lastName": "Sharma",
  "college": { "id": "pbcoe-nagpur", "name": "Priyadarshini Bhagwati College of Engineering" },
  "branch": { "id": "cse", "name": "Computer Science Engineering" },
  "semester": { "value": 7, "label": "7th Semester" },
  "interests": [{ "id": "web-development", "name": "Web Development" }],
  "skills": ["React", "Node.js"],
  "bio": "…",
  "avatarUrl": "https://res.cloudinary.com/…/c_fill,g_auto,h_400,w_400/f_auto,q_auto/…" ,
  "coverImageUrl": null,
  "theme": "campus-green",
  "memberSince": "2026-10-02T…",
  "isOwner": false
}
```

The **owner's view** (`GET /profile` and every change) adds `email`, `rollNumber`,
`campusIdentityLocked` (college and roll number locked once the account is verified) and
`completion: { percent, isComplete, items: [{ id, label, done }] }`. Other students never see those.
Cloudinary public ids, password data and security fields are never returned.

`GET /profile` and `GET /profile/:userId` also return `social: { followersCount, followingCount, relationship }`
(see [Follows and blocks](#follows-and-blocks)). `relationship` is `null` on your own profile; on someone
else's it is `{ isFollowing, followsYou, blockedByYou, canFollow, canMessage }`. A block by the other student is
never named: it only shows as `canFollow: false, canMessage: false`. The profile changes (`PUT`, photo, cover)
don't repeat `social`.

### `GET /profile` · `GET /profile/:userId` · `GET /profile/options`

- `/profile`: the signed-in student's own profile (from the session, never an id).
- `/profile/:userId`: another student's public profile. Malformed, unknown or inactive accounts all
  return `404 "We couldn't find that student."`.
- `/profile/options`: everything the editor needs: the onboarding options (colleges, branches,
  semesters, interests, skill suggestions, rules) plus `profileThemes` (`[{ id, name, description }]`),
  `profileRules.bio.maxLength` (500) and `media.avatar` / `media.cover` limits
  (`{ maxBytes, maxMegabytes, mimeTypes }`).

### `PUT /profile`

Partial update: send only what changes; each field present is validated.

| Field | Rules |
| --- | --- |
| `firstName`, `lastName` | Same rules as registration (required when sent) |
| `bio` | Text up to 500 characters; line endings normalised, runs of blank lines squeezed, trimmed |
| `skills` | Same rules as onboarding (up to 15, 30 characters each, no duplicates) |
| `interests` | Same rules as onboarding (3–8 known ids, no duplicates) |
| `profileTheme` | One of `campus-green`, `minimal-white`, `creative-student`, `dark-campus`, `achievement-focus` |
| `college` + `branch` | Changing college requires a branch at that college. **403 once the account is verified** |
| `branch`, `semester` | Editable any time (branch checked against the current college) |
| `rollNumber` | Same rules as onboarding, unique per college (409). **403 once verified** |

Anything else in the body (`userId`, `role`, `email`, `avatarUrl`, …) is ignored. An empty update
→ `422 "There is nothing to update."`.

### Profile photo and cover

| Endpoint | Field | Limit |
| --- | --- | --- |
| `POST /profile/avatar` | `photo` | 5 MB |
| `POST /profile/cover` | `cover` | 8 MB |
| `DELETE /profile/avatar`, `DELETE /profile/cover` | none | |

Uploads are `multipart/form-data` with exactly one JPG, PNG or WEBP. The type is checked by the file's
**contents** (magic bytes), not its name or declared type, and Cloudinary re-checks the format.
Each returns `{ profile }`. Deleting when there is no image just returns the profile.

| Status | Message |
| --- | --- |
| 400 | "Please choose an image to upload." / "Please upload a single image in the "photo" field." |
| 413 | "Please choose an image smaller than 5 MB." (8 MB for covers) |
| 415 | "Only JPG, PNG, and WEBP images are supported." |
| 409 | The image was changed in another tab at the same moment; try again |
| 429 | More than 30 uploads per hour by the same student |
| 502 | "Profile photo upload failed. Please try again." (Cloudinary error; details only in server logs) |
| 503 | "Profile photo uploads aren't available right now. Please try again later." (Cloudinary not configured) |

## Posts and the campus feed

Every route requires a bearer token. **The author is always the signed-in student**; an `author`
(or likes, counts, moderation status, audience) sent in a body is ignored. Post and comment ids that
are malformed or unknown return `404 "Post not found."` / `404 "Comment not found."`. Responses are
`Cache-Control: no-store`.

### Who sees a post

| `visibility` | Visible to |
| --- | --- |
| `campus` (default) | Students at the author's college |
| `branch` | Students in the author's branch at the author's college |
| `public` | Every signed-in CampusX student |

The author always sees their own posts. College and branch come from the author's profile when they
post (stored server-side as the post's audience), and from the viewer's profile in the database when
the feed is read, never from the request. A post the viewer can't see behaves as if it doesn't exist
(404) for reading, liking, commenting and reporting. Posts from suspended or closed accounts are
left out.

### The post object

```json
{
  "id": "…", "type": "project", "content": "Shipped our lost & found bot…",
  "media": [{ "id": "…", "type": "image", "url": "https://res.cloudinary.com/…/c_limit,w_1600/f_auto,q_auto/…", "width": 1600, "height": 900 }],
  "visibility": "campus",
  "author": {
    "id": "…", "firstName": "Riya", "lastName": "Sharma", "avatarUrl": null,
    "college": { "id": "pbcoe-nagpur", "name": "Priyadarshini Bhagwati College of Engineering" },
    "branch": { "id": "cse", "name": "Computer Science Engineering", "shortName": "CSE" },
    "semester": { "value": 7, "label": "7th Semester" }
  },
  "likeCount": 4, "commentCount": 2,
  "likedByCurrentUser": true, "savedByCurrentUser": false, "isOwner": false,
  "editedAt": null, "createdAt": "…", "updatedAt": "…"
}
```

Videos add `posterUrl` (a still frame). Lists of who liked or saved, Cloudinary public ids and
moderation details are never returned.

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/posts/options` | Post types (with composer prompts), visibility levels, feed filters, report reasons, rules and media limits |
| `GET` | `/posts?page=1&limit=10&filter=all` | Feed, newest first. `limit` 1-20, `filter`: `all`, `branch`, `achievement`, `project`, `idea`, `event`, `opportunity` |
| `POST` | `/posts` | Create (JSON, or multipart with files in `media`) → `201 { post }` |
| `GET` | `/posts/:postId` | One post → `{ post }` |
| `PUT` | `/posts/:postId` | Edit your own post → `{ post }` (sets `editedAt`) |
| `DELETE` | `/posts/:postId` | Delete your own post → `{ id }` |
| `POST` / `DELETE` | `/posts/:postId/like` | → `{ likeCount, likedByCurrentUser }` (one like per student) |
| `POST` / `DELETE` | `/posts/:postId/save` | → `{ savedByCurrentUser }` (one save per student) |
| `POST` | `/posts/:postId/report` | `{ reason, details? }` → `201` |
| `GET` | `/posts/:postId/comments?page=1&limit=10` | Newest first, `limit` 1-30 → `{ comments, pagination }` |
| `POST` | `/posts/:postId/comments` | `{ content }` → `201 { comment, commentCount }` |
| `PUT` | `/comments/:commentId` | Edit your own comment → `{ comment }` |
| `DELETE` | `/comments/:commentId` | Delete your own comment → `{ id, postId, commentCount }` |

Feed response: `{ success: true, data: { posts: [...], pagination: { page, limit, total, hasMore } } }`.

### Creating and editing

| Field | Rules |
| --- | --- |
| `content` | Up to 3000 characters; line endings normalised, blank-line runs squeezed, trimmed |
| `type` | `text` (default), `photo`, `video`, `campus-update`, `achievement`, `project`, `idea`, `event`, `opportunity`. `text`/`photo`/`video` follow the attached media automatically |
| `visibility` | `campus` (default), `branch`, `public` |
| `media` (files) | Up to 4 photos (JPG, PNG, WEBP; 5 MB each) **or** 1 video (MP4, WEBM; 50 MB). Checked by file contents, not name |
| `keepMedia` (edit only) | Ids of the post's current photos/video to keep (a JSON list in multipart). Omit to keep all |

A post needs text or media: otherwise `422 "Post content cannot be empty."`. Posting needs a finished
campus profile (403 otherwise). Files are uploaded to Cloudinary before the post is saved. If any
upload fails, the ones that succeeded are deleted again and nothing is saved.

### Ownership and errors

| Status | Message | When |
| --- | --- | --- |
| 403 | "You can only modify your own post." | `PUT`/`DELETE` on someone else's post. Checked before any file is read or uploaded; the post is unchanged |
| 403 | "You can only modify your own comment." | `PUT`/`DELETE` on someone else's comment (post authors included) |
| 404 | "Post not found." / "Comment not found." | Unknown, malformed, deleted or not visible to you |
| 409 | "This post was just changed somewhere else. ..." | Two edits at the same moment |
| 409 | "You've already reported this post. ..." | A report from you is still open |
| 400 | "You can't report your own post." | |
| 413 | "Media file is too large." | Photo over 5 MB or video over 50 MB |
| 415 | "Unsupported media type." | Anything other than JPG/PNG/WEBP/MP4/WEBM (by contents) |
| 422 | "Add up to 4 photos, or 1 video, to a post." | Too many files, or photos and a video together |
| 429 | | Over 30 posts/hour, 60 comments/15 min or 30 uploads/hour per student |
| 500 | "Unable to delete post. Please try again." | Database failure while deleting |
| 502 / 503 | "Media upload failed. Please try again." / "Media uploads aren't available right now. ..." | Cloudinary error / not configured |

Deleting a post deletes its Cloudinary files first, then the post and its comments. A file that
Cloudinary can't delete is logged for manual cleanup and never blocks the delete. Reports are kept
for the moderation team.

## Communities

Every route requires a bearer token. **College, branch and semester always come from the signed-in
student's profile in the database**; college/branch/semester (or createdBy, official, memberCount) in a
request are ignored.

| `visibility` | Who can find and join |
| --- | --- |
| `public` | Every CampusX student |
| `college` | Students at the community's college |
| `branch` | Students in its college + branch |
| `restricted` | A class: its college + branch + semester |

Types: `college` (visibility college), `branch` (branch or restricted), `interest`, `project`,
`student-created` (any visibility). A new community's scope is the creator's own college/branch/semester.
CampusX keeps **official** communities for every college, branch-at-a-college and interest; they are
created the first time a student who belongs to them opens communities.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/communities/options` | Types, visibility (and which types may use them), filters, sorts, roles, limits, media rules |
| `GET` | `/communities?search&filter&sort&page&limit` | Discovery. `filter`: all, mine, college, branch, interest, project. `sort`: popular, new. Search covers name, description, tags |
| `GET` | `/communities/me` | Your active communities with your role |
| `GET` | `/communities/recommended` | Rule-based suggestions (campus, branch, interests, popular on campus, matching tags), with a `reason` |
| `POST` | `/communities` | Create: name 3-80, description 10-500, type, visibility, 1-8 tags, ≤ 10 rules × 150 → `201`, you are the owner |
| `GET` | `/communities/:id` | Details + rules + your `permissions`. `403` when it isn't open to you |
| `PUT` | `/communities/:id` | Owners: name, description, tags, rules, `status` (active / archived). Type and visibility are fixed |
| `DELETE` | `/communities/:id` | Owners: archive (posts and members stay; joining and posting stop) |
| `POST` | `/communities/:id/join` | `403` outside the scope or when removed, `409` already a member / archived |
| `DELETE` | `/communities/:id/leave` | The last owner must hand over first (`409`) |
| `GET` | `/communities/:id/members?page&limit` | Owners first; public profile fields only |
| `PATCH` | `/communities/:id/members/:userId/role` | Owners: `member` / `moderator` / `owner`. Owners can't change another owner; no self-promotion |
| `DELETE` | `/communities/:id/members/:userId` | Owners remove members and moderators; moderators remove members. Removed students can't rejoin |
| `GET` | `/communities/:id/posts?page&limit` | The community's posts (members only) |
| `POST`/`DELETE` | `/communities/:id/icon` · `/cover` | Owners. Field `icon` (2 MB) / `cover` (5 MB), JPG/PNG/WEBP |

Community posts use `POST /posts` with `community: <id>` (active members of an active community
only). They are visible to members only and never appear in the campus feed. Community owners and
moderators may delete other students' posts in their community; everywhere else only the author can.

## Projects

Every route requires a bearer token. The owner is always the signed-in student. Visibility: `public` and
`campus` (any signed-in CampusX student today), `college` (the owner's college), `private` (owner only).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/projects/options` | Categories, statuses, visibility, team roles, tech suggestions, filters, limits |
| `GET` | `/projects?search&category&status&sort&page&limit` | Discovery. Search covers title, descriptions and tech stack. `sort`: new, popular |
| `GET` | `/projects/me` | `{ projects, teamProjects, invitations }` |
| `GET` | `/projects/user/:userId` | A student's projects (owned + accepted team), visibility applied |
| `GET` | `/projects/team-candidates?search=` | Students to add as teammates (name search, public fields) |
| `POST` | `/projects` | title 3-120, shortDescription 10-250, description 20-5000, category, ≤ 15 tech, http(s) links, status, visibility, featured, teamMembers `[{ user, role }]` |
| `GET` | `/projects/:id` | Detail; counts a view (once per student every 6 h, never the owner) |
| `PUT` / `DELETE` | `/projects/:id` | Owner only (`403 "You can only modify your own project."`). `""` removes a link; `thumbnailImageId` picks the cover |
| `POST` | `/projects/:id/images` | Owner only. Field `images`, up to 8 per project, JPG/PNG/WEBP, 5 MB. All or none are kept |
| `DELETE` | `/projects/:id/images/:imageId` | Owner only |
| `POST` / `DELETE` | `/projects/:id/like` | → `{ likeCount, likedByCurrentUser }`, one like per student |
| `POST` | `/projects/:id/team/accept` | The invited student joins the team |
| `DELETE` | `/projects/:id/team/me` | Leave the team / decline the invitation |

Teammates are student references, never typed names. The owner adds them; they are `invited` (seen by
the owner and themselves only) until they accept.

## Achievements

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/achievements/options` | Types, visibility, filters, limits, proof file rules |
| `GET` | `/achievements?type&verified&search&page&limit` | `verified=true` returns `verificationStatus = verified` only |
| `GET` | `/achievements/me` · `/achievements/user/:userId` | Yours (all) · a student's (visibility applied) |
| `POST` | `/achievements` | title 3-150, type, organization/eventName ≤ 150, past date, rank ≤ 100, ≤ 10 skills, description ≤ 3000, certificateUrl, visibility |
| `GET` / `PUT` / `DELETE` | `/achievements/:id` | Edit/delete: owner only (`403 "You can only modify your own achievement."`) |
| `POST` | `/achievements/:id/proof` | Owner only. Field `proof`: JPG/PNG/WEBP or PDF (checked by contents), 10 MB, up to 5. Status becomes `pending` |
| `DELETE` | `/achievements/:id/proof/:proofId` | Owner only |
| `PATCH` | `/achievements/:id/verification` | **Moderators/admins only**: `{ status: verified | rejected, note? }` on a pending achievement (not their own) |

`verificationStatus` is never taken from a request: it starts `unverified`, proof makes it `pending`,
and only a moderator review makes it `verified` or `rejected`. Changing a claim (title, type,
organization, event, date, result, description, certificate link) or the proof of a reviewed achievement
sends it back to `pending` (or `unverified` without proof); changing only visibility or skills doesn't.

Text fields in projects and achievements refuse HTML/script tags (`422 "Please don't include HTML or code tags."`).

## Opportunities

Every route requires a bearer token. Students discover, save, track and report opportunities; only
**moderators and admins** create, edit, publish, close, archive or delete them (`403` for students, checked
before the body or any file is read). `createdBy` is always the signed-in moderator/admin.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/opportunities/options` | Types, type chips, modes, statuses, visibility, tracking statuses, deadline filters, sorts, report reasons, colleges/branches/semesters, limits, image rules |
| `GET` | `/opportunities?search&type&mode&location&skills&deadline&college&branch&semester&eligible&sort&page&limit` | Discovery (published + closed). Search covers title, descriptions, organizer, skills, tags. `skills` comma-separated (any). `deadline`: any, open, 7d, 30d. `college`/`branch`/`semester` = "open to" (rule includes it, or no rule). `eligible=true` uses the caller's own profile. `sort`: deadline (default: open first, nearest deadline first, closed last), latest, popular. 12 per page, max 30 |
| `GET` | `/opportunities/recommended` | Up to 6 rule-based matches with `matchReasons` (no scores) |
| `GET` | `/opportunities/my?status&page&limit` | The caller's tracked opportunities with `counts` per status; no-longer-listed ones come back with `available: false` |
| `GET` | `/opportunities/:id` | Detail; counts a view once per user every 6 h (never the creator). Students: 404 for drafts, archived and other colleges' college-only ones |
| `POST` | `/opportunities/:id/track` | `{ status?: saved | interested | applied, notes? }` → 201, or 200 "Already in My Opportunities." (one record per student, unique index) |
| `PATCH` | `/opportunities/:id/status` | `{ status?, notes? }` for the caller's own record (created if needed). Shortlisted/selected/rejected/withdrawn only after applied |
| `DELETE` | `/opportunities/:id/track` | Remove from the caller's list (unsave) |
| `POST` | `/opportunities/:id/report` | `{ reason: expired | wrong-info | broken-link | spam | misleading | other, details? }`; one open report per student (`409` again) |
| `GET` | `/opportunities/manage?status&search&page&limit` | **Staff.** Every status, with `counts`, `openReports` (active reports, plus any still pending from before Phase 13) and `trackedBy` |
| `POST` | `/opportunities` | **Staff.** title 3-150, shortDescription 10-300, description 20-5000, type, organizer, mode, location (required unless online), http(s) `applicationUrl`/`registrationUrl`, dates, eligibility text, `eligibleColleges`/`eligibleBranches`/`eligibleSemesters`, ≤ 15 skills, ≤ 10 tags, prize, fee, visibility, featured, status draft/published |
| `PUT` | `/opportunities/:id` | **Staff.** Any field, including `status` (published, closed, archived, draft). `""` removes a link, `null` a date. Publishing with a passed deadline → 422 |
| `DELETE` | `/opportunities/:id` | **Staff.** Deletes images, the opportunity and students' tracking (reports are kept) |
| `POST` / `DELETE` | `/opportunities/:id/image` · `/opportunities/:id/logo` | **Staff.** Fields `image` (5 MB) / `logo` (2 MB), JPG/PNG/WEBP checked by contents |

**Eligibility** (`viewerEligibility: { eligible, restricted, unmet, reasons }`) is always worked out from
the signed-in user's stored college, branch and semester; college/branch/semester values in a query or
body never change it. **Status**: `displayStatus` is `open`, `closing-soon` (deadline within 3 days),
`closed` (closed by staff or deadline passed, calculated on read; the database isn't rewritten) and, for
staff, `draft`/`archived`. `acceptingApplications` is false once closed; closed opportunities can't be
newly saved or tracked (`409 "Applications for this opportunity have closed."`), but students can still
record outcomes on ones they already track. Tracking statuses are the student's own, private records:
CampusX never knows whether someone applied on an external site.

## Anonymous Zone

Every route requires a bearer token (401 otherwise). The author is always the signed-in student and is
stored internally only: **no response ever contains the author's id, name, email, photo, roll number,
college or branch**. Posts and comments come back as `{ anonymous: true, isOwner, ... }` and the UI
shows "Anonymous Student".

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/anonymous/options` | Categories, filter chips, visibility, sorts, report reasons, limits, rate limits, image rules, author label |
| `GET` | `/anonymous/posts?search&category&sort&community&page&limit` | Posts the caller may read. Search covers title and content. `sort`: recent, discussed. `community` must be one of the caller's communities (403 otherwise). 10 per page, max 20 |
| `POST` | `/anonymous/posts` | JSON or multipart (`images`: up to 4 JPG/PNG/WEBP, 5 MB each, checked by contents, metadata removed). category, title 3-150, content 10-5000, visibility `college` (default) / `campus` / `community` + `community` (members only). Markup and personal information (phone numbers, emails, passwords/OTPs, card/ID numbers, home addresses) → 422 |
| `GET` | `/anonymous/posts/:id` | Readable posts, plus the caller's own (not deleted). 404 otherwise |
| `PUT` | `/anonymous/posts/:id` | Owner only: title, content, category (sets `editedAt`). Visibility, moderation, author and counts can't change |
| `DELETE` | `/anonymous/posts/:id` | Owner only. Soft delete (`status: deleted`): gone for everyone, kept for safety reviews |
| `POST` / `DELETE` | `/anonymous/posts/:id/like` | → `{ likeCount, likedByCurrentUser }`; who liked is never returned |
| `GET` / `POST` | `/anonymous/posts/:id/comments` | Oldest first; comment 1-1000, same text checks |
| `PUT` / `DELETE` | `/anonymous/comments/:id` | Owner only; delete is a soft delete |
| `POST` | `/anonymous/posts/:id/report` · `/anonymous/comments/:id/report` | reason: harassment, abusive-language, spam, threat, personal-info, misleading, hate, other. Once per student (409 "Already reported. Our team will take a look."); not your own (400) |
| `GET` | `/anonymous/me` | The caller's own posts (not deleted), with `status` and `moderationStatus` |

Ownership: another student editing or deleting gets `403 "You can only modify your own anonymous post."`
(404 if they can't even read the post). Visibility: `campus` = every signed-in student, `college` =
students at the author's college (stored by the server), `community` = active members. Reports from 3
different students set `moderationStatus: flagged` (still visible). Rate limits per student: 5 posts /
10 min, 20 comments / 10 min, 10 reports / hour (429), counted on Redis when connected, memory otherwise.

## Campus Rankings and gamification

Every route requires a bearer token and is **read-only**: there is no endpoint that adds points, changes a
level, grants a badge or sets a rank (any such request gets 404). Points change only through server-side
campus events. Scopes always come from the signed-in student's own profile; college, branch, semester or
user ids in a query are ignored.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/rankings/overall` · `/college` · `/branch` · `/semester` `?period&page&limit` | `period`: all (default), month, week. 20 per page, max 50. → `{ scope, period, leaderboard, pagination, currentUser: { rank, points } }`. Branch = your branch at your college; semester = your semester in that branch at that college |
| `GET` | `/rankings/weekly` · `/rankings/monthly` | Campus-wide leaderboard for the current week / month |
| `GET` | `/rankings/me` | `{ totalPoints, level, ranks: { overall, college, branch, semester }, weekly, monthly, badgeCount }` |
| `GET` | `/gamification/me` | Total and lifetime points, level (`level, name, currentLevelPoints, pointsToNextLevel, progressPercentage`), weekly/monthly points, streak, earned badges |
| `GET` | `/gamification/transactions?page&limit` | Your own points ledger, newest first: award, reversal and reinstatement rows |
| `GET` | `/gamification/badges` | Every badge with earned state, date and progress |
| `GET` | `/gamification/rules` | The point rules, caps, quality rules, what isn't rewarded, levels, badges, tie-breakers and time zone |

Leaderboard entries carry public details only: `student` (id, name, photo, college, branch, semester),
`points`, `totalPoints`, `level`, `badgeCount`, `latestBadge`. Students with no points in the period aren't
listed; suspended or closed accounts are left out. **Order**: points ↓, verified achievements ↓, reached the
score first ↑, account id ↑ (never random). Weeks start Monday 00:00 and months on the 1st in
`GAMIFICATION_TIMEZONE` (default Asia/Kolkata). Pages are cached for up to 60 s (Redis, or memory) and
dropped whenever points change.

## Notifications

Every route requires a bearer token and only ever touches **the signed-in student's own notifications**.
There is no endpoint that creates a notification or picks its recipient (any such request gets 404):
notifications come from server-side campus events. Another student's notification id behaves exactly like
a missing one (404 "Notification not found.").

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/notifications?page&limit&filter` | Newest first. `filter`: all (default), unread. 20 per page, max 50. → `{ notifications, pagination, unreadCount }` |
| `GET` | `/notifications/unread-count` | `{ unreadCount }` |
| `PATCH` | `/notifications/:id/read` | → `{ notification, unreadCount }`. Repeating it is harmless |
| `PATCH` | `/notifications/read-all` | → `{ updated, unreadCount }` |
| `DELETE` | `/notifications/:id` | → `{ id, unreadCount }` |
| `DELETE` | `/notifications/read` | Clears every read notification → `{ deleted, unreadCount }` |
| `GET` | `/notifications/preferences` | `{ preferences: { likes, comments, followers, projects, achievements, communities, opportunities, rankings, system }, categories }`. All on by default |
| `PUT` | `/notifications/preferences` | Only the categories to change, as booleans: `{ "likes": false }`. `system` can't be turned off (422) |

A notification: `{ id, type, category, title, message, actor, entity: { type, id, available }, metadata,
count, isRead, readAt, eventAt, createdAt }`. `actor` is a short public summary (`id, firstName, lastName,
avatarUrl`) or `null` for CampusX messages and **everything from the Anonymous Zone**; a suspended actor
shows as "A CampusX student". `entity.available: false` means the content was deleted or removed ("This
content is no longer available"). `count` > 1 marks a grouped notification ("Aarav left 3 comments on your
post"). Types: `POST_LIKED`, `POST_COMMENTED`, `STUDENT_FOLLOWED` ("Aarav Mehta started following you.",
`entity: { type: "student", id: <follower> }`, category `followers`), `PROJECT_LIKED`, `PROJECT_TEAM_INVITE`,
`ACHIEVEMENT_VERIFIED`, `ACHIEVEMENT_REJECTED`, `COMMUNITY_JOINED`, `COMMUNITY_ANNOUNCEMENT`,
`COMMUNITY_ACTIVITY`, `OPPORTUNITY_UPDATED`, `OPPORTUNITY_STATUS_CHANGED`, `OPPORTUNITY_DEADLINE`,
`ANONYMOUS_POST_LIKED`, `ANONYMOUS_POST_COMMENTED`, `BADGE_EARNED`, `LEVEL_UP`, `RANK_CHANGED`,
`SYSTEM_NOTIFICATION` (see `backend/data/notificationOptions.js`).

Rate limits per student: 300 read/delete changes and 30 preference changes per 15 minutes (429).

### Real-time delivery (Socket.IO)

Connect to the API origin (e.g. `http://localhost:5000`) with the access token in the handshake:
`io(url, { auth: { token } })`. The server verifies it like a REST request (valid token, active account,
live session) and refuses otherwise with a `connect_error` whose message is `unauthorized`,
`rate-limited` (more than 60 handshakes a minute from one IP), `too-many-connections` (10 per student)
or `unavailable`. A connection ends when its access token expires or its session logs out; the client
refreshes the token and reconnects. Events (server → client only):

| Event | Payload |
| --- | --- |
| `notification:new` | `{ notification, unreadCount }`: new, or a grouped one that was updated (same id) |
| `notification:read` | `{ ids, readAt }` or `{ all: true, readAt }` |
| `notification:deleted` | `{ ids }` or `{ allRead: true }` (also when a like is taken back before it was read) |
| `notification:count` | `{ unreadCount }` |
| `relationship:updated` | To the student who followed, unfollowed, blocked or unblocked (all their tabs): the same body the REST call answered with |
| `follow:counts` | `{ followersCount, followingCount, at }`: your own counts changed because someone followed or unfollowed you (no ids: never who) |
| `message:new` | `{ conversation, message }` to both participants, each from their own side (the sender's other tabs too) |
| `conversation:read` | `{ conversationId, userId, lastReadId, lastReadAt }` to both participants ("Seen", other tabs) |
| `message:unread-count` | `{ unreadCount }`: conversations with unread messages |

Sockets only deliver what was already saved; the REST API above stays the source of truth.

## Search & Discovery

Every route requires a bearer token. Results are filtered on the server by the same visibility rules as
the rest of CampusX, worked out from the signed-in student's own profile and memberships: campus/branch/
community posts, college/branch/class communities, private and college-only projects and achievements,
published/closed opportunities only (never drafts or archived ones, for anyone). Filters only narrow what
the student may already see. Results are allow-listed views, never raw documents; people appear as the
public summary (`id, firstName, lastName, avatarUrl, college, branch, semester`), never with an email or
roll number.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/search?q` | Everything at once: `{ query, counts: { students, posts, ... }, students, posts, projects, communities, opportunities, achievements }`, at most 5 of each |
| `GET` | `/search/students?q&page&limit&sort&college&branch&semester&skills&interests` | Names, college, branch, semester, skills, interests. Every word must match. `sort`: relevance, name |
| `GET` | `/search/posts?q&page&limit&sort&type` | Campus posts (content, type, author name) and readable Anonymous Zone posts (title and content only; skipped when `type` is set). `sort`: relevance, newest, popular |
| `GET` | `/search/projects?q&page&limit&sort&category&tech` | Title, descriptions, category, tech stack. `sort`: relevance, newest, popular |
| `GET` | `/search/communities?q&page&limit&sort&type&college&branch` | Name, description, tags, type, college, branch. `sort`: relevance, popular, newest |
| `GET` | `/search/opportunities?q&page&limit&sort&type&mode&skills&deadline&college&branch&semester` | Title, descriptions, organizer, skills, tags, type. `college/branch/semester` mean "open to". `sort`: relevance, deadline, newest, featured |
| `GET` | `/search/achievements?q&page&limit&sort&type&verified` | Title, description, organization, event, skills, type. `sort`: relevance, newest |
| `GET` | `/search/suggestions?q` | `{ query, suggestions }`, at most 8: `{ kind: 'search', label, query, type }` or `{ kind: 'student' \| 'project' \| 'community' \| 'opportunity', id, label, subtitle }` |
| `GET` | `/search/history` | The student's own recent searches, newest first: `{ history: [{ id, query, searchedAt }] }` |
| `DELETE` | `/search/history/:id` | One of their own entries (anyone else's: 404) |
| `DELETE` | `/search/history` | Clears all → `{ deleted }` |
| `GET` | `/search/options` | Tabs, sorts per category, rules and filter choices |

A category answers `{ query, type, sort, results, pagination: { page, limit, total, hasMore } }`.
`q`: 2–100 characters after trimming, with a letter or digit (422 otherwise); only the first 6 words are
used. `page`: 1–50 (422 beyond). `limit`: default 20, larger values are lowered to 30. Comma-separated
`skills`/`tech`: up to 5. College, branch, interest and type values must come from CampusX's lists (422).
Anonymous post results have `anonymous: true` and no author field of any kind. Page-1 searches are saved
to the student's history (not ones that look like an email or phone number; the newest 20 are kept).
A search stopped at the database time limit answers 503. Rate limits per student: 60 searches and 120
suggestion lookups per minute, 120 history requests per 15 minutes (429).

## Reports and moderation (Trust & Safety)

### Reports (any signed-in student)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/reports/options` | `{ reasons, targets: { post: { label, reasons }, ... }, rules }` |
| `POST` | `/reports` | `{ targetType, targetId, reason, description? }` → 201 `{ report }` "Thanks. Your report has been submitted." |
| `GET` | `/reports/me?page&limit` | The student's own reports, newest first |
| `DELETE` | `/reports/:id` | Withdraw an own report while it is still `pending` |

`targetType`: `post`, `comment`, `project`, `community`, `opportunity`, `achievement`, `user`, `anonymousPost`,
`anonymousComment`. `reason`: `spam`, `harassment`, `hate_or_abuse`, `threat`, `inappropriate_content`,
`misleading`, `impersonation`, `malicious_link`, `privacy_violation`, `other`; opportunities also `expired`,
`broken_link`, `wrong_info` (each target type accepts its own subset: 422 otherwise). A report view is `{ id,
targetType, targetId, reason, reasonLabel, description, status, createdAt, updatedAt, resolvedAt }`: never the
priority, the case or anything about other reporters. Errors: 404 for anything the student can't see, 400 for
their own content or themselves, 409 for a second active report on the same thing, 429 after 10 reports in an
hour (or too many in a day). The reporter, status and priority are never read from the body. The older
`POST /posts/:id/report`, `/opportunities/:id/report`, `/anonymous/posts/:id/report` and
`/anonymous/comments/:id/report` still accept their own reasons and store reports the same way.

### Moderation (CampusX moderators and admins only: students 403)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/moderation/cases?status&page&limit` | `status`: open (default), reviewing, resolved, dismissed, all. Most urgent first |
| `GET` | `/moderation/cases/:id` | One case |
| `PATCH` | `/moderation/cases/:id` | `{ decision, note? }`: approve · flag · restrict · remove · warn · dismiss · escalate |

A case: `{ id, targetType, targetId, sources, reportCount, automatedScore, riskLevel, flags, reasons,
priority, status, action, assignedTo, notes, createdAt, updatedAt, resolvedAt }`. Reporters and the content's
owner (anonymous authors included) are never sent. Deciding closes the reports on that target and tells each
reporter the outcome; restricting or removing counts as a violation for the owner; flagging and escalating
keep the case open (reviewing). Two decisions on the same case at the same moment: the second gets 409. The
admin control center (`/admin`, below) is built on the same cases.

### Effects on other endpoints

- New content (posts, comments, anonymous posts/comments, projects, achievements, communities) is saved with
  a moderation status. Owners get `moderation: { status: 'pending' | 'restricted' }` on their own held items
  (anonymous posts keep their `moderationStatus` field); nobody else ever sees a status or a score.
- Students under a temporary restriction get 403 "You can't post new content until …" when creating or
  editing content; reading, liking and reporting still work.
- Removed items answer 404 everywhere; search returns approved content only.
- Rate limits per student: 150 likes per 10 min, 40 community joins/leaves per 10 min, 10 reports an hour,
  300 moderation requests per 15 min (429).

## Recommendations

Signed-in students only. Everything is worked out from the student's own account and activity: no endpoint
accepts a user id, college, branch, semester or eligibility (a `userId` parameter is ignored). Items are the
same allow-listed views search uses, plus `recommendationType` and `reasons` (one or two plain sentences).
Scores, weights and the reasons' sources are never sent.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/recommendations` | Home: `{ recommendations (For you, mixed), sections: { opportunities, projects, communities }, trending, generatedAt, personalization }` |
| `GET` | `/recommendations/discover` | Discover: For you, `sections` for all six kinds, `trending` |
| `GET` | `/recommendations/{posts,projects,communities,opportunities,students,achievements}?page&limit` | One kind: `{ type, recommendations, pagination, generatedAt, personalization }` (limit ≤ 20; up to 30 ranked items) |
| `POST` | `/recommendations/:type/:id/dismiss` | `{ action?: 'not_interested' (default) \| 'dismiss' }` → "Got it. You'll see less like this." / "Hidden from your recommendations." |
| `POST` | `/recommendations/interactions` | `{ action: 'impression' \| 'click', items: [{ type, id }] }` (1–30 items) → `{ recorded }` |

`personalization`: `{ basedOn: ['interests', 'skills', 'campus', 'communities', 'activity'], isNew, message? }`
(`message`: "You're new to CampusX. Here are some things to explore." or "Nothing new to recommend right now.").
`trending`: `{ posts, discussions, projects }`; discussions are Anonymous Zone posts in their anonymous shape.
Never recommended: the student's own content, private or out-of-scope content, flagged/held/removed content,
draft/archived/closed/expired opportunities or ones the student isn't eligible for or already tracks,
communities they're in, and anything they dismissed or reported. Errors: 401 signed out, 404 unknown type or
an item the student can't see ("Recommendation not found."), 422 bad page/action/items, 429 above 60 reads a
minute, 60 dismissals per 10 minutes or 30 interaction calls a minute (per student).

## Semester Roadmap

Every route requires a bearer token and works on the **signed-in student's own roadmap** only: no route takes
a user id, and ids in a body are ignored. Students need a finished onboarding (branch and semester), otherwise
409. Templates come from `backend/data/roadmapOptions.js` (suggested by CampusX, not an official syllabus);
there is no route that creates, edits or publishes them. Changes are limited to 150 per 10 minutes per student
(429 after that); reads use the general limit. Responses are `Cache-Control: no-store`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/roadmap/me` | The whole roadmap (below) |
| `GET` | `/roadmap/progress` | Short summary for the profile: `{ careerGoal, currentSemester, totalSemesters, overall, semesters[8]: { semester, state, isCurrent, progress }, nextMilestone, lastActivityAt }` |
| `GET` | `/roadmap/semester/:semester` | One semester (1–8, else 422): `{ careerGoal, student, semester }` |
| `GET` | `/roadmap/templates` | Every career goal for the student's branch track, with required/optional milestone counts and counts per semester; categories and difficulties |
| `PUT` | `/roadmap/preferences` | `{ careerGoal?, selectedSemester? }` (at least one; unknown goal or semester outside 1–8 → 422) → `{ roadmap, goalChange: { from, to, carriedOver, saved } \| null }` |
| `PATCH` | `/roadmap/milestones/:milestoneId/complete` | Marks a milestone of the current roadmap complete → `{ milestone, changed, semesterCompleted, roadmap }` |
| `PATCH` | `/roadmap/milestones/:milestoneId/progress` | `{ status: "not-started" \| "in-progress" \| "completed" }`, same response. `not-started` is the undo |

**The roadmap object**: `student` (college, branch, track, `currentSemester` from the profile, `totalSemesters`:
8), `careerGoal` (`id, title, journey, tagline, icon, source: "suggested" | "chosen"`), `goals` (all seven, one
marked `suggested`), `selectedSemester` (last semester viewed, or null), `semesters[8]` (`semester, title,
summary, state, isCurrent, progress: { completed, required, inProgress, optionalCompleted, optional, percentage },
completedAt, effortHoursRemaining, milestones`), `overall` (`completed, required, remaining, percentage,
inProgress, optionalCompleted, semestersCompleted`), `nextMilestone` (`id, semester, title, category,
effortHours, status, reason: continue | current | catch-up | get-ahead`, or null when all required milestones
are done), `skills` (`name, completed, total, onProfile`), `savedElsewhere` (completed milestones kept from
another goal), `lastActivityAt`, `template` (`version, note`).

**A milestone**: `id, semester, title, summary, category (learn | practice | build | career), difficulty,
effortHours, required, objectives, skills, resources, project, prerequisites: [{ id, title, completed }], status,
startedAt, completedAt`. Resources are `{ title, source, url, kind }` with checked `https` links, or
`{ title, path, kind: "campusx" }` for a CampusX page; a milestone without a checked link has `resources: []`.

**Rules**: the suggested goal is the first of the student's interests a goal lists, then their branch, then
Full Stack; it is saved with the first change and replaced only when the student picks a goal. Optional
milestones never count towards progress. A semester is `completed` when every required milestone in it is
complete; otherwise the current semester is `in-progress`, earlier ones are `needs-attention` and later ones
`upcoming` (or `in-progress` once started). Percentages are rounded down. Changing goal or branch never deletes
milestone records: milestones outside the current roadmap are kept and count again if they come back. Status
changes are conditional updates, so repeats and simultaneous requests change a milestone once (`changed:
false` for the rest) and `semesterCompleted` is true only for the one change that completed the semester.
Unknown milestone → 404 `Milestone not found.`; a milestone of another goal → 404 `This milestone is not part
of your current roadmap.`; a malformed id → 422.

**Points**: a completed semester earns `ROADMAP_SEMESTER_COMPLETED` (10 XP) once per semester number through the
Phase 10 ledger (key `user:action:roadmap-semester:<n>`). Undoing a milestone or switching to a goal for which
the semester is incomplete reverses it; completing it again reinstates the same award (never a second one).
The first award also earns the **Pathfinder** badge. Single milestones earn nothing.

## Follows and blocks

Every route requires a bearer token. **The student acting is always the signed-in one**: the URL only names the
other student, so no request can change a relationship between two other students. Malformed ids → 422;
unknown or inactive students (suspended, blocked, closed) → 404 `We couldn't find that student.`, like profiles.
Responses are `Cache-Control: no-store`. Rules live in `backend/data/socialOptions.js`.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/users/:userId/follow` | 201 when the follow was created, 200 when it already existed (`changed: false`). Yourself → 422; a block either way → 403 |
| `DELETE` | `/users/:userId/follow` | 200; `changed: false` when you weren't following. No notification is sent |
| `GET` | `/users/:userId/followers?limit&cursor&search` | Newest first, 20 per page (max 50). → `{ students, total, pagination: { limit, hasMore, nextCursor } }` |
| `GET` | `/users/:userId/following?limit&cursor&search` | Same shape |
| `GET` | `/users/:userId/relationship` | `{ userId, relationship, counts, viewerCounts, at }` |
| `GET` | `/users/follow-status?ids=a,b,c` | Up to 50 ids → `{ statuses: { [id]: { isFollowing, canFollow } } }` (inactive or unknown ids left out). Used by student cards |
| `POST` | `/users/:userId/block` | Blocks for follows and messages, and ends follows in both directions. Repeating it is harmless |
| `DELETE` | `/users/:userId/block` | Unblocks (follows are not restored) |

Follow, unfollow, block and unblock answer `{ userId, relationship, counts, viewerCounts, at, changed }`:
`counts` are the other student's `{ followersCount, followingCount }`, `viewerCounts` your own, `at` the server
time they were read.

**List rows** are public student summaries (`id, firstName, lastName, avatarUrl, college, branch, semester`, never
an email or roll number) plus `isYou`, `isFollowing` and `canFollow` from your point of view and `since` (when
the relationship began). `cursor` is the previous page's `nextCursor`; `search` (up to 60 characters) matches the
start of first or last names, every word must match, and is literal text.

**Counts and duplicates**: a relationship is stored once (unique index on follower + following), so repeated or
simultaneous follow requests create one relationship, one notification and one count. Counts are read from the
relationships themselves and include only active accounts: a suspended, blocked or closed account drops out of
other students' counts and lists, and comes back if the account is restored (`followerActive` /
`followingActive`, kept in step when staff change an account's status).

**Notifications**: a new follow notifies the followed student once per follower (`STUDENT_FOLLOWED`, category
`followers`, which they can turn off). Unfollowing before it was read takes it back; unfollowing is never
announced. **Rate limits** per student: 120 follow/unfollow and 30 block/unblock requests per 15 minutes (429).
**Account deletion** removes the account's follows and blocks in both directions.

## Direct messages

One-to-one conversations between signed-in students. Every conversation is looked up among **the signed-in
student's own**: anyone else's conversation answers 404 `We couldn't find that conversation.` for reading,
sending and marking read alike. The sender of a message is always the signed-in student (ids in a body are
ignored). Responses are `Cache-Control: no-store`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/conversations?limit&cursor` | Your inbox: conversations with at least one message, latest first, 20 per page (max 50). → `{ conversations, unreadCount, pagination: { limit, hasMore, nextCursor } }` |
| `GET` | `/conversations/unread-count` | `{ unreadCount }`: conversations with unread messages |
| `POST` | `/conversations` | `{ userId }` → the conversation with that student: 201 `created: true` the first time, 200 afterwards. Yourself → 422; inactive/unknown → 404; a block either way → 403 |
| `GET` | `/conversations/:conversationId` | `{ conversation }` |
| `GET` | `/conversations/:conversationId/messages?limit&before` | 30 per page (max 50), oldest first within a page; `before` = the previous page's `nextCursor` (older messages) |
| `POST` | `/conversations/:conversationId/messages` | `{ text, clientId? }` → 201 `{ message, conversation, duplicate: false }`; a retry with the same `clientId` → 200 with the saved message (`duplicate: true`) |
| `POST` | `/conversations/:conversationId/read` | Marks it read up to the latest message → `{ conversationId, userId, lastReadId, lastReadAt, changed, unreadCount }` |

**A conversation**: `{ id, participant, lastMessage: { id, preview, at, isMine } | null, lastMessageAt,
unreadCount, lastReadId, otherLastReadId, canMessage, createdAt }`. `participant` is the other student's public
summary, or `{ id: null, firstName: "CampusX", lastName: "student", unavailable: true }` when their account isn't
active. `otherLastReadId` is how far they have read ("Seen"). **A message**: `{ id, conversationId, senderId,
isMine, text, createdAt, clientId? }` (`clientId` only to its sender).

**Rules**: two students share exactly one conversation (unique pair key), even when both open it at once; an
opened conversation stays out of both inboxes until its first message. Text is plain text, 1–2000 characters
after trimming (control characters removed); `clientId` is 8–64 of `A–Z a–z 0–9 _ -`. Sending needs the other
account to be active (else 403) and no block in either direction (403); the history stays readable. Students
under a Trust & Safety posting pause can't send (403), and messages with unsafe links (`javascript:` and similar,
links hiding their address) are refused (422). Messaging never follows anyone. Messages are saved first, then
delivered over Socket.IO (`message:new`, `conversation:read`, `message:unread-count`); direct messages don't
create notifications. **Rate limits** per student: 30 messages a minute, 40 conversation opens an hour, 600
read marks per 15 minutes (429). **Account deletion** removes the account's conversations with every message in
them.

## Admin control center

Mounted at `/admin`. Every route runs, in order: database check → `authenticate` (the same JWT + session
system as everything else) → staff role from the database (students: 403 "This area is for CampusX staff.") →
a per-staff rate limit (900 requests per 15 min) → the route's **permission** → request validation →
controller. Every response is `Cache-Control: no-store`. Refused requests (403) are written to the audit log as
`ACCESS_DENIED` (at most once per person and permission every 10 minutes).

**Permissions** (`backend/config/adminConfig.js`): `VIEW_DASHBOARD`, `VIEW_REPORTS`, `REVIEW_MODERATION`,
`MANAGE_CONTENT`, `MANAGE_OPPORTUNITIES`, `REVEAL_ANONYMOUS_AUTHOR`, `MANAGE_USERS`, `MANAGE_COMMUNITIES`,
`VIEW_ANALYTICS`, `VIEW_AUDIT_LOGS`, `MANAGE_SYSTEM`, `VIEW_SECURITY`. Admins have all of them; moderators have
the first six.

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| `GET` | `/admin/session` | any staff | `{ user, role, permissions }` |
| `GET` | `/admin/system-status` | `VIEW_DASHBOARD` | `{ api, database, redis, cache, realtime, environment, uptimeSeconds, checkedAt }` as the server reports them |
| `GET` | `/admin/dashboard?refresh` | `VIEW_DASHBOARD` | `{ cards, activity, contentCreation, caseStatus, contentStatus, riskRadar, threats, auditStream, generatedAt }` (`auditStream` only with `VIEW_AUDIT_LOGS`, else `null`) |
| `GET` | `/admin/moderation?status&riskLevel&targetType&priority&from&to&sort&page&limit` | `REVIEW_MODERATION` | `status`: active (default), open, reviewing, resolved, dismissed, all · `priority`: low…critical or `urgent` (high + critical) · `sort`: priority (default) or newest. `{ cases (each with a target preview), summary (page 1), pagination }` |
| `GET` | `/admin/moderation/:id` | `REVIEW_MODERATION` | `{ case, target, reports: { total, byReason, items }, owner, history, previousCases, actions, canRevealAuthor }` |
| `PATCH` | `/admin/moderation/:id` | `REVIEW_MODERATION` | `{ decision, note?, confirm? }`: approve · flag · restrict · remove · escalate · warn · dismiss. restrict/remove/warn need `confirm: true` and a note (5–500 chars) |
| `POST` | `/admin/moderation/:id/reveal-author` | `REVIEW_MODERATION` + `REVEAL_ANONYMOUS_AUTHOR` | `{ reason }` (10–300 chars) → `{ author }`. Only for cases about anonymous posts/comments (422 otherwise); audited; 20 per hour per staff member |
| `GET` | `/admin/reports?status&priority&targetType&reason&page&limit` | `VIEW_REPORTS` | `status`: pending (default, "New"), reviewing, resolved, dismissed ("Rejected"), withdrawn, `high` (active high/critical), all. `{ reports, counts (incl. legacyPending), pagination }` |
| `GET` | `/admin/reports/:id` | `VIEW_REPORTS` | `{ report, case, otherReports, actions }` |
| `PATCH` | `/admin/reports/:id` | `VIEW_REPORTS` + `REVIEW_MODERATION` | `{ action, note? }`: review (pending → reviewing) · resolve · reject · escalate. 409 if someone handled it first |
| `GET` | `/admin/users?search&status&role&college&branch&sort&page&limit` | `MANAGE_USERS` | Search matches names, email and college/branch names ("IIIT", "mechanical"). `{ users, counts, pagination }` |
| `GET` | `/admin/users/:id` | `MANAGE_USERS` | `{ user, activity, trust, moderationHistory, contentCases, reports: { filed, against }, gamification, communities, projects, achievements, statusActions }` |
| `PATCH` | `/admin/users/:id/status` | `MANAGE_USERS` | `{ action, reason?, confirm? }`: suspend · unsuspend · block · activate · deactivate (suspend/block/deactivate need `confirm: true` and a reason) |
| `GET` | `/admin/content?type&status&verification&search&page&limit` | `MANAGE_CONTENT` | `type`: post (default), comment, project, achievement, anonymousPost. `{ type, types, items, counts, pagination }` |
| `PATCH` | `/admin/content/:type/:id` | `MANAGE_CONTENT` | `{ action, reason?, confirm? }`: approve · flag · restrict · remove; achievements also verify · reject (proof) |
| `GET` | `/admin/communities?search&type&status&moderation&page&limit` | `MANAGE_COMMUNITIES` | `{ communities, counts, pagination }` |
| `PATCH` | `/admin/communities/:id` | `MANAGE_COMMUNITIES` | `{ action, reason?, confirm? }`: suspend (restricted) · restore · remove |
| `GET` | `/admin/opportunities?status&search&page&limit` | `MANAGE_OPPORTUNITIES` | Same as Phase 8's `GET /opportunities/manage` |
| `POST` | `/admin/opportunities` | `MANAGE_OPPORTUNITIES` | Same body and response as `POST /opportunities` |
| `PATCH` | `/admin/opportunities/:opportunityId` | `MANAGE_OPPORTUNITIES` | Same as `PUT /opportunities/:id` (edit, publish, close, archive, back to draft) |
| `DELETE` | `/admin/opportunities/:opportunityId` | `MANAGE_OPPORTUNITIES` | Same as `DELETE /opportunities/:id` |
| `GET` | `/admin/analytics?range&refresh` | `VIEW_ANALYTICS` | `range`: 7d, 30d (default), 90d. `{ range, days, users, content, engagement, moderation, opportunities, generatedAt }` |
| `GET` | `/admin/audit-logs?category&actorRole&action&targetType&targetId&actorId&from&to&page&limit` | `VIEW_AUDIT_LOGS` | `category`: security, users, content, reports, opportunities, verification. `{ logs, pagination }` (limit ≤ 100) |
| `GET` | `/admin/security/status` | `VIEW_SECURITY` (admins) | `{ environment, production, checkedAt, services, protections, authentication, rateLimits, uploads, events: { sinceStart, auditedLast24Hours } }`: service health, which protections are on and their limits, security event counts. Never secrets, keys, connection strings, hosts or file paths |

Actions that change something run through a stricter limiter (150 per 15 min per staff member) and clear the
dashboard/analytics caches. Errors: 401 signed out, 403 wrong role or missing permission, 404 unknown id, 409
the item already changed (duplicate action, already closed, already in that status), 422 invalid input or an
action that doesn't fit (e.g. flagging an opportunity), 429 too many requests.

**Privacy rules the admin API keeps**: password hashes, login counters, students' IP addresses, tokens and
Cloudinary ids are never sent (account lists use explicit allow-lists). Who reported something is never sent.
Anonymous posts and comments carry `author: "anonymous"` everywhere; a student's detail page never counts,
lists or links their anonymous content, and audit rows that would tie a student to anonymous content are left
out of that student's history and shown without the student in the full log (`anonymityProtected: true`). The
reveal endpoint is the only way to learn an author, and every use is audited (who, when, why; never the answer).

**Audit log** (`ModerationAuditLog`, shared with Trust & Safety): `{ id, action, category, actorRole, actor,
targetType, targetId, previousStatus, newStatus, reason, metadata, caseId, anonymityProtected, ip, createdAt }`.
Admin actions recorded: `ADMIN_LOGIN` (moderator/admin sign-in), `ACCESS_DENIED`, `ANONYMOUS_AUTHOR_REVEALED`,
`USER_SUSPENDED`/`UNSUSPENDED`/`BLOCKED`/`ACTIVATED`/`DEACTIVATED`, `REPORT_REVIEWING`/`RESOLVED`/`REJECTED`/
`ESCALATED`, `OPPORTUNITY_CREATED`/`UPDATED`/`PUBLISHED`/`CLOSED`/`ARCHIVED`/`DRAFTED`/`DELETED` (from either
the admin or the Phase 8 routes), `ACHIEVEMENT_VERIFIED`/`REJECTED`, plus every Trust & Safety decision.
Phase 16 adds automated security events about accounts (actor "system"): `ACCOUNT_LOCKED`, `SUSPICIOUS_LOGIN`,
`REFRESH_TOKEN_REUSE`, `RATE_LIMIT_EXCEEDED` (once per limiter per hour per student; never for Anonymous Zone
requests), `ABUSE_PATTERN` (three limit episodes in 24 h: small risk bump and the `rate_limit_abuse` trust flag),
and `ROLE_CHANGED` from `npm run user:role` (Accounts category).

**Live admin events** (Socket.IO, only to moderators' and admins' connections, decided by the role in the
database at handshake and re-checked against the database before every staff event, so a demoted account
stops receiving them at once): `admin:newReport` `{ reportId, targetType, targetId, reason, priority, at }`,
`admin:newModerationCase` `{ caseId, targetType, targetId, riskLevel, priority, source, at }`,
`admin:systemAlert` `{ service, status, level, message, at }` (database or Redis connection lost/restored).
Never a reporter, an owner, an anonymous author or content text.

Each feature phase adds its endpoints to this file.
