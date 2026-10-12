/**
 * Single source for community types, visibility levels, roles and limits. The frontend reads these
 * through GET /api/v1/communities/options; icons and colours are its only own additions.
 */

export const COMMUNITY_TYPES = Object.freeze([
  { id: 'college', label: 'College', description: 'Everyone at one campus' },
  { id: 'branch', label: 'Branch', description: 'Students of one branch at a campus' },
  { id: 'interest', label: 'Interest', description: 'Students who share an interest' },
  { id: 'project', label: 'Project', description: 'A team building something together' },
  { id: 'student-created', label: 'Club', description: 'Clubs, societies and anything else' },
]);
export const COMMUNITY_TYPE_IDS = Object.freeze(COMMUNITY_TYPES.map((type) => type.id));

/**
 * Who can find and join a community. The scope (college, branch, semester) is always taken from
 * the creator's profile in the database, never from the request.
 */
export const COMMUNITY_VISIBILITY = Object.freeze([
  { id: 'public', label: 'All of CampusX', description: 'Any CampusX student can join' },
  { id: 'college', label: 'My campus', description: 'Students at your college' },
  { id: 'branch', label: 'My branch', description: 'Students in your branch at your college' },
  { id: 'restricted', label: 'My class', description: 'Students in your branch and semester at your college' },
]);
export const COMMUNITY_VISIBILITY_IDS = Object.freeze(COMMUNITY_VISIBILITY.map((option) => option.id));

/** Visibility levels each type may use. College and branch communities are always campus-scoped. */
export const VISIBILITY_FOR_TYPE = Object.freeze({
  college: ['college'],
  branch: ['branch', 'restricted'],
  interest: ['public', 'college', 'branch', 'restricted'],
  project: ['public', 'college', 'branch', 'restricted'],
  'student-created': ['public', 'college', 'branch', 'restricted'],
});

export const COMMUNITY_STATUSES = Object.freeze(['active', 'archived']);

export const MEMBER_ROLES = Object.freeze(['member', 'moderator', 'owner']);
/** active: in the community · left: left on their own (may rejoin) · banned: removed by the owner or a moderator (may not rejoin). */
export const MEMBER_STATUSES = Object.freeze(['active', 'left', 'banned']);

export const COMMUNITY_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My Communities' },
  { id: 'college', label: 'College' },
  { id: 'branch', label: 'Branch' },
  { id: 'interest', label: 'Interest' },
  { id: 'project', label: 'Project' },
]);
export const COMMUNITY_FILTER_IDS = Object.freeze(COMMUNITY_FILTERS.map((filter) => filter.id));

export const COMMUNITY_SORTS = Object.freeze([
  { id: 'popular', label: 'Popular' },
  { id: 'new', label: 'New' },
]);
export const COMMUNITY_SORT_IDS = Object.freeze(COMMUNITY_SORTS.map((sort) => sort.id));

export const COMMUNITY_RULES = Object.freeze({
  name: { min: 3, max: 80 },
  description: { min: 10, max: 500 },
  tags: { min: 1, max: 8, maxLength: 30 },
  rules: { max: 10, maxLength: 150 },
  search: { maxLength: 80 },
  pageSize: { default: 12, max: 30 },
  memberPageSize: { default: 20, max: 50 },
  recommended: 8,
});
