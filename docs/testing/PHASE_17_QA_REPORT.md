# Phase 17 QA Report

**Last updated:** 2026-10-11
**Scope:** the whole CampusX API (Phases 2–16 and the Phase 17 additions), the Semester Roadmap feature
(API and browser), and the failures left from the previous Phase 17 QA pass.
**Decision:** see [Readiness decision](#7-readiness-decision). No deployment was done, and Phase 18 was not started.

---

## 1. What was actually tested

| Item | Used in this pass | Notes |
| --- | --- | --- |
| Operating system | Windows 11 (10.0.26200) | The developer PC |
| Node.js | v24.16.0 | |
| MongoDB | Local throwaway `mongod` 8.2.6 on 127.0.0.1:27019 | A fresh database per suite (`tests/lib/stack.mjs`). `tests/lib/env-hook.mjs` refuses any other database |
| Backend | `server.js` on port 5090 (5093 for the production-mode checks in `api/security`) | Started by the test runner with test-only environment values |
| Frontend | Vite dev server on port 5174 (browser suite only) + `vite build` | API pointed at the test backend |
| Browser | Headless Chromium (Playwright build 1243) via playwright-core 1.59.1 | Desktop 1360×900, phone emulation 390×844, light and dark colour scheme, reduced motion |
| Cloudinary | **Not used.** A local stand-in (`tests/lib/fake-cloudinary.mjs`) answers uploads | Real Cloudinary has never been exercised by these tests |
| Redis | **Not used.** Every test backend runs with the in-memory fallback | |
| MongoDB Atlas (the developer's real database) | **Not touched** | The env hook blanks every `backend/.env` value for test processes |
| The developer's dev servers (5000 / 5173) | **Not used.** They were not running during this pass | |

Not tested at all: real Atlas, real Cloudinary, Redis, a production host or reverse proxy, real email,
Firefox/Safari, physical phones (phone layout is emulated), screen readers (ARIA roles, names and focus
were checked programmatically, not with assistive technology).

## 2. How to run

```
node tests/run.mjs                 # unit + API suites (one at a time, fresh database each)
node tests/run.mjs all             # + browser suites
node tests/run.mjs api auth        # one suite
```

Browser suites need playwright-core, which is not a project dependency: set `CAMPUSX_PLAYWRIGHT_CORE` to a
playwright-core folder (and `CAMPUSX_BROWSER` if no Playwright Chromium, Chrome or Edge is installed).
Results go to `tests/.results/` (now git-ignored).

## 3. Results

### Baseline at the start of this pass (before any fix)

`node tests/run.mjs` (unit + API, 15 suites): **1233 passed, 6 failed**.

| Suite | Failed check | Classification |
| --- | --- | --- |
| api/auth | audited once: PASSWORD_CHANGED … with address and device count | Genuine bug (QA-04) |
| api/auth | two simultaneous changes with the same current password → one 200, one 422 (got `[200,200]`) | Genuine bug (QA-03) |
| api/auth | only the winner's new password works | Genuine bug (QA-03, consequence) |
| api/auth | one audit row and one notification for the one change | Genuine bug (QA-03, consequence) |
| api/recommendations | a brand-new student gets a home page (500 "text index required for $text query") | Genuine start-up race (QA-05), surfaced by test timing |
| api/recommendations | cold start: /recommendations/posts answers 200 | Same as above |

The auth failures appeared in every run. The recommendations failures were intermittent: they passed in the
next full run, which is why the request for this pass spoke of "four remaining failures".

No failure was caused by test isolation. Every suite has its own database and backend and the runner runs
suites one at a time. No assertion was weakened, removed or loosened in this pass.

### Final run (after the fixes)

`node tests/run.mjs all` on 2026-10-11, one run, 17 suites:

| Suite | Passed | Failed |
| --- | ---: | ---: |
| unit/security | 52 | 0 |
| api/admin | 267 | 0 |
| api/anonymous | 46 | 0 |
| api/auth | 155 | 0 |
| api/communities | 61 | 0 |
| api/gamification | 38 | 0 |
| api/moderation | 29 | 0 |
| api/notifications | 33 | 0 |
| api/opportunities | 43 | 0 |
| api/posts | 74 | 0 |
| api/profile | 49 | 0 |
| api/recommendations | 28 | 0 |
| api/roadmap | 108 | 0 |
| api/search | 45 | 0 |
| api/security | 273 | 0 |
| api/showcase | 56 | 0 |
| browser/roadmap | 69 | 0 |
| **Total** | **1426** | **0** |

Also run after the final suite:

- `api/recommendations` three more times in a row: 28/28 each time.
- A cold-start reproduction outside the suites (a fresh backend on an empty database, then `/search` and
  `/recommendations` as soon as `/health` answers): **6/6 rounds returned 200** after the fix. Before the
  fix, `/search` returned 500 in 4 of 5 rounds.
- `vite build` (frontend production build): succeeded.

## 4. Defects

| ID | Sev | Area | Summary | Status |
| --- | --- | --- | --- | --- |
| QA-01 | P2 | Onboarding / Profile | A verified student could change their locked college or roll number through `PUT /onboarding` | Fixed earlier in Phase 17; regression checks in `api/profile` ("Campus identity lock") pass |
| QA-02 | P2 | Trust & Safety | A repeated title alone counted as an exact duplicate, leading to restriction and posting pauses | Fixed earlier in Phase 17; regression checks in `api/showcase` and `api/communities` pass. The earlier bug log also named "unit/moderation duplicate cases", but no such unit suite exists in `tests/unit/` |
| QA-03 | P2 | Auth: password change | Simultaneous password changes with the same current password all succeeded | **Fixed in this pass, verified** |
| QA-04 | P3 | Auth / audit log | The `PASSWORD_CHANGED` audit row lost its device count (stored as `"[redacted]"`) | **Fixed in this pass, verified** |
| QA-05 | P3 | Start-up / database | On a brand-new database the API answered before its indexes existed | **Fixed in this pass, verified** |
| QA-06 | P3 | Semester Roadmap | "Next milestone" ignored whether prerequisites were done | Fixed during the roadmap work, verified |

### QA-03: simultaneous password changes all succeeded

- **Symptom:** two (or five) simultaneous `PUT /auth/password` requests with the same correct current
  password all answered 200. The last write won the stored hash, so a student could be told their password
  was changed to one that does not work. Each request also wrote its own audit row and notification.
- **Root cause:** `services/authService.js changePassword()` checked the current password with bcrypt, then
  wrote the new hash with `User.updateOne({ _id })`. Nothing stopped a second request from passing the same
  check before the first one wrote.
- **Fix:** the update now applies only while the stored hash is still the one that was checked:
  `User.updateOne({ _id, passwordHash: user.passwordHash }, …)`. A request that loses the race gets the
  normal 422 "Your current password is incorrect." The surrounding code comment already described this
  behaviour; the filter itself was missing.
- **History found during the investigation:** a copy of `authService.js` saved by the previous Phase 17
  session (`authService.js.bak`, 2026-10-10 15:01) already contained exactly this guard and the QA-04 key.
  The live file, rewritten in the same minute, had neither. This looks like a fault-injection check that was
  never reverted. Either way, the live code was defective. After the fix it is identical to that copy apart
  from line endings.
- **Regression tests:**
  - The existing "two changes at once" checks in `api/auth`.
  - New in `api/auth` ("Password change: five changes at once", 6 checks): exactly one 200; the other four
    get 422 on `currentPassword`; the stored hash is the winner's and no loser's; the other device was
    signed out once; one audit row with the device count; one notification.
- **Proof the tests catch it:** I re-applied the defect temporarily. `api/auth` then failed 9 checks (the
  original 4 plus 5 of the new ones), and passed again once the fix was restored byte for byte.

### QA-04: the password-change audit row lost its device count

- **Root cause:** the event metadata key was `otherSessionsSignedOut`. `sanitizeSecurityMetadata()`
  (`services/securityService.js`) redacts every key matching `/…|session|…/i`, so the audit row stored
  `"[redacted]"`.
- **Fix:** the audit metadata key is now `otherDevicesSignedOut`. The API response keeps
  `otherSessionsSignedOut`, which the profile's Change Password card reads, so nothing changes for clients.
- **Regression tests:**
  - The existing `api/auth` check ("audited once … with address and device count").
  - A new `api/auth` check on the five-way race.
  - A new `unit/security` check: a `session` key is redacted while `otherDevicesSignedOut` is kept.

### QA-05: start-up race on a brand-new database

- **Symptom:** on an empty database, `GET /search?q=…` answered 500 "text index required for $text query"
  (4 of 5 fresh starts), and the recommendations home page could too. During that window the unique
  indexes (for example one account per email) were not enforced yet either.
- **Root cause:** Mongoose builds schema indexes in the background after connecting. `server.js` started
  listening as soon as the connection opened, so `/health` reported ready while the six `search_text`
  indexes and the unique indexes were still being built.
- **Fix:** `config/db.js` now waits, after connecting, for every registered model's index build
  (`Model.init()` returns the build Mongoose already started, so nothing is built twice). The wait is capped
  at 30 s, after which start-up continues with a logged warning; build failures are still logged and don't
  stop start-up. When the indexes already exist (any database used before), the wait takes milliseconds.
- **Regression tests:** new in `api/search` ("Indexes are ready before the API answers", 3 checks): as soon
  as `/health` answers, all six `search_text` indexes and the unique email index exist, and the first
  search on the brand-new database answers 200.
- **Proof the tests catch it:** with the wait disabled temporarily, the index check failed (all six indexes
  missing at `/health`). It passed again with the fix restored byte for byte.

### QA-06: roadmap "next milestone" ignored prerequisites

`pickNextMilestone()` compared prerequisite objects with milestone ids, so no milestone with prerequisites
was ever considered "ready". It now reads each prerequisite's `completed` flag. Three `api/roadmap` checks
cover it, and they fail against the old code.

### Housekeeping in this pass (not defects in the app)

- `tests/.results/` (throwaway databases, logs, screenshots; about 400 MB after a full run) was not
  git-ignored. It is now.
- `docs/security/SECURITY_CHECKLIST.md` still said there was no password-change endpoint. It now describes
  the Phase 17 endpoint and its controls; password reset is still listed as a known gap.

## 5. Semester Roadmap: integration review

| Area | What was checked | Evidence |
| --- | --- | --- |
| Profile button | Visible on the student's own profile with label, description and real progress; links to `/profile/roadmap`; not shown on other students' profiles or in the editor preview | browser/roadmap "Profile page"; code review of `PublicProfilePage` and `EditProfilePage` (they don't pass the `banner` prop) |
| Route | `/profile/roadmap` opens the page from the button, from a direct link (`?semester=N`) and after a reload; the static path takes precedence over `/profile/:userId` | browser/roadmap "Opening the roadmap", "Refresh and sign-in persistence", "Reduced motion" |
| Existing profile features | Edit profile, Change photo, Campus Journey and About still render; the `api/profile` suite passes (49/49) | browser/roadmap, api/profile |
| Gamification | 10 XP once per semester through the points ledger (award, reversal, reinstatement, never a second award); the ledger matches the total; Pathfinder badge; exactly one "You earned Pathfinder" notification, even after an undo/redo storm; awards re-checked after a branch change; `api/gamification` passes (38/38) | api/roadmap "Semester completion…", "Changing the career goal…", "Profile change…" |
| Logout | The roadmap store is cleared by the logout action; after logging out and in, progress and the last semester viewed come back from the server | browser/roadmap "Refresh and sign-in persistence" |
| Session ended elsewhere | A password change on another device signs this tab out; a milestone click from the dead session saves nothing; the next student signing in on the same tab (no reload) never sees the previous student's roadmap or profile summary | browser/roadmap "Session ended elsewhere, another student on the same tab" (5 checks, new in this pass) |
| Authentication and account status | All 7 roadmap routes answer 401 without a token; a suspended student gets 403 on reads and writes, and nothing is stored; one student can't change another's progress (user ids in the body are ignored) | api/roadmap "Access", "Ownership", "Account status" |
| Accessibility and motion | Keyboard tabs (arrows, Home, End), visible focus, progress bars with labels; under reduced motion the new semester appears without an exit animation and without movement | browser/roadmap "Keyboard", "Reduced motion" |
| Layout | No horizontal page overflow on desktop or phone; the semester row scrolls to the selected semester; dark mode uses the dark tokens | browser/roadmap "Phone layout and dark mode", "Desktop dark mode" |

No integration defects were found beyond QA-06.

## 6. Unresolved issues and known gaps

1. **Real services are untested:** MongoDB Atlas, Cloudinary, Redis and a production host were not
   exercised in this pass (see section 1). Uploads are only verified against the local Cloudinary stand-in.
2. **Browser coverage for Phases 1–16 is not in the repository.** `tests/browser/` contains only the
   Semester Roadmap suite. The earlier phases' UI suites lived in previous sessions' temporary folders and
   were **not re-run** in this pass. Phase 1–16 UI behaviour is covered here only indirectly (through their
   APIs, plus the profile and navigation paths the roadmap suite uses).
3. **`unit/moderation` is missing,** although the earlier QA-02 entry names it as a regression test.
   QA-02 is still covered by API checks.
4. **playwright-core is not a project dependency,** so browser suites need `CAMPUSX_PLAYWRIGHT_CORE`.
   Without it, `node tests/run.mjs all` reports the browser suite as failed, with the reason.
5. **Stale test databases** can remain in `tests/.results/db/` when Windows holds files during clean-up.
   They are harmless and git-ignored, and can be deleted while no tests are running.
6. **Semester Roadmap template management** in the admin control center is not built. Templates are code
   (`backend/data/roadmapOptions.js`). The follow-up is documented in `docs/architecture/overview.md`.
7. **Single final run:** the final full run was done once; only `api/recommendations` was repeated (3×).
   Flakiness in other suites can't be ruled out from one run. Across every full run in this session, the
   only failures were the ones listed in section 3.
8. **Mixed line endings** (LF and CRLF) exist across source files. This is cosmetic: `core.autocrlf=true`
   normalises them in Git.

## 7. Readiness decision

**Phase 17 QA: passed, with conditions.**

- Every unit, API and browser suite in the repository passes on the isolated local stack: 1426 checks,
  0 failures.
- All failures found in this pass were genuine defects. Each one is fixed, has a regression test, and the
  test is shown to fail without the fix.
- No assertions were weakened.

This is **not** a production or deployment approval. Before a release:

- Run the suites (or a smoke test) against a staging environment with real MongoDB Atlas, Cloudinary and
  Redis.
- Restore browser coverage for Phases 1–16 in `tests/browser/` and run it.
- Re-run `node tests/run.mjs all` on the release candidate.

Phase 18 has not been started.

## 8. Files changed in this pass

- `backend/services/authService.js`: QA-03 guard on the password update; QA-04 audit key.
- `backend/config/db.js`: QA-05 wait for index builds before serving.
- `tests/api/auth.mjs`: "five changes at once" (6 checks).
- `tests/unit/security.mjs`: metadata key check (1 check).
- `tests/api/search.mjs`: index readiness (3 checks).
- `tests/api/roadmap.mjs`: route-level 401s, Pathfinder notification (2), account status (2).
- `tests/browser/roadmap.mjs`: session ended elsewhere (5 checks).
- `.gitignore`: `tests/.results/`.
- `docs/security/SECURITY_CHECKLIST.md`: password-change controls.
- `docs/testing/PHASE_17_QA_REPORT.md`: this report.
