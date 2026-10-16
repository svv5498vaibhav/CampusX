/**
 * Campus Rankings and gamification: every point rule, cap, level and badge in one place. The services
 * read only from here, and GET /api/v1/gamification/rules shows the same rules to students, so the
 * system stays transparent. No machine learning: points come from these rules alone.
 */

/*
 * Day, week and month boundaries (caps, streaks, weekly/monthly leaderboards) use one time zone,
 * GAMIFICATION_TIMEZONE (config/env.js, default Asia/Kolkata). Weeks start on Monday 00:00 and months
 * on the 1st, in that time zone. See utils/periods.js.
 */

/**
 * What earns points. `own: false` marks points earned from other students' reactions (they don't keep
 * a streak going). `caps` limit how many awards of that kind count per day, per week or ever, so
 * repeating an action can't farm points. Content must also pass the quality rules below.
 */
export const POINT_RULES = Object.freeze({
  ONBOARDING_COMPLETED: { points: 20, label: 'Completed onboarding', own: true },
  PROFILE_COMPLETED: { points: 20, label: 'Completed your profile', own: true },
  POST_CREATED: { points: 5, label: 'Shared a campus post', own: true, caps: { perDay: 3 } },
  POST_LIKE_RECEIVED: { points: 2, label: 'Your post got a like', own: false, caps: { perDay: 25 } },
  COMMENT_RECEIVED: { points: 3, label: 'A student commented on your post', own: false, caps: { perDay: 10 } },
  PROJECT_CREATED: { points: 20, label: 'Added a project', own: true, caps: { perDay: 2 } },
  PROJECT_COMPLETED: { points: 15, label: 'Completed a project', own: true, caps: { perDay: 2 } },
  ACHIEVEMENT_ADDED: { points: 10, label: 'Added an achievement', own: true, caps: { perDay: 3 } },
  ACHIEVEMENT_VERIFIED: { points: 50, label: 'Achievement verified by CampusX', own: true },
  COMMUNITY_JOINED: { points: 5, label: 'Joined a community', own: true, caps: { perDay: 3, lifetime: 10 } },
  COMMUNITY_CREATED: { points: 15, label: 'Created a community', own: true, caps: { perWeek: 2 } },
  OPPORTUNITY_SAVED: { points: 2, label: 'Saved an opportunity', own: true, caps: { perDay: 5 } },
  OPPORTUNITY_APPLIED: { points: 5, label: 'Applied to an opportunity', own: true, caps: { perDay: 3 } },
  // Once per semester number, ever (at most 8 awards), however often it is completed, undone or redone.
  ROADMAP_SEMESTER_COMPLETED: { points: 10, label: 'Completed a semester on your roadmap', own: true },
});
export const POINT_ACTIONS = Object.freeze(Object.keys(POINT_RULES));

/** What counts as "meaningful" content. */
export const QUALITY_RULES = Object.freeze({
  // A post earns points with this much text, or with a photo/video.
  postMinLength: 20,
  // A comment counts towards the post author's points with this much text.
  commentMinLength: 10,
});

/** Things that never earn points, shown on the rules page. */
export const NOT_REWARDED = Object.freeze([
  'Liking or commenting on your own posts',
  'Giving likes (only receiving them counts)',
  'More than one comment per student on the same post',
  'Anything in the Anonymous Zone, so points can never hint at who posted there',
  'Private projects and achievements (until you share them)',
  'Deleted, archived or moderated content',
  'Single roadmap milestones (a whole semester of your roadmap counts, once per semester)',
]);

/**
 * Levels by total points. The backend is the only place a level is calculated
 * (services/gamificationService.js calculateLevel).
 */
export const LEVELS = Object.freeze([
  { level: 1, minPoints: 0, name: 'Fresher' },
  { level: 2, minPoints: 100, name: 'Explorer' },
  { level: 3, minPoints: 250, name: 'Contributor' },
  { level: 4, minPoints: 500, name: 'Builder' },
  { level: 5, minPoints: 1000, name: 'Achiever' },
  { level: 6, minPoints: 2000, name: 'Mentor' },
  { level: 7, minPoints: 3500, name: 'Trailblazer' },
  { level: 8, minPoints: 5000, name: 'Campus Star' },
  { level: 9, minPoints: 7500, name: 'Legend' },
  { level: 10, minPoints: 10000, name: 'Campus Champion' },
]);

/**
 * Badges. Requirements are checked on the server only:
 *   action    at least `value` current awards of that action
 *   interactions  at least `value` likes + comments received (current awards)
 *   level     reach level `value`
 *   points    reach `value` total points
 *   streak    a streak of `value` days of your own activity
 * A badge is earned once and kept. `icon` is a name the frontend maps to an icon.
 */
export const BADGES = Object.freeze([
  { key: 'FIRST_STEP', name: 'First Step', description: 'Completed your campus onboarding', icon: 'footprints', requirementType: 'action', requirement: 'ONBOARDING_COMPLETED', value: 1, rarity: 'common' },
  { key: 'CAMPUS_IDENTITY', name: 'Campus Identity', description: 'Completed your CampusX profile', icon: 'id-card', requirementType: 'action', requirement: 'PROFILE_COMPLETED', value: 1, rarity: 'common' },
  { key: 'CAMPUS_CREATOR', name: 'Campus Creator', description: 'Shared your first campus post', icon: 'pen-line', requirementType: 'action', requirement: 'POST_CREATED', value: 1, rarity: 'common' },
  { key: 'PROJECT_BUILDER', name: 'Project Builder', description: 'Added your first project', icon: 'hammer', requirementType: 'action', requirement: 'PROJECT_CREATED', value: 1, rarity: 'common' },
  { key: 'ACHIEVER', name: 'Achiever', description: 'Added your first achievement', icon: 'award', requirementType: 'action', requirement: 'ACHIEVEMENT_ADDED', value: 1, rarity: 'common' },
  { key: 'VERIFIED_ACHIEVER', name: 'Verified Achiever', description: 'Had an achievement verified by CampusX', icon: 'badge-check', requirementType: 'action', requirement: 'ACHIEVEMENT_VERIFIED', value: 1, rarity: 'rare' },
  { key: 'COMMUNITY_MEMBER', name: 'Community Member', description: 'Joined your first community', icon: 'users', requirementType: 'action', requirement: 'COMMUNITY_JOINED', value: 1, rarity: 'common' },
  { key: 'COMMUNITY_BUILDER', name: 'Community Builder', description: 'Created a community', icon: 'sprout', requirementType: 'action', requirement: 'COMMUNITY_CREATED', value: 1, rarity: 'uncommon' },
  { key: 'GO_GETTER', name: 'Go-Getter', description: 'Applied to your first opportunity', icon: 'rocket', requirementType: 'action', requirement: 'OPPORTUNITY_APPLIED', value: 1, rarity: 'common' },
  { key: 'PATHFINDER', name: 'Pathfinder', description: 'Completed a semester on your Semester Roadmap', icon: 'route', requirementType: 'action', requirement: 'ROADMAP_SEMESTER_COMPLETED', value: 1, rarity: 'common' },
  { key: 'HELPFUL_STUDENT', name: 'Helpful Student', description: 'Received 25 likes and comments from other students', icon: 'heart-handshake', requirementType: 'interactions', value: 25, rarity: 'uncommon' },
  { key: 'ON_A_ROLL', name: 'On a Roll', description: 'Active on campus 7 days in a row', icon: 'flame', requirementType: 'streak', value: 7, rarity: 'uncommon' },
  { key: 'RISING_STAR', name: 'Rising Star', description: 'Reached level 3', icon: 'star', requirementType: 'level', value: 3, rarity: 'uncommon' },
  { key: 'CAMPUS_CHAMPION', name: 'Campus Champion', description: 'Earned 2,000 points', icon: 'trophy', requirementType: 'points', value: 2000, rarity: 'epic' },
]);
export const BADGE_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic']);

/**
 * Leaderboards. Scopes use the signed-in student's own profile: "branch" means their branch at their
 * college, "semester" their semester in that branch at that college.
 */
export const RANKING_SCOPES = Object.freeze([
  { id: 'overall', label: 'Campus' },
  { id: 'college', label: 'College' },
  { id: 'branch', label: 'Branch' },
  { id: 'semester', label: 'Semester' },
]);
export const RANKING_SCOPE_IDS = Object.freeze(RANKING_SCOPES.map((scope) => scope.id));
export const RANKING_PERIODS = Object.freeze([
  { id: 'all', label: 'All Time' },
  { id: 'month', label: 'This Month' },
  { id: 'week', label: 'This Week' },
]);
export const RANKING_PERIOD_IDS = Object.freeze(RANKING_PERIODS.map((period) => period.id));

/**
 * Tie-breaking, in order (never random): more points; then more verified achievements; then whoever
 * reached their current score first; then the older account id, so every position is stable.
 */
export const TIE_BREAKERS = Object.freeze(['points', 'verifiedAchievements', 'reachedScoreFirst', 'accountId']);

/**
 * Ranking milestones (turned into "Ranking update" notifications). After a student gains points, their
 * all-time rank on CampusX and at their college is checked: reaching the top 10, top 3 or #1 counts
 * once, and only when it beats the best milestone they ever reached there, so ranks going up and down
 * never cause a stream of messages. A milestone needs more ranked students than its size (being in
 * the "top 10" of 6 students doesn't count) and at least `minStudents` students on that leaderboard.
 */
export const RANK_MILESTONES = Object.freeze({ scopes: ['overall', 'college'], tiers: [10, 3, 1], minStudents: 5 });

/**
 * Elite rank tokens: the Gold, Silver and Bronze tokens belong to whoever holds #1, #2 and #3 on ONE
 * leaderboard, the CampusX-wide all-time ranking (`scope`), using exactly its rules (eligible students with
 * points, TIE_BREAKERS). They are never chosen, claimed or changed by a request: services/eliteRankService.js
 * takes a ranking snapshot on the server after points change (and every `refreshEveryMinutes` as a safety
 * net) and moves the tokens when the top three changed. With fewer than three ranked students the lower
 * tokens stay unclaimed. Every change is kept as history (the Hall of Fame).
 *
 * The overall #1 and top-3 ranking milestones above are still recorded, but announced by the token
 * notification instead, so reaching #1 isn't announced twice.
 */
export const ELITE_TIERS = Object.freeze([
  { id: 'gold', rank: 1, title: 'Golden Champion', token: 'Golden Token', short: 'Gold', emblem: 'crown' },
  { id: 'silver', rank: 2, title: 'Silver Elite', token: 'Silver Token', short: 'Silver', emblem: 'shield' },
  { id: 'bronze', rank: 3, title: 'Bronze Elite', token: 'Bronze Token', short: 'Bronze', emblem: 'shield' },
]);
export const ELITE_TIER_IDS = Object.freeze(ELITE_TIERS.map((tier) => tier.id));

export const ELITE_RANK_RULES = Object.freeze({
  scope: 'overall',
  period: 'all',
  // Point changes that land within this window are settled by one snapshot.
  refreshDelayMs: 1200,
  // The safety net: a snapshot this often even without point changes (suspended or deleted accounts,
  // other API instances, changes made directly in the database).
  refreshEveryMinutes: 5,
  // How long one API instance reuses the current holders before reading them again.
  holdersCacheSeconds: 5,
  hallOfFame: { previousHolders: 10, records: 5, transfers: { default: 15, max: 50 } },
});

/**
 * Why a token moved (stored on each transfer and reign):
 *   first-snapshot  the first time CampusX handed out the tokens
 *   ranking         the leaderboard changed (someone overtook, or a holder moved up or down)
 *   left-rankings   the holder left the rankings (account suspended or closed, or no points any more)
 */
export const ELITE_TRANSFER_REASONS = Object.freeze(['first-snapshot', 'ranking', 'left-rankings']);

export const GAMIFICATION_RULES = Object.freeze({
  leaderboardPageSize: { default: 20, max: 50 },
  transactionPageSize: { default: 20, max: 50 },
  // Leaderboard pages are cached this long (and dropped whenever points change).
  cacheSeconds: 60,
});
