import { INTEREST_MATCHES } from '../data/opportunityOptions.js';

/**
 * Recommendations (Phase 14): every rule, weight and limit in one place. services/recommendationService.js
 * and its helpers read them from here, so tuning CampusX's discovery never means hunting through code.
 *
 * The engine is rule-based and deterministic: the same student, content and time give the same order.
 * There is no machine learning, no external AI and no embeddings. Scores only order items; students see
 * plain reasons ("Because you're interested in AI / ML"), never numbers or weights.
 */

// ----------------------------------------------------------------------------- types

export const RECOMMENDATION_TYPES = Object.freeze({
  POSTS: 'posts',
  PROJECTS: 'projects',
  COMMUNITIES: 'communities',
  OPPORTUNITIES: 'opportunities',
  STUDENTS: 'students',
  ACHIEVEMENTS: 'achievements',
  // Trending on campus: recent engagement, not personal fit (kept apart from "For you").
  CAMPUS_ACTIVITY: 'campusActivity',
});

/** Types with their own list (GET /recommendations/<type>), in the order discovery shows them. */
export const LIST_TYPES = Object.freeze([
  RECOMMENDATION_TYPES.OPPORTUNITIES,
  RECOMMENDATION_TYPES.PROJECTS,
  RECOMMENDATION_TYPES.COMMUNITIES,
  RECOMMENDATION_TYPES.STUDENTS,
  RECOMMENDATION_TYPES.ACHIEVEMENTS,
  RECOMMENDATION_TYPES.POSTS,
]);

/**
 * What a recommended item is stored as in feedback and interactions. Posts can be campus posts or (in
 * campus activity only) Anonymous Zone posts; the server works out which, never the client.
 */
export const TARGET_TYPES = Object.freeze({
  posts: 'post',
  projects: 'project',
  communities: 'community',
  opportunities: 'opportunity',
  students: 'student',
  achievements: 'achievement',
});
export const ANONYMOUS_TARGET_TYPE = 'anonymousPost';
export const TARGET_TYPE_IDS = Object.freeze([...Object.values(TARGET_TYPES), ANONYMOUS_TARGET_TYPE]);

/** "Not interested" also shows fewer similar things for a while; "dismiss" only hides that one item. */
export const FEEDBACK_ACTIONS = Object.freeze({ DISMISS: 'dismiss', NOT_INTERESTED: 'not_interested' });
export const FEEDBACK_ACTION_IDS = Object.freeze(Object.values(FEEDBACK_ACTIONS));

/** Light, optional analytics: a recommendation was shown, or opened. Dismissals live in feedback. */
export const INTERACTION_ACTIONS = Object.freeze({ IMPRESSION: 'impression', CLICK: 'click' });
export const INTERACTION_ACTION_IDS = Object.freeze(Object.values(INTERACTION_ACTIONS));

// ----------------------------------------------------------------------------- weights

/**
 * The most each signal can add to an item's score. Partial matches add part of it (2 of 3 skills = 2/3
 * of SKILL_MATCH). Penalties are subtracted. Campus matches (college, branch, semester) are ranking
 * signals only: students still see content from other campuses.
 */
export const RECOMMENDATION_WEIGHTS = Object.freeze({
  INTEREST_MATCH: 30, // one of the student's interests (profile, or learned from what they do)
  SKILL_MATCH: 30, // skills or tech in common
  COLLEGE_MATCH: 15,
  BRANCH_MATCH: 15,
  SEMESTER_MATCH: 10,
  RECENT_ACTIVITY: 10, // like what the student liked, joined, saved, searched or opened recently
  POPULARITY: 5, // engagement, log-scaled, so popular things never drown out relevant ones
  FRESHNESS: 10, // fades with age (half-life per type, below)
  COMMUNITY_RELEVANCE: 15, // a post from one of the student's communities; their own campus/branch community
  OPPORTUNITY_RELEVANCE: 20, // an opportunity type that fits their interests or the ones they track
  QUALITY: 5, // a verified achievement, a project with screenshots or links, an official community
  DEADLINE_SOON: 10, // an opportunity closing soon (it fades in over DEADLINE_RULES.soonDays)
  NOT_INTERESTED_PENALTY: 25, // like something the student recently said "Not interested" to
  IGNORED_PENALTY: 10, // shown many times, never opened
});

/** How many matches earn the full weight of a signal. */
export const MATCH_RULES = Object.freeze({
  skillsForFull: 3,
  interestsForFull: 2,
  learnedForFull: 3,
  // Engagement (see each type's popularity in services/recommendationScoring.js) worth the full POPULARITY.
  popularityForFull: 50,
  // Inside free text (post text, titles), words shorter than this aren't matched ("c", "r"), nor are
  // everyday words that are also skills ("go", "it"). Exact skills, tech and tags always match.
  minKeywordLength: 2,
  ambiguousWords: Object.freeze(['go', 'it']),
  // Personalized lists only keep items with at least this much profile fit; the rest can still fill
  // exploration slots and new students' fallback.
  minProfileScore: 10,
});

/** Freshness half-life in days, per type: after this long an item keeps half its FRESHNESS weight. */
export const FRESHNESS_RULES = Object.freeze({
  halfLifeDays: Object.freeze({ posts: 3, projects: 30, communities: 120, opportunities: 14, achievements: 60, students: null }),
  // "New on CampusX" is said of things at most this old.
  newForDays: 7,
});

export const DEADLINE_RULES = Object.freeze({ soonDays: 14 });

/**
 * Diversity: each further item that shares a key with ones already picked keeps `decay` of its score per
 * repeat, and no list holds more than `maxPerKey` items with the same key. Every `exploreEvery`-th slot
 * goes to the best item that isn't a profile match (new or popular campus content), so a student's
 * lists never close in on a single topic.
 */
export const DIVERSITY_RULES = Object.freeze({
  decay: 0.7,
  keys: Object.freeze({
    posts: ['type', 'author', 'community'],
    projects: ['category', 'owner'],
    communities: ['type'],
    opportunities: ['type', 'organizer'],
    students: ['branch'],
    achievements: ['type', 'owner'],
  }),
  maxPerKey: Object.freeze({ type: 4, category: 3, author: 2, owner: 2, organizer: 2, community: 3, branch: 5 }),
  exploreEvery: 4,
  // "For you" mixes types: at most this many of one type in a row of mixed picks.
  mixPerType: 2,
});

// ----------------------------------------------------------------------------- retrieval and limits

/** At most this many candidates per pool are read from the database before scoring (never everything). */
export const CANDIDATE_LIMITS = Object.freeze({
  posts: 60,
  projects: 60,
  communities: 50,
  opportunities: 80,
  students: 60,
  achievements: 50,
  trending: 150,
});

/** How far back candidates go (days). Opportunities instead must still be open. */
export const CANDIDATE_WINDOWS = Object.freeze({ posts: 30, trendingPosts: 7, trendingProjects: 30, achievements: 730 });

export const RESULT_RULES = Object.freeze({
  // Ranked items kept per type (in the cache); lists are pages of these.
  ranked: 30,
  pageSize: Object.freeze({ default: 10, max: 20 }),
  section: 8, // per section on /discover
  home: Object.freeze({ forYou: 8, section: 4, trending: 5 }),
  trending: Object.freeze({ posts: 5, discussions: 3, projects: 4, minEngagement: 1 }),
  maxReasons: 2,
});

/**
 * Trending on campus: recent engagement (likes, and comments counted double) divided by
 * (age in hours + 2) ^ gravity, so a burst of activity today beats a pile of likes from last month.
 * Posts from the student's own college get `campusBoost`.
 */
export const TRENDING_RULES = Object.freeze({ gravity: 1.5, campusBoost: 1.5, commentWeight: 2 });

// ----------------------------------------------------------------------------- learning and feedback

/**
 * The derived profile (models/RecommendationProfile.js) is rebuilt from the student's activity when it is
 * older than `staleAfterMinutes` or something important changed. It keeps the newest `keepSignals` likes,
 * comments and recommendation clicks; only those from the last `windowDays` count.
 */
export const PROFILE_RULES = Object.freeze({
  staleAfterMinutes: 30,
  keepSignals: 100,
  windowDays: 60,
  // A student with fewer signals than this (and no projects, communities or tracked opportunities) is "new".
  newStudentSignals: 3,
  recentSearches: 10,
  ownItems: 20,
  trackedOpportunities: 50,
});

/**
 * Feedback: a dismissed item stays hidden for `hideForDays` (the record then expires on its own).
 * "Not interested" also lowers similar items for `similarForDays`.
 */
export const FEEDBACK_RULES = Object.freeze({ hideForDays: 90, similarForDays: 14, readLimit: 500 });

/** Interactions expire after `keepDays`. Shown `ignoredAfter` times and never opened = ignored. */
export const INTERACTION_RULES = Object.freeze({ keepDays: 30, ignoredAfter: 5, maxBatch: 30, readLimit: 1000 });

/** Ranked lists are cached per student for a few minutes (Redis when connected, memory otherwise). */
export const CACHE_RULES = Object.freeze({ ttlSeconds: 10 * 60, keyPrefix: 'recommendations:v1' });

/** Requests per student (429 above them). Normal browsing stays far below. */
export const RECOMMENDATION_RATE_LIMITS = Object.freeze({
  read: Object.freeze({ windowMinutes: 1, max: 60, message: 'You’re refreshing recommendations very quickly. Please wait a moment and try again.' }),
  feedback: Object.freeze({ windowMinutes: 10, max: 60, message: 'That’s a lot of changes at once. Please wait a few minutes and try again.' }),
  interactions: Object.freeze({ windowMinutes: 1, max: 30, message: 'Too many updates at once. Please wait a moment.' }),
});

// ----------------------------------------------------------------------------- interests

/**
 * What each onboarding interest looks like across CampusX. Keywords (matched against skills, tech, tags
 * and post text) and opportunity types come from data/opportunityOptions.js, so opportunities and the
 * rest of discovery agree on what "AI / ML" means.
 */
const AREAS = {
  'web-development': { projectCategories: ['web'] },
  'app-development': { projectCategories: ['mobile'] },
  'ai-ml': { projectCategories: ['ai-ml'], opportunityTypes: ['research'] },
  'data-science': { projectCategories: ['data-science', 'ai-ml'], opportunityTypes: ['research'] },
  'cyber-security': { projectCategories: ['cybersecurity'] },
  'cloud-computing': {},
  'game-development': { projectCategories: ['game'] },
  robotics: { projectCategories: ['iot', 'hardware'], opportunityTypes: ['project'] },
  'competitive-programming': { achievementTypes: ['competition'] },
  dsa: { achievementTypes: ['competition'] },
  hackathons: { achievementTypes: ['hackathon'], postTypes: ['event'] },
  'open-source': { achievementTypes: ['open-source'] },
  'ui-ux-design': {},
  photography: { postTypes: ['photo'] },
  'video-editing': { postTypes: ['video'] },
  'content-creation': { postTypes: ['photo', 'video'] },
  startups: { postTypes: ['idea'] },
  entrepreneurship: { postTypes: ['idea'] },
  sports: { postTypes: ['event'] },
  music: { postTypes: ['event'] },
};

export const INTEREST_SIGNALS = Object.freeze(
  Object.fromEntries(
    Object.entries(AREAS).map(([id, area]) => [
      id,
      Object.freeze({
        keywords: Object.freeze([...(INTEREST_MATCHES[id]?.keywords ?? [])]),
        opportunityTypes: Object.freeze([...new Set([...(INTEREST_MATCHES[id]?.types ?? []), ...(area.opportunityTypes ?? [])])]),
        projectCategories: Object.freeze(area.projectCategories ?? []),
        achievementTypes: Object.freeze(area.achievementTypes ?? []),
        postTypes: Object.freeze(area.postTypes ?? []),
      }),
    ]),
  ),
);

// ----------------------------------------------------------------------------- reasons

/** Everything a student reads about why something was recommended. No scores, no weights, no "AI". */
export const REASONS = Object.freeze({
  interest: (name) => `Because you're interested in ${name}`,
  skills: (list) => `Matches your ${list} skills`,
  activity: (noun) => `Similar to ${noun} you've explored`,
  college: 'From your college',
  collegeOpportunity: 'For students at your college',
  campusCommunity: 'Your campus community',
  branchCommunity: 'Your branch community',
  sameBranch: (branch) => `Also in ${branch}`,
  branch: (branch) => `For ${branch} students`,
  branchPopular: (branch) => `Popular among ${branch} students`,
  semester: 'Relevant to your semester',
  sameClass: 'In your branch and semester',
  community: (name) => `From ${name}, one of your communities`,
  deadline: (days) => (days <= 1 ? 'Deadline is within a day' : `Deadline in ${days} days`),
  verified: 'Verified achievement',
  fresh: 'New on CampusX',
  popular: 'Popular on your campus',
  explore: 'Something different to explore',
  trending: 'Trending on your campus',
  trendingAnonymous: 'Trending anonymous campus discussion',
  sharedInterests: (list) => `Also into ${list}`,
  sharedSkills: (list) => `Also knows ${list}`,
});

/**
 * When two reasons count the same, the more specific one is shown first ("From React Builders, one of
 * your communities" before "From your college").
 */
export const REASON_ORDER = Object.freeze(['community', 'campusCommunity', 'skills', 'interest', 'activity', 'deadline', 'verified', 'semester', 'branch', 'college']);

/** Shown with the lists, about the student as a whole. */
export const PERSONALIZATION_MESSAGES = Object.freeze({
  newStudent: "You're new to CampusX. Here are some things to explore.",
  empty: 'Nothing new to recommend right now.',
});

/** Nouns for "Similar to … you've explored". */
export const ACTIVITY_NOUNS = Object.freeze({
  posts: 'posts',
  projects: 'projects',
  communities: 'communities',
  opportunities: 'opportunities',
  students: 'students',
  achievements: 'achievements',
});
