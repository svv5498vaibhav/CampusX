/**
 * Search & Discovery: result types, sorts, limits, relevance weights and the words search ignores, in
 * one place. The frontend reads the types, sorts and filter choices through GET /api/v1/search/options;
 * icons and colours are its only own additions.
 */

export const SEARCH_TYPES = Object.freeze({
  ALL: 'all',
  STUDENTS: 'students',
  POSTS: 'posts',
  PROJECTS: 'projects',
  COMMUNITIES: 'communities',
  OPPORTUNITIES: 'opportunities',
  ACHIEVEMENTS: 'achievements',
});

/** The category tabs, in the order the search page shows them ("all" first). */
export const SEARCH_TABS = Object.freeze([
  { id: SEARCH_TYPES.ALL, label: 'All' },
  { id: SEARCH_TYPES.STUDENTS, label: 'Students' },
  { id: SEARCH_TYPES.POSTS, label: 'Posts' },
  { id: SEARCH_TYPES.PROJECTS, label: 'Projects' },
  { id: SEARCH_TYPES.COMMUNITIES, label: 'Communities' },
  { id: SEARCH_TYPES.OPPORTUNITIES, label: 'Opportunities' },
  { id: SEARCH_TYPES.ACHIEVEMENTS, label: 'Achievements' },
]);
export const CATEGORY_TYPE_IDS = Object.freeze(SEARCH_TABS.map((tab) => tab.id).filter((id) => id !== SEARCH_TYPES.ALL));

/**
 * Sorts each category offers. Only orderings backed by real fields: no "popular" where nothing is
 * counted. Relevance is always first and the default.
 */
export const SEARCH_SORTS = Object.freeze({
  students: [
    { id: 'relevance', label: 'Best match' },
    { id: 'name', label: 'Name (A–Z)' },
  ],
  posts: [
    { id: 'relevance', label: 'Best match' },
    { id: 'newest', label: 'Newest' },
    { id: 'popular', label: 'Most liked' },
  ],
  projects: [
    { id: 'relevance', label: 'Best match' },
    { id: 'newest', label: 'Newest' },
    { id: 'popular', label: 'Most liked' },
  ],
  communities: [
    { id: 'relevance', label: 'Best match' },
    { id: 'popular', label: 'Most members' },
    { id: 'newest', label: 'Newest' },
  ],
  opportunities: [
    { id: 'relevance', label: 'Best match' },
    { id: 'deadline', label: 'Deadline soon' },
    { id: 'newest', label: 'Newest' },
    { id: 'featured', label: 'Featured first' },
  ],
  achievements: [
    { id: 'relevance', label: 'Best match' },
    { id: 'newest', label: 'Most recent' },
  ],
});
export const SEARCH_SORT_IDS = Object.freeze(Object.fromEntries(Object.entries(SEARCH_SORTS).map(([type, sorts]) => [type, sorts.map((sort) => sort.id)])));

export const SEARCH_RULES = Object.freeze({
  query: { min: 2, max: 100 },
  // Only the first few words are used; the rest of a long query is ignored.
  maxWords: 6,
  // Global search shows a few of each kind, with "View all" for the rest.
  globalLimit: 5,
  pageSize: { default: 20, max: 30 },
  // Deep pages get expensive and are never useful: ask for a more specific search instead.
  maxPage: 50,
  // Filters that take free text (skills, tech stack).
  filterList: { max: 5, maxLength: 30 },
  suggestions: { total: 8, topics: 3, perCollection: 3, cacheSeconds: 30 },
  history: { keep: 20 },
  // Students whose names match, for "posts by <name>".
  authorMatches: 20,
  // A search that runs longer than this is stopped (answered with 503) instead of loading the database.
  timeoutMs: 4000,
});

/**
 * Relevance weights (services/searchRelevance.js). A rule-based score, not machine learning:
 *   exact     the name/title is exactly the query
 *   prefix    the name/title starts with the query
 *   word      per query word that starts a word of the name/title
 *   whole     per query word that is a whole word of it ("React App" beats "Reactor" for "react")
 *   tag       per query word matching a skill, tech, tag or organizer entry
 *   option    per matched type/category/college/branch/interest/semester ("hackathon", "CSE")
 *   author    a campus post by a student whose name matches
 *   keyword   per point of MongoDB's text-index score (title words weigh more than description words), capped
 *   recent    newer content gets a small boost; featured content too
 *   closed    opportunities that no longer take applications sink below open ones
 */
export const SCORE_WEIGHTS = Object.freeze({
  exact: 100,
  prefix: 60,
  word: 25,
  whole: 10,
  tag: 20,
  option: 15,
  author: 25,
  keyword: 4,
  keywordCap: 40,
  recent: [
    { days: 7, boost: 6 },
    { days: 30, boost: 3 },
  ],
  featured: 5,
  closed: -25,
});

/**
 * Text-index weights per collection: a word in a title counts far more than the same word in a long
 * description. MongoDB allows one text index per collection, named "search_text" here. Changing these
 * weights needs that index dropped and rebuilt (Mongoose won't replace an existing index).
 */
export const SEARCH_TEXT_WEIGHTS = Object.freeze({
  post: { content: 1 },
  anonymousPost: { title: 10, content: 2 },
  project: { title: 10, techStack: 8, shortDescription: 4, description: 1 },
  community: { name: 10, tags: 8, description: 2 },
  opportunity: { title: 10, skills: 8, tags: 8, organizer: 6, shortDescription: 3, description: 1 },
  achievement: { title: 10, skills: 8, organization: 6, eventName: 6, description: 1 },
});

/** Arguments for schema.index(): the weighted "search_text" text index for a collection. */
export const searchTextIndex = (weights) => [
  Object.fromEntries(Object.keys(weights).map((field) => [field, 'text'])),
  { name: 'search_text', weights, default_language: 'english' },
];

/** Common English words left out of a query ("projects with react" → "projects react"). */
export const STOP_WORDS = Object.freeze(
  new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'for', 'with', 'to', 'at', 'by', 'from', 'is', 'are', 'my', 'me', 'i', 'who', 'what', 'about', 'near', 'any', 'all']),
);

/** Words that describe what is being searched rather than the content, ignored by student search. */
export const STUDENT_NOISE_WORDS = Object.freeze(new Set(['student', 'students', 'people', 'person', 'profile', 'profiles', 'classmate', 'classmates']));

/** Words too common in college names to identify one ("engineering" would match every college). */
export const GENERIC_CAMPUS_WORDS = Object.freeze(
  new Set(['college', 'colleges', 'engineering', 'institute', 'technology', 'university', 'management', 'research', 'nagpur', 'national', 'science', 'studies']),
);

/** Rate limits per signed-in student (middleware/rateLimiter.js). Typing is debounced by the app. */
export const SEARCH_RATE_LIMITS = Object.freeze({
  search: { windowMinutes: 1, max: 60, message: "You're searching very quickly. Please wait a few seconds and try again." },
  suggestions: { windowMinutes: 1, max: 120, message: 'Suggestions are paused for a moment. Keep typing and press Enter to search.' },
  history: { windowMinutes: 15, max: 120, message: "You're changing your search history very quickly. Please try again shortly." },
});
