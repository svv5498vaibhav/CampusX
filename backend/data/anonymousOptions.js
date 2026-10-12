/**
 * Anonymous Zone: categories, visibility, statuses, report reasons, limits and rate limits in one place.
 * The frontend reads them through GET /api/v1/anonymous/options; icons and colours are its only own
 * additions. Rate limits are read from here by middleware/rateLimiter.js (nowhere else).
 */

/** What every anonymous post and comment shows instead of a name. No numbered or fake names. */
export const ANONYMOUS_AUTHOR_LABEL = 'Anonymous Student';

export const ANONYMOUS_CATEGORIES = Object.freeze([
  { id: 'feedback', label: 'Feedback', plural: 'Feedback' },
  { id: 'question', label: 'Question', plural: 'Questions' },
  { id: 'suggestion', label: 'Suggestion', plural: 'Suggestions' },
  { id: 'academic', label: 'Academic', plural: 'Academic' },
  { id: 'campus-life', label: 'Campus life', plural: 'Campus Life' },
  { id: 'hostel', label: 'Hostel', plural: 'Hostel' },
  { id: 'canteen', label: 'Canteen', plural: 'Canteen' },
  { id: 'library', label: 'Library', plural: 'Library' },
  { id: 'event', label: 'Event', plural: 'Events' },
  { id: 'other', label: 'Other', plural: 'Other' },
]);
export const ANONYMOUS_CATEGORY_IDS = Object.freeze(ANONYMOUS_CATEGORIES.map((category) => category.id));

// Filter chips: "All", then the categories in the spec's order.
const CHIP_ORDER = ['feedback', 'question', 'suggestion', 'campus-life', 'academic', 'hostel', 'canteen', 'library', 'event', 'other'];
export const ANONYMOUS_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  ...CHIP_ORDER.map((id) => ({ id, label: ANONYMOUS_CATEGORIES.find((category) => category.id === id).plural })),
]);

/**
 * Who can read an anonymous post. The server checks every rule against the reader's own profile and
 * memberships (req.user), never against request data.
 *   campus     every signed-in CampusX student
 *   college    students at the author's college (stored by the server, never shown)
 *   community  active members of the post's community
 */
export const ANONYMOUS_VISIBILITY = Object.freeze([
  { id: 'college', label: 'My college', description: 'Only students at your college' },
  { id: 'campus', label: 'All of CampusX', description: 'Every signed-in CampusX student' },
  { id: 'community', label: 'A community', description: 'Only members of one of your communities' },
]);
export const ANONYMOUS_VISIBILITY_IDS = Object.freeze(ANONYMOUS_VISIBILITY.map((option) => option.id));
export const DEFAULT_ANONYMOUS_VISIBILITY = 'college';

/** active · hidden (by moderators, later phase) · deleted (by the author: kept for safety reviews, never shown). */
export const ANONYMOUS_STATUSES = Object.freeze(['active', 'hidden', 'deleted']);
/** Moderation statuses other students can see (same rule as campus posts). */
export const LISTED_MODERATION_STATUSES = Object.freeze(['approved', 'flagged']);

export const ANONYMOUS_SORTS = Object.freeze([
  { id: 'recent', label: 'Most recent' },
  { id: 'discussed', label: 'Most discussed' },
]);
export const ANONYMOUS_SORT_IDS = Object.freeze(ANONYMOUS_SORTS.map((sort) => sort.id));

export const ANONYMOUS_REPORT_REASONS = Object.freeze([
  { id: 'harassment', label: 'Harassment' },
  { id: 'abusive-language', label: 'Abusive language' },
  { id: 'spam', label: 'Spam' },
  { id: 'threat', label: 'Threat' },
  { id: 'personal-info', label: 'Personal information' },
  { id: 'misleading', label: 'False or misleading information' },
  { id: 'hate', label: 'Hate or targeted abuse' },
  { id: 'other', label: 'Other' },
]);
export const ANONYMOUS_REPORT_REASON_IDS = Object.freeze(ANONYMOUS_REPORT_REASONS.map((reason) => reason.id));

export const ANONYMOUS_RULES = Object.freeze({
  title: { min: 3, max: 150 },
  content: { min: 10, max: 5000 },
  comment: { min: 1, max: 1000 },
  reportDetails: { max: 500 },
  media: { maxImages: 4 },
  pageSize: { default: 10, max: 20 },
  commentPageSize: { default: 20, max: 50 },
  // Reports from this many different students mark a post or comment "flagged" for the moderation
  // team. It stays visible; only moderators (later phase) hide or remove content.
  flagAfterReports: 3,
});

/**
 * Stricter limits for the Anonymous Zone, per signed-in student. Counted on Redis when it is connected
 * (shared by every API instance), otherwise in this process's memory. Only successful requests count.
 */
export const ANONYMOUS_RATE_LIMITS = Object.freeze({
  posts: { windowMinutes: 10, max: 5, message: "You've shared a lot anonymously in the last few minutes. Please wait a little before posting again." },
  comments: { windowMinutes: 10, max: 20, message: "You're commenting very quickly. Please wait a few minutes and try again." },
  reports: { windowMinutes: 60, max: 10, message: "You've sent a lot of reports in the last hour. Please try again later." },
});
