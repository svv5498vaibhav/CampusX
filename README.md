# CampusX

> One digital campus where students can connect, create, collaborate, showcase achievements,
> discover opportunities, take part in communities and build their student identity.

**Current status: Phase 15 complete (Admin Control Center).** Students register, log in, onboard
and get a themed campus profile. They post to the campus feed (text, photos, a video; likes, comments,
saves, reports), join and create **communities** (campus, branch, class, interest, project and club
spaces, with members-only posts and owner/moderator tools), showcase **projects** ("Things I've
Built": images, tech stack, links, team) and **achievements** ("My Wins": proof that CampusX moderators
can verify), and discover **opportunities** (internships, hackathons, scholarships, workshops, campus
events, ...) with eligibility from their own profile, rule-based recommendations, deadlines, saving and
their own application tracking. CampusX moderators and admins post and manage opportunities. In the
**Anonymous Zone** students share campus feedback, questions and suggestions as "Anonymous Student": nobody
else sees who wrote a post or comment, while CampusX keeps the real author internally for safety and
moderation. **Campus Rankings** reward meaningful activity with XP from public, rule-based point rules:
levels, badges, streaks, a points history, and leaderboards for the whole campus, a college, a branch or
a semester (all time, this month, this week). **Notifications** arrive in real time over Socket.IO and are kept
in the notification center: likes and comments, team invites, achievement reviews, community members and
announcements, updates and deadlines for tracked opportunities, badges, level-ups and ranking milestones,
with unread counts, mark as read, preferences, and anonymous activity that never reveals who acted.
**Search** finds students, posts, projects, communities, opportunities and achievements from one box in the
navigation: suggestions as you type, grouped results, filters, sorting, pages and recent searches, always
within what the student is allowed to see (anonymous posts never by their author). **Trust & Safety** keeps
it friendly: rule-based checks (spam, duplicates, harmful links, threats, abusive language, fake engagement)
hold risky content for review, one report form works everywhere, students get warnings and short posting
pauses (never an automatic ban), and moderators work through cases in the admin control center. Community
guidelines live at `/safety`. **Recommendations** help students discover CampusX: a transparent, rule-based
engine (no machine learning) picks posts, projects, communities, opportunities they are eligible for,
students with similar interests and achievements from their interests, skills, campus and activity, says why
for each ("Matches your React skills"), mixes in new and trending campus content, and learns from "Not
interested". It powers `/discover` and a "Recommended for you" row and "For you" view on the home page. The
**Admin Control Center** at `/admin` is a separate, dark cyber-styled console for CampusX moderators and
admins: a command center with live counts, platform activity, a risk radar and a threat monitor; the
moderation queue and case review (approve, flag, restrict, remove, escalate, warn); report handling; student
management (search, account status, moderation and report history); content, community and opportunity
management; analytics; and an audit log of every decision. Access is permission-based and enforced by the API
on every request; anonymous authors stay hidden unless a moderator reveals one for an investigation, with a
reason, which is audited. The **Semester Roadmap** (a "🎓 Semester Roadmap" button on the student's own profile,
page `/profile/roadmap`) shows a semester-by-semester path for all eight semesters: what to learn, practise and
build for the student's chosen career goal (Full Stack, Frontend, Backend, AI/ML, Data Analyst, Cybersecurity,
Mobile), adapted to their branch track, with objectives, suggested projects and checked resource links. Students
mark milestones in progress or complete; progress, semester completion and the next suggested milestone are
calculated by the server from their saved records, survive refresh and sign-in, and changing goal never deletes
progress. Completing a whole semester earns XP once per semester. These are suggestions by CampusX, not an
official syllabus. The **Resume Builder** (a card on the student's own profile and a link in the phone account
sheet, pages `/resume-builder` and `/resume-builder/:resumeId`) builds resumes from the student's CampusX profile:
import name, college, branch, skills, projects, achievements, certifications and completed roadmap learning
(only their own records; nothing invented), edit everything in a ten-step guided editor with a live A4 preview
and autosave, pick one of six Fresher & Internship templates or four general ones, run an explained resume
check (with optional job-description keywords), and download a real, text-based A4 PDF that matches the preview.
Students keep up to 20 private resumes (duplicate, rename, default, delete). An optional AI assistant (Google Gemini,
server side, `GEMINI_API_KEY`) suggests summaries, bullet points and keywords for the student to review. Students can **follow** each other (Follow / Following on profiles, student cards and lists,
with a short celebratory animation, follower and following counts that open paginated, searchable lists, and a
"started following you" notification) and send **direct messages** (a Message button on every profile opens the
one conversation two students share; `/messages` has the inbox, live delivery, unread counts and "Seen"). A
student can block another from following and messaging them. See the [roadmap](#10-future-phase-roadmap).

---

## 1. What is CampusX?

CampusX is a student-first platform built around college life: clubs and communities, projects and
ideas, achievements, campus events and opportunities. It is designed to feel like a **digital college
campus**, friendly, fresh and easy for students to pick up, not like a corporate networking site.

## 2. Main objective

Give every student one place to:

- connect with classmates, seniors and mentors
- share ideas, projects, achievements and campus moments
- collaborate on projects, hackathons and club work
- discover internships, events and opportunities
- belong to communities and build a recognisable student identity

The first phases build the foundation that all of this sits on, so features can be added later
without restructuring.

## 3. Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, React Router 8, Tailwind CSS 4, Zustand, Axios, Lucide React, Framer Motion |
| Backend | Node.js, Express 5, Mongoose 9 (MongoDB), Socket.IO |
| Auth | JWT access tokens (jsonwebtoken), bcryptjs password hashing, rotating refresh tokens in HttpOnly cookies (cookie-parser) |
| Security | Helmet, CORS allow-list, express-rate-limit, express-validator, express-mongo-sanitize, hpp, body size limits |
| Media | Cloudinary + Multer: profile photo and cover, post photos and videos, community, project, achievement, opportunity and Anonymous Zone images |
| Caching | Redis (optional), with an automatic in-memory fallback |
| Tooling | concurrently (root dev script), Node's built-in `--watch` for backend reloads |

## 4. Project structure

```
CampusX/
├── frontend/                    React + Vite app
│   ├── public/                  Static files (favicon)
│   └── src/
│       ├── assets/              Images and static media
│       ├── components/
│       │   ├── ui/              Generic UI kit (Button, Input, Modal, Card, ...)
│       │   ├── layout/          PageContainer, SectionHeader, navigation, outlet
│       │   ├── brand/           Logo
│       │   ├── auth/            AuthShell, PasswordChecklist
│       │   ├── onboarding/      OnboardingLayout, OnboardingProgress, selectors, OnboardingReview, ...
│       │   ├── profile/         ProfileView, ProfileHeader, ImageUploadDialog, ThemePicker, ...
│       │   ├── feed/            CreatePost, PostComposer, PostCard, PostMenu, PostMedia, CommentSection,
│       │   │                    ReportPostModal, FeedFilters, FeedSidebar
│       │   ├── communities/     CommunityCard, CommunityHeader, CommunityMembers, CommunityAbout,
│       │   │                    CreateCommunityModal, EditCommunityModal, CommunityJoinButton, ...
│       │   ├── projects/        ProjectCard, ProjectForm, ProjectMedia, ProjectMenu
│       │   ├── achievements/    AchievementCard, AchievementForm, AchievementProof, AchievementMenu,
│       │   │                    VerificationBadge
│       │   ├── anonymous/       AnonymousPostCard, AnonymousPostForm, AnonymousComment, AnonymousFilters,
│       │   │                    AnonymousSafetyNotice, ReportAnonymousModal
│       │   ├── gamification/    LeaderboardTabs, LeaderboardPodium, LeaderboardRow, MyRankCard, LevelProgress,
│       │   │                    RankStatCard, BadgeCard (+ BadgeGrid, BadgeIcon), PointActivity,
│       │   │                    CampusJourneyCard (profile), HowPointsWork
│       │   ├── opportunities/   OpportunityCard, OpportunityFilters, OpportunitySearch, OpportunityDeadline,
│       │   │                    OpportunityStatus, OpportunitySaveButton, OpportunityTypeIcon,
│       │   │                    ReportOpportunityModal, OpportunityForm (moderators/admins)
│       │   ├── notifications/   NotificationBell (sidebar dropdown / phone link), NotificationDropdown,
│       │   │                    NotificationCenter, NotificationItem, NotificationIcon, NotificationBadge,
│       │   │                    NotificationPreferences, NotificationEmptyState, NotificationSkeleton,
│       │   │                    LiveUpdatesHint
│       │   ├── showcase/        ShareToFeedDialog (optional post about a project / achievement / opportunity)
│       │   ├── safety/          ReportModal (one report form for everything), ReportButton, ModerationNotice,
│       │   │                    ContentWarning, SafetyGuidelines
│       │   ├── recommendations/ RecommendationSection, RecommendationCard (+ "Not interested" menu), Recommended
│       │   │                    Post/Project/Community/Opportunity/Student/AchievementCard, RecommendationReason,
│       │   │                    RecommendationSkeleton, TrendingSection, ForYouFeed
│       │   ├── search/          GlobalSearch (navigation), SearchInput (combobox), SearchSuggestions, SearchTabs,
│       │   │                    SearchFilters, SearchResultSection, Student/Project/Community/Opportunity/
│       │   │                    AchievementSearchCard, PostSearchResult, SearchEmptyState, SearchSkeleton,
│       │   │                    RecentSearches
│       │   ├── social/          Follows: FollowButton (the follow animation), AnimatedCount, FollowStats,
│       │   │                    FollowListModal (followers/following), MessageButton, BlockDialog
│       │   ├── messages/        Direct messages: ConversationList, ChatPanel, MessageThread, MessageComposer,
│       │   │                    MessagesUnreadBadge
│       │   ├── roadmap/         Semester Roadmap: RoadmapProfileCard (profile button), RoadmapHero, RoadmapIllustration,
│       │   │                    RoadmapProgressRing, NextTaskCard, SemesterTimeline (journey + semester tabs),
│       │   │                    SemesterPanel (transitions), SemesterOverviewCard, MilestoneCard,
│       │   │                    RoadmapResourceList, SemesterCompletionCelebration, SkillMastery, CareerGoalPicker
│       │   ├── resume/          Resume Builder: ResumeProfileCard (profile entry), StepNav, ResumePreview + ResumePage
│       │   │                    (SVG pages), ResumePrint, ResumeFields (month/year, bullets, item lists), AiAssist,
│       │   │                    ResumeDialogs, steps/ (one component per wizard step)
│       │   ├── admin/           Control center: AdminSidebar, AdminHeader, SystemStatus, AdminStatCard, AdminChart
│       │   │                    (line, bars, donut), RiskRadar, ModerationTable, ReportTable, UserTable, ContentTable,
│       │   │                    CaseDetail, ConfirmActionModal, AdminUi (panels, pills, filters, pagination), AdminNotFound
│       │   ├── common/          App-level pieces (ThemeToggle, PlaceholderPage, AccessDenied, ...)
│       │   └── landing/         Landing page illustration
│       ├── constants/           Routes, navigation, app config (API base URL)
│       ├── hooks/               Reusable hooks (forms, logout, theme sync, document title, API health,
│       │                        comments, URL filters, a shared minute clock for countdowns,
│       │                        useNotificationsSocket for live notifications, useAdminSocket for admin alerts)
│       ├── layouts/             PublicLayout, CampusLayout, AdminLayout (the /admin control center)
│       ├── pages/               One file per route (HomePage = campus feed, PostPage, CommunitiesPage,
│       │                        CommunityDetailsPage, projects/, achievements/, opportunities/, anonymous/,
│       │                        rankings/, gamification/, notifications/, search/, SafetyPage, DiscoverPage,
│       │                        roadmap/ (SemesterRoadmapPage at /profile/roadmap),
│       │                        resume/ (ResumeBuilderPage at /resume-builder, ResumeEditorPage),
│       │                        admin/ (AdminDashboard, AdminModeration, AdminReports, AdminUsers, AdminUserDetail,
│       │                        AdminContent, AdminCommunities, AdminOpportunities, AdminAnalytics, AdminAuditLogs,
│       │                        opportunities/OpportunityEditor),
│       │                        placeholders)
│       │                        + dev/ tools
│       ├── routes/              Router + ProtectedRoute / GuestRoute / OnboardingGuard / AdminRoute (permission guard)
│       ├── services/            Axios instance (api.js) + API calls (authApi, profileApi, postApi, searchApi, reportApi, recommendationApi, roadmapApi,
│       │                        adminApi, ...) +
│       │                        socket.js (the tab's single Socket.IO connection)
│       ├── store/               Zustand stores (authStore, onboardingStore, profileStore, feedStore, toastStore,
│       │                        communityStore, projectStore, achievementStore, opportunityStore, anonymousStore,
│       │                        rankingStore, gamificationStore, notificationStore, searchStore, reportStore, recommendationStore, roadmapStore,
│       │                        adminStore, themeStore)
│       ├── styles/              Tailwind entry + design tokens
│       └── utils/               Small pure helpers
├── backend/                     Express API
│   ├── config/
│   │   ├── env.js               Loads .env, defaults, production checks
│   │   ├── db.js                MongoDB connection, status, shutdown
│   │   ├── redis.js             Optional Redis connection
│   │   ├── cloudinary.js        Cloudinary configuration
│   │   ├── cors.js              CORS allow-list (shared with Socket.IO)
│   │   ├── media.js             Upload presets (sizes, types, folders)
│   │   ├── moderationConfig.js  Trust & Safety rules: statuses, risk levels, SpamDetector rules, signals,
│   │   │                        enforcement ladder, report reasons, case decisions
│   │   ├── moderationLimits.js  Behaviour limits (signals), fake-engagement limits, 429 limits
│   │   ├── recommendationConfig.js  Recommendation types, weights, freshness, diversity, candidate limits,
│   │   │                        cache, feedback rules, interest → area mapping, reason wording
│   │   ├── adminConfig.js       Admin control center: permissions, role grants, actions (confirm/reason rules),
│   │   │                        page sizes, cache lifetimes, audit categories, admin rate limits
│   │   ├── securityConfig.js    Security rules: request screening, sign-in rules, security events, abuse
│   │   │                        pattern, auth rate limits, upload names, PDF markers, placeholder secrets
│   │   └── auth.js              Cookie options, bcrypt cost, JWT issuer/audience
│   ├── data/                    campusOptions.js (colleges, branches, interests, skills, limits),
│   │                            profileOptions.js (profile styles, bio limit),
│   │                            postOptions.js (post types, visibility, feed filters, report reasons, limits),
│   │                            communityOptions.js (types, visibility, roles, limits),
│   │                            showcaseOptions.js (project categories/statuses, achievement types, limits),
│   │                            opportunityOptions.js (types, modes, statuses, tracking statuses, filters,
│   │                            report reasons, limits, interest → keyword rules for recommendations),
│   │                            anonymousOptions.js (categories, visibility, report reasons, limits, rate limits),
│   │                            gamificationOptions.js (point rules, caps, quality rules, levels, badges,
│   │                            ranking scopes/periods, tie-breakers, ranking milestones),
│   │                            notificationOptions.js (types, categories, repeat policies, limits),
│   │                            searchOptions.js (search types, sorts, limits, relevance and text-index weights,
│   │                            stop words, rate limits),
│   │                            roadmapOptions.js (Semester Roadmap: career goals, branch tracks, semester focus,
│   │                            every milestone with checked resource links, rate limits, start-up self-check),
│   │                            resumeOptions.js (Resume Builder: templates, target roles, sections, accents,
│   │                            limits, rate limits, skill groups and keyword lists for the import and checker)
│   ├── controllers/             healthController, authController, onboardingController, profileController,
│   │                            postController, commentController, communityController, projectController,
│   │                            achievementController, opportunityController, anonymousController,
│   │                            rankingController, gamificationController, notificationController,
│   │                            searchController, reportController, moderationController,
│   │                            recommendationController, roadmapController,
│   │                            admin/ (dashboard, moderation, report, user, content, community, opportunity,
│   │                            analytics, audit and security controllers)
│   ├── middleware/              authMiddleware (authenticate, authorizeRoles), adminAuth (the admin gate),
│   │                            adminPermission (requirePermission), errorMiddleware,
│   │                            notFoundMiddleware, requestLogger, rateLimiter, requireDatabase,
│   │                            trustedOrigin, sanitizeMiddleware, validateMiddleware, uploadMiddleware
│   ├── models/                  User, Session, Post, Comment, PostReport, Community, CommunityMember, Project,
│   │                            Achievement, Opportunity, OpportunityApplication, OpportunityReport,
│   │                            AnonymousPost, AnonymousComment, AnonymousReport, StudentGamification,
│   │                            PointTransaction, Notification, NotificationPreference, SearchHistory,
│   │                            Report, ModerationCase, ModerationAuditLog (+ moderationFields, shared),
│   │                            RecommendationProfile, RecommendationFeedback, RecommendationInteraction,
│   │                            StudentRoadmapProgress, Resume
│   ├── routes/                  index.js (/api/v1) + healthRoutes, authRoutes, onboardingRoutes, profileRoutes,
│   │                            postRoutes, commentRoutes, communityRoutes, projectRoutes, achievementRoutes,
│   │                            opportunityRoutes, anonymousRoutes, rankingRoutes, gamificationRoutes,
│   │                            notificationRoutes, searchRoutes, reportRoutes, moderationRoutes,
│   │                            recommendationRoutes, roadmapRoutes, adminRoutes (/api/v1/admin)
│   ├── services/                authService, sessionService, onboardingService, campusOptionsService,
│   │                            profileService, profileMediaService, mediaService, healthService, cacheService,
│   │                            postService, postMediaService, commentService, campusEvents, communityService,
│   │                            communityAccess, communityMediaService, projectService, achievementService,
│   │                            showcaseAccess, opportunityService, opportunityAccess,
│   │                            opportunityApplicationService, opportunityRecommendationService,
│   │                            opportunityMediaService, anonymousService, anonymousCommentService,
│   │                            anonymousReportService, anonymousModeration (internal, staff only),
│   │                            gamificationService (points ledger, levels, badges, streaks),
│   │                            gamificationEvents (campus events → points), rankingService (leaderboards),
│   │                            notificationService (save, read, deliver, preferences),
│   │                            notificationEvents (campus events → notifications),
│   │                            searchService (global/category search, suggestions, filters, safe results),
│   │                            searchQuery (query cleaning, safe patterns, option matching),
│   │                            searchRelevance (the one relevance scorer), searchHistoryService,
│   │                            moderationService (analysis, cases, actions, audit, enforcement, engagement),
│   │                            spamDetectionService (the original CampusX SpamDetector), reportService,
│   │                            moderationCaseService (moderators' case API),
│   │                            recommendationService (profile, ranking, cache, discovery, feedback),
│   │                            recommendationCandidates (capped pools per kind), recommendationScoring
│   │                            (the one scorer, freshness, diversity), recommendationProfileService
│   │                            (derived profile), recommendationEvents (campus events → profile),
│   │                            securityService (security events, request screening, sign-in rules, abuse),
│   │                            roadmapService (Semester Roadmap: resolve goal + track, progress maths, changes),
│   │                            resumeService, resumeContent, resumeImportService, resumeAnalysisService,
│   │                            resumeAiService + aiProvider (Resume Builder and its optional AI assistant),
│   │                            admin/ (dashboardService, moderationService, reportService, userManagementService,
│   │                            contentManagementService, analyticsService, auditService, securityStatusService,
│   │                            adminAccess, adminTargets, adminSeries, adminCache, adminRealtime)
│   ├── validators/              fieldRules (shared), authValidators, onboardingValidators,
│   │                            profileValidators, postValidator, communityValidator, projectValidator,
│   │                            achievementValidator, opportunityValidator, anonymousValidator,
│   │                            gamificationValidator, notificationValidator, searchValidator, reportValidator,
│   │                            moderationValidator, recommendationValidator, roadmapValidator, adminValidator, showcaseRules,
│   │                            commonValidators
│   ├── scripts/                 setUserRole.js (developer-only role changes)
│   ├── sockets/                 socket.js (server, rooms, emitToUser, emitToStaff), socketAuth.js (handshake sign-in),
│   │                            socketEvents.js (event names)
│   ├── jobs/                    opportunityDeadlineReminders.js (in-process timer)
│   ├── utils/                   ApiError, apiResponse, logger, gracefulShutdown, generateToken, personalInfo, keyedQueue,
│   │                            imageMetadata, periods (gamification days/weeks/months),
│   │                            mediaSignature, uploadSafety (file names, PDF checks), sharedCounterStore
│   │                            (Redis-or-memory counters), profileCompletion, tempFiles, objectId, slug
│   ├── uploads/                 Temporary upload staging (git-ignored)
│   ├── app.js                   Express app: middleware + routes
│   └── server.js                Startup: env, DB, Redis, Cloudinary, sockets, listen, shutdown
├── docs/
│   ├── architecture/            How the system is put together
│   ├── api/                     API conventions and endpoints
│   ├── security/                SECURITY_CHECKLIST.md (controls, where they live, known gaps)
│   └── testing/                 PHASE_17_QA_REPORT.md (test results, defects, readiness)
├── package.json                 Root scripts (runs frontend + backend together)
└── README.md
```

More detail: [docs/architecture/overview.md](docs/architecture/overview.md).

## 5. How to install

Requirements: **Node.js 22.22 or newer** (Node 24 LTS recommended), npm, and **MongoDB**: a local
server (e.g. the MongoDB Windows service on `127.0.0.1:27017`) or a free MongoDB Atlas cluster. Redis
is optional.

```bash
git clone <your-repo-url> CampusX
cd CampusX
npm run setup        # installs root, backend and frontend dependencies
```

Create your local environment files from the templates, then fill in `MONGODB_URI`:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

On Windows PowerShell use `Copy-Item` instead of `cp`. For a local MongoDB service a typical value is
`MONGODB_URI=mongodb://127.0.0.1:27017/campusx_dev`. Use a database of its own: if an older CampusX
build left a `campusx` database behind, its `users`/`sessions` collections have different shapes and
indexes and would clash with this version.

## 6. How to run the frontend

```bash
npm run frontend     # from the project root
# or
cd frontend && npm run dev
```

Opens on http://localhost:5173. Other frontend scripts: `npm run build` (production bundle in
`frontend/dist`) and `npm run preview` (serve that bundle locally).

## 7. How to run the backend

```bash
npm run backend      # from the project root, restarts on file changes
# or
cd backend && npm run dev
```

For production use `npm start`. **Both together:** `npm run dev` from the root.

A healthy start looks like this:

```
INFO CampusX API starting...
INFO MongoDB connected successfully (database: campusx)
WARN Redis: not configured (REDIS_URL is empty) - continuing without Redis cache
WARN Cloudinary: not configured - media uploads unavailable
INFO Socket.IO: ready
INFO CampusX API running on http://localhost:5000 (development)
```

Check it:

```bash
curl http://localhost:5000/api/v1/health
```

```json
{
  "success": true,
  "message": "CampusX API is running",
  "data": { "environment": "development", "database": "connected", "redis": "not_configured" }
}
```

In development, http://localhost:5173/dev/status shows whether the frontend can reach the backend.

## 8. Environment variables

### backend/.env

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | API port, default `5000` |
| `NODE_ENV` | no | `development` (default) or `production` |
| `MONGODB_URI` | yes (production) | MongoDB connection string. If empty in development the API still starts, without a database, and logs a warning. For Atlas, put the database name before the `?` (`…mongodb.net/campusx?…`), otherwise MongoDB uses `test` |
| `DNS_SERVERS` | no | DNS servers for `mongodb+srv://` (Atlas) lookups, e.g. `8.8.8.8,1.1.1.1`. Empty = system DNS, with an automatic fallback (see below) |
| `CLIENT_URL` | yes (production) | Allowed frontend origin(s) for CORS and Socket.IO, comma-separated. Default `http://localhost:5173` |
| `JWT_SECRET` | yes (production) | Signs access tokens; 32+ characters in production. If empty in development a temporary secret is generated per start |
| `JWT_EXPIRES_IN` | no | Access token lifetime, default `15m` (renewed silently by the refresh cookie) |
| `REFRESH_TOKEN_EXPIRES_IN` | no | How long a device stays signed in without activity, default `7d` |
| `MAX_LOGIN_ATTEMPTS` | no | Failed passwords before sign-in is locked, default `5` |
| `LOGIN_LOCK_MINUTES` | no | Length of that temporary lock, default `15` |
| `COOKIE_SAME_SITE` | no | Refresh cookie SameSite: `lax` (development default) or `none` (production default, cross-site deploys) |
| `RATE_LIMIT_MAX` | no | Requests per 15 min per IP across the API, default `1000` (generous for shared campus networks) |
| `GAMIFICATION_TIMEZONE` | no | IANA time zone for daily caps, streaks and the weekly/monthly rankings, default `Asia/Kolkata` (weeks start Monday 00:00) |
| `REDIS_URL` | no | Redis connection. If empty or unreachable, an in-memory cache is used |
| `CLOUDINARY_CLOUD_NAME` | for uploads | Cloudinary account. Without the three Cloudinary values the app still runs; photo/cover uploads answer "uploads aren't available right now" |
| `CLOUDINARY_API_KEY` | for uploads | Cloudinary API key. It must be allowed to upload and delete assets: a key without those permissions starts fine, but every upload fails with "upload failed" and the server log says HTTP 403 |
| `CLOUDINARY_API_SECRET` | for uploads | Cloudinary API secret |
| `TRUST_PROXY` | no | Number of reverse proxies in front of the API (e.g. `1` on Render/Railway) |
| `GEMINI_API_KEY` | no | Turns on the Resume Builder's optional AI assistant, powered by Google Gemini (create a key at https://aistudio.google.com/apikey). Server side only: never sent to the browser or logged. Without it the Resume Builder works fully and the "Improve with AI" buttons explain that the assistant isn't set up. On the free tier, students see "try again in a minute / tomorrow" when the quota runs out |
| `RESUME_AI_MODEL` | no | Gemini model for the assistant, default `gemini-3.5-flash-lite` |
| `RESUME_AI_ENABLED` | no | `false` switches the assistant off even when a key is present |
| `GEMINI_BASE_URL` | no | Only for a proxy in front of the Gemini API; leave empty |

In production the server refuses to start if `MONGODB_URI`, `JWT_SECRET` or `CLIENT_URL` is missing, if
`JWT_SECRET` is shorter than 32 characters or still an example value, if `CLIENT_URL` contains `*`, a path or a
plain-`http` public origin, or if `JWT_EXPIRES_IN` is longer than 1 hour. Production never generates a
temporary secret. In development a short `JWT_SECRET` only logs a warning. The full security checklist is in
[docs/security/SECURITY_CHECKLIST.md](docs/security/SECURITY_CHECKLIST.md).

**`querySrv ECONNREFUSED` with MongoDB Atlas on Windows.** `mongodb+srv://` addresses are looked up
with SRV DNS queries that Node.js sends through its own resolver, not Windows'. On some machines that
resolver can't read the Windows DNS settings and asks 127.0.0.1 instead, so the lookup fails even though
`nslookup` works. The API detects exactly this failure and sends those lookups to public DNS
(8.8.8.8, 1.1.1.1), logging a warning. On networks that block public DNS (some colleges do), set
`DNS_SERVERS` to the network's own DNS servers. If the startup error instead says *authentication
failed*, check the Atlas database user and password; if it says *no Atlas server answered*, check Atlas
**Network Access** (your current IP must be allowed).

### frontend/.env

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL including version, e.g. `http://localhost:5000/api/v1` |
| `VITE_SOCKET_URL` | Optional. Live updates (Socket.IO) address; defaults to the origin of `VITE_API_URL` |

Anything prefixed `VITE_` is bundled into the browser. **Never put secrets in the frontend env.**
Real `.env` files are git-ignored; only `.env.example` templates are committed.

### Creating an admin or moderator (development)

Public registration always creates students. To give an existing account a staff role:

```bash
npm run user:role --prefix backend -- --email someone@college.edu --role admin 
```

The account must already exist (register it in the app first). The script never creates users or
handles passwords, and refuses to run with `NODE_ENV=production` unless `--allow-production` is
passed. Every role change is written to the admin audit log (`ROLE_CHANGED`).

### The admin control center

Moderators and admins open `/admin` (or the shield icon next to their name in the campus sidebar / account
menu). Admins see everything; moderators see the dashboard, moderation, reports, content and opportunities.
Students get the "This area is for campus staff" page, and `403` from every `/api/v1/admin` endpoint. Staff
accounts don't need a campus profile to use it. Roles and their permissions live in
`backend/config/adminConfig.js`.

Opportunities are posted by moderators and admins only: they see a **Manage** button on
`/opportunities` that opens `/admin/opportunities`. Students get `403` from the API if they try.

### Adding a college, branch or interest

All onboarding options live in `backend/data/campusOptions.js`, the single source for the API and the
frontend. To add a college, append an entry with a new, permanent `id` (for example
`"abc-nagpur"`). Students store these ids, so never change or reuse an existing one; renaming the
`name` is safe. The interest limits (3–8) and the skill and roll-number limits are in
`ONBOARDING_RULES` in the same file.

## 9. Development workflow

1. **Branch per change**: `git checkout -b feature/<short-name>` from `main`.
2. **Run both apps**: `npm run dev`.
3. **Backend changes follow the layers**: route → (validator) → controller → service → model.
   Controllers stay thin; rules and authorization live in services. See the architecture doc.
4. **Responses use one envelope**: `sendSuccess()` for success, throw `ApiError` for failures.
5. **Frontend changes reuse the kit**: build screens from `components/ui` and the semantic colour
   tokens (`bg-surface`, `text-ink`, `bg-primary`, ...). Avoid raw hex colours in components.
6. **Developer pages** (development builds only): http://localhost:5173/dev/ui (design system) and
   http://localhost:5173/dev/status (backend connection).
7. **Before a PR**: `npm run build` must pass, `/api/v1/health` must respond, and check new UI on
   a phone-width viewport and in both themes.
8. **Never commit** `.env` files, `node_modules`, `dist`, uploads, logs or keys.

## 10. Future phase roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Foundation: structure, design system, frontend shell, security baseline | **Done** |
| 1 | Backend foundation and database architecture: MongoDB, Redis fallback, Cloudinary config, Socket.IO, error handling, logging, health | **Done** |
| 2 | Authentication and authorization: register, login, logout, refresh sessions, roles, account status, brute-force protection, protected routes | **Done** |
| 3 | Onboarding: college, branch, semester, roll number, interests, skills, onboarding guard | **Done** |
| 4 | Student profiles: view/edit, photo + cover (Cloudinary), bio, skills, interests, campus details, 5 profile styles, live preview, completeness | **Done** |
| 5 | Campus feed and posts: text/photo/video, achievement, project, idea, event, opportunity and campus-update posts; campus/branch/public visibility; edit/delete own posts; likes, comments, saves, copy link, reports; feed filters and pagination | **Done** |
| 6 | Communities: official campus/branch/interest communities, student-created clubs and projects, college/branch/class access rules, join/leave, members and roles, members-only community posts, search, filters and rule-based suggestions | **Done** |
| 7 | Projects and achievements: create/edit/delete own, images and proof on Cloudinary, team members, likes, views, visibility, moderator verification API, discovery pages, profile sections, optional sharing to the feed or a community | **Done** |
| 8 | Opportunities: internships, hackathons, competitions, scholarships, fellowships, workshops, seminars, events, research and project competitions; search, filters, sorting, pagination; eligibility from the student's own college/branch/semester; rule-based recommendations; real deadline countdowns; save and self-reported application tracking (My Opportunities); reports; moderator/admin management with images | **Done** |
| 9 | Anonymous Zone: anonymous posts and comments (author kept internally, never shown), campus/college/community visibility, owner edit and soft delete, likes, reports with auto-flagging, personal-information checks, photo metadata removal, stricter rate limits on a shared Redis/memory store, moderator-only internal author lookup | **Done** |
| 10 | Campus Rankings and gamification: centralized, capped point rules from campus events, an auditable points ledger (award / reversal / reinstatement, one reward per event), levels, badges, streaks, leaderboards by campus/college/branch/semester for all time, this month and this week with deterministic tie-breaking, cached pages, profile "Campus Journey" | **Done** |
| 11 | Notifications and real-time campus activity: notification center, live Socket.IO delivery (signed-in sockets, per-student rooms), unread count, mark as read / all, delete, preferences, grouped repeats and no self-notifications, post/project/achievement/community/opportunity/gamification events, deadline reminders, anonymous activity that never reveals who acted | **Done** |
| 12 | Search & Discovery: one search for students, posts (campus + Anonymous Zone, never by author), projects, communities, opportunities and achievements; weighted text indexes + word-prefix + campus/type option matching; one rule-based relevance scorer; filters, sorting, pagination; debounced suggestions; private recent searches; visibility and college/branch scopes enforced on the server; per-student rate limits; navigation search box, /search page | **Done** |
| 13 | Trust & Safety: one rule-based moderation pipeline for posts, comments, projects, achievements, communities, opportunities and the Anonymous Zone (the original SpamDetector rules, duplicates, links, threats, abusive language, behaviour and account signals); statuses approved/flagged/restricted/removed with soft delete; fake-engagement and self-engagement protection; unified reports with duplicate and abuse protection; moderation cases and an audit log; progressive enforcement (warnings, temporary posting pauses, never automatic bans); rankings, search and notification integration; anonymity preserved; shared report form, owner notices, /safety guidelines; staff-only case API | **Done** |
| 14 | Recommendations: a transparent rule-based engine (no ML) for posts, projects, communities, opportunities (eligible and open only), students with similar interests and achievements; derived profile learned from likes, comments, communities, tracked opportunities, searches and clicks; central weights, freshness and diversity; plain reasons; trending kept apart; "Not interested" feedback; per-student cache with a fresh safety pass; anonymity, visibility and moderation respected; /discover, "Recommended for you" and "For you" on the home page | **Done** |
| 15 | Admin Control Center: a separate black/dark-purple/neon-violet console at `/admin` for moderators and admins; permission-based access enforced on every API request; command-center dashboard (real counts, weekly trends, platform activity, content creation, case status, risk radar, threat monitor, audit stream, real system status); moderation queue with filters and case review (approve, flag, restrict, remove, escalate, warn; confirmations and reasons for dangerous actions; one decision at a time); report review/resolve/reject/escalate; student management (search, suspend/block/activate/deactivate with session revocation, moderation and report history); content, community and opportunity management; 7/30/90-day analytics; audit log of every admin and moderation action; audited anonymous-author reveal; live admin alerts over Socket.IO; responsive (sidebar, tablet rail, phone drawer) | **Done** |
| 16 | Security and production hardening: strict startup checks for production secrets, origins and token lifetimes; API security headers (CSP, frame denial, HSTS in production) and no-store responses; request screening (prototype-pollution keys, NUL bytes, nesting); the same sign-in lock for unknown emails (no account enumeration) and suspicious sign-in events; refresh-token reuse, lockouts, limit hits and abuse patterns in the admin audit log (anonymity kept); upload name, double-extension and PDF active-content checks, malformed uploads 400; staff socket room re-checked against the database; log redaction; admin-only security status endpoint; security checklist and test suites | **Done** |
| + | Semester Roadmap (feature): "🎓 Semester Roadmap" button on the profile → `/profile/roadmap`; all eight semesters as an animated journey (keyboard tabs, direction-aware transitions, staggered milestones, reduced-motion support); seven career goals adapted to three branch tracks, changeable without losing progress; milestones with category, difficulty, effort, objectives, prerequisites, suggested projects and checked https resources; in-progress / complete / undo saved per student with duplicate-safe updates; server-calculated semester and overall progress, next milestone, skill mastery; semester completion celebration and badge; XP once per semester through the Phase 10 ledger and a Pathfinder badge | **Done** |
| + | Follows and direct messages (feature): Follow / Following / hover Unfollow on profiles, followers/following lists and student cards, with a spring-and-glow follow animation (sparks, drawn tick, rolling count, avatar ring; reduced-motion version) and optimistic updates rolled back on failure; counts read from unique relationships, active accounts only; paginated, searchable followers/following dialog; "started following you" notification once per follower; student-to-student blocks for follows and messages; one conversation per pair of students, inbox with unread counts, history pages, live delivery and read receipts over Socket.IO, retry-safe sends, participant-only access, rate limits, posting-pause and unsafe-link checks; account deletion removes it all | **Done** |

The order and numbering of upcoming phases are set at the start of each phase.

Post ownership rule: a student can always edit and delete **their own** posts and comments and can
never edit or delete anyone else's. The API checks the author against the signed-in session before
anything is uploaded or changed (403 "You can only modify your own post."), not only by hiding
buttons. Details: [docs/architecture/overview.md](docs/architecture/overview.md#authorization-and-ownership).
