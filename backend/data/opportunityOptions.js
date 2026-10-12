/**
 * Opportunities (internships, hackathons, scholarships, workshops, campus events, ...): types, modes,
 * statuses, tracking statuses, filters, report reasons and limits in one place. The frontend reads them
 * through GET /api/v1/opportunities/options; icons and colours are its only own additions.
 */

export const OPPORTUNITY_TYPES = Object.freeze([
  { id: 'internship', label: 'Internship', plural: 'Internships' },
  { id: 'hackathon', label: 'Hackathon', plural: 'Hackathons' },
  { id: 'competition', label: 'Coding competition', plural: 'Competitions' },
  { id: 'scholarship', label: 'Scholarship', plural: 'Scholarships' },
  { id: 'fellowship', label: 'Fellowship', plural: 'Fellowships' },
  { id: 'workshop', label: 'Workshop', plural: 'Workshops' },
  { id: 'seminar', label: 'Seminar', plural: 'Seminars' },
  { id: 'event', label: 'Event', plural: 'Events' },
  { id: 'research', label: 'Research', plural: 'Research' },
  { id: 'project', label: 'Project competition', plural: 'Project competitions' },
  { id: 'other', label: 'Student program', plural: 'Other programs' },
]);
export const OPPORTUNITY_TYPE_IDS = Object.freeze(OPPORTUNITY_TYPES.map((type) => type.id));

// Discovery chips: "All", then every type (the spec's order first).
const CHIP_ORDER = ['internship', 'hackathon', 'competition', 'scholarship', 'workshop', 'event', 'fellowship', 'seminar', 'research', 'project', 'other'];
export const OPPORTUNITY_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  ...CHIP_ORDER.map((id) => ({ id, label: OPPORTUNITY_TYPES.find((type) => type.id === id).plural })),
]);

export const OPPORTUNITY_MODES = Object.freeze([
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'Offline' },
  { id: 'hybrid', label: 'Hybrid' },
]);
export const OPPORTUNITY_MODE_IDS = Object.freeze(OPPORTUNITY_MODES.map((mode) => mode.id));

/**
 * draft      being prepared; only CampusX moderators and admins see it
 * published  listed for students
 * closed     still listed, but applications are over (also shown for any opportunity whose
 *            application deadline has passed: that is worked out when reading, never written back)
 * archived   taken out of discovery
 */
export const OPPORTUNITY_STATUSES = Object.freeze([
  { id: 'draft', label: 'Draft' },
  { id: 'published', label: 'Published' },
  { id: 'closed', label: 'Closed' },
  { id: 'archived', label: 'Archived' },
]);
export const OPPORTUNITY_STATUS_IDS = Object.freeze(OPPORTUNITY_STATUSES.map((status) => status.id));
/** Statuses students can see. */
export const LISTED_OPPORTUNITY_STATUSES = Object.freeze(['published', 'closed']);

/**
 * Who can see an opportunity. Every CampusX page needs a sign-in today, so "public" and "campus" reach
 * the same students; only "public" ones may ever appear on signed-out pages if CampusX adds them.
 * "college" limits it to students whose profile college is one of its eligible colleges.
 */
export const OPPORTUNITY_VISIBILITY = Object.freeze([
  { id: 'public', label: 'Everyone', description: 'Anyone on CampusX (and public pages, if CampusX adds them)' },
  { id: 'campus', label: 'CampusX students', description: 'Any signed-in CampusX student' },
  { id: 'college', label: 'Eligible colleges only', description: 'Only students at the colleges listed under eligibility' },
]);
export const OPPORTUNITY_VISIBILITY_IDS = Object.freeze(OPPORTUNITY_VISIBILITY.map((option) => option.id));

/**
 * A student's own tracking of an opportunity. CampusX never knows whether someone really applied on
 * an external site: every status is set by the student, is private to them, and is never shown to
 * anyone else or treated as verified. The outcome statuses can only follow "applied".
 */
export const TRACKING_STATUSES = Object.freeze([
  { id: 'saved', label: 'Saved' },
  { id: 'interested', label: 'Interested' },
  { id: 'applied', label: 'Applied' },
  { id: 'shortlisted', label: 'Shortlisted', afterApplying: true },
  { id: 'selected', label: 'Selected', afterApplying: true },
  { id: 'rejected', label: 'Rejected', afterApplying: true },
  { id: 'withdrawn', label: 'Withdrawn', afterApplying: true },
]);
export const TRACKING_STATUS_IDS = Object.freeze(TRACKING_STATUSES.map((status) => status.id));
export const AFTER_APPLYING_STATUSES = Object.freeze(TRACKING_STATUSES.filter((status) => status.afterApplying).map((status) => status.id));
/** Statuses that only make sense while an opportunity is still open. */
export const BEFORE_APPLYING_STATUSES = Object.freeze(['saved', 'interested']);

export const DEADLINE_FILTERS = Object.freeze([
  { id: 'any', label: 'Any deadline' },
  { id: 'open', label: 'Still open' },
  { id: '7d', label: 'Next 7 days' },
  { id: '30d', label: 'Next 30 days' },
]);
export const DEADLINE_FILTER_IDS = Object.freeze(DEADLINE_FILTERS.map((filter) => filter.id));

/** "deadline" (the default) lists open opportunities first, nearest deadline first. No ranking scores. */
export const OPPORTUNITY_SORTS = Object.freeze([
  { id: 'deadline', label: 'Deadline soon' },
  { id: 'latest', label: 'Latest' },
  { id: 'popular', label: 'Most viewed' },
]);
export const OPPORTUNITY_SORT_IDS = Object.freeze(OPPORTUNITY_SORTS.map((sort) => sort.id));

export const OPPORTUNITY_REPORT_REASONS = Object.freeze([
  { id: 'expired', label: 'Expired' },
  { id: 'wrong-info', label: 'Wrong information' },
  { id: 'broken-link', label: 'Broken application link' },
  { id: 'spam', label: 'Spam' },
  { id: 'misleading', label: 'Misleading' },
  { id: 'other', label: 'Other' },
]);
export const OPPORTUNITY_REPORT_REASON_IDS = Object.freeze(OPPORTUNITY_REPORT_REASONS.map((reason) => reason.id));

export const OPPORTUNITY_RULES = Object.freeze({
  title: { min: 3, max: 150 },
  shortDescription: { min: 10, max: 300 },
  description: { min: 20, max: 5000 },
  organizer: { min: 2, max: 120 },
  location: { max: 120 },
  eligibility: { max: 1000 },
  prize: { max: 120 },
  fee: { max: 80 },
  skills: { max: 15, maxLength: 30 },
  tags: { max: 10, maxLength: 30 },
  eligibleColleges: { max: 25 },
  url: { maxLength: 500 },
  notes: { max: 1000 },
  reportDetails: { max: 500 },
  pageSize: { default: 12, max: 30 },
  myPageSize: { default: 20, max: 50 },
  // Deadline display: "Closing soon" within this many days.
  closingSoonDays: 3,
  // How many recommendations to show, and how close a deadline counts towards one.
  recommended: 6,
  recommendDeadlineDays: 14,
});

/**
 * Rule-based recommendations (no machine learning): which opportunity types, skills and tags fit each
 * onboarding interest (data/campusOptions.js ids). Keywords are compared case-insensitively with an
 * opportunity's skills and tags.
 */
export const INTEREST_MATCHES = Object.freeze({
  'web-development': { keywords: ['web development', 'web', 'frontend', 'backend', 'full stack', 'react', 'node.js', 'javascript', 'html & css'] },
  'app-development': { keywords: ['app development', 'mobile', 'android', 'ios', 'flutter', 'react native', 'kotlin', 'swift'] },
  'ai-ml': { keywords: ['ai', 'ml', 'ai / ml', 'ai/ml', 'machine learning', 'artificial intelligence', 'deep learning', 'tensorflow', 'pytorch'] },
  'data-science': { keywords: ['data science', 'data', 'analytics', 'machine learning', 'sql'] },
  'cyber-security': { keywords: ['cyber security', 'cybersecurity', 'security', 'ctf', 'ethical hacking'] },
  'cloud-computing': { keywords: ['cloud', 'cloud computing', 'aws', 'azure', 'gcp', 'docker', 'devops'] },
  'game-development': { keywords: ['game development', 'gaming', 'unity', 'unreal'] },
  robotics: { keywords: ['robotics', 'iot', 'arduino', 'raspberry pi', 'embedded', 'hardware'] },
  'competitive-programming': { types: ['competition'], keywords: ['competitive programming', 'coding', 'dsa', 'algorithms'] },
  dsa: { keywords: ['dsa', 'algorithms', 'data structures', 'coding'] },
  hackathons: { types: ['hackathon'], keywords: ['hackathon'] },
  'open-source': { keywords: ['open source', 'git', 'github'] },
  'ui-ux-design': { keywords: ['ui/ux', 'ui ux', 'design', 'figma', 'ux'] },
  photography: { keywords: ['photography'] },
  'video-editing': { keywords: ['video editing', 'video'] },
  'content-creation': { keywords: ['content creation', 'content', 'writing', 'social media'] },
  startups: { keywords: ['startup', 'startups', 'pitch', 'incubation'] },
  entrepreneurship: { keywords: ['entrepreneurship', 'startup', 'business', 'pitch'] },
  sports: { keywords: ['sports'] },
  music: { keywords: ['music'] },
});
