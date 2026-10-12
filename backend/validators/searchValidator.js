import { query } from 'express-validator';
import { COMMUNITY_TYPE_IDS } from '../data/communityOptions.js';
import { DEADLINE_FILTER_IDS, OPPORTUNITY_MODE_IDS, OPPORTUNITY_TYPE_IDS } from '../data/opportunityOptions.js';
import { POST_TYPE_IDS } from '../data/postOptions.js';
import { SEARCH_RULES, SEARCH_SORT_IDS, SEARCH_TYPES } from '../data/searchOptions.js';
import { ACHIEVEMENT_TYPE_IDS, PROJECT_CATEGORY_IDS } from '../data/showcaseOptions.js';
import { getBranch, getCollege, isKnownInterest } from '../services/campusOptionsService.js';
import { cleanQueryText } from '../services/searchQuery.js';

/*
 * Only the fields listed here reach the search service (the controller reads them with matchedData).
 * Filters are discovery filters checked against CampusX's own option lists; they only ever narrow what
 * the student may already see. Visibility always comes from the signed-in student's profile.
 */

const R = SEARCH_RULES;
const LIST_ITEM = /^[\p{L}\p{N}][\p{L}\p{N} .+#&/()_-]*$/u;

const assert = (condition) => {
  if (!condition) throw new Error('invalid');
  return true;
};

/** The search text: 2–100 characters after trimming, with at least one letter or digit. */
export const searchTextRule = (field = 'q') =>
  query(field)
    .exists({ values: 'falsy' }).withMessage('Type something to search for.')
    .bail()
    .isString().withMessage('Search must be text.')
    .bail()
    .custom((value) => value.length <= R.query.max * 4).withMessage(`Searches can be up to ${R.query.max} characters.`)
    .bail()
    .customSanitizer((value) => value.normalize('NFKC').replace(/\s+/g, ' ').trim())
    .isLength({ min: R.query.min }).withMessage(`Type at least ${R.query.min} characters to search.`)
    .bail()
    .isLength({ max: R.query.max }).withMessage(`Searches can be up to ${R.query.max} characters.`)
    .bail()
    .customSanitizer(cleanQueryText)
    .matches(/[\p{L}\p{N}]/u).withMessage('Search for words or numbers.');

/** page 1–maxPage; a larger limit than allowed is lowered to the maximum rather than refused. */
const pageRules = () => [
  query('page').default(1).isInt({ min: 1, max: R.maxPage }).withMessage(`page must be a whole number from 1 to ${R.maxPage}. Try a more specific search.`).bail().toInt(),
  query('limit')
    .default(R.pageSize.default)
    .isInt({ min: 1 }).withMessage('limit must be a whole number of at least 1.')
    .bail()
    .customSanitizer((value) => Math.min(Number.parseInt(value, 10), R.pageSize.max)),
];

const sortRule = (type) => query('sort').default('relevance').isIn(SEARCH_SORT_IDS[type]).withMessage(`Sort by ${SEARCH_SORT_IDS[type].join(', ')}.`);
const choiceRule = (field, ids, message) => query(field).optional({ values: 'falsy' }).isIn(ids).withMessage(message);
const collegeRule = () => query('college').optional({ values: 'falsy' }).custom(async (id) => assert(await getCollege(id))).withMessage('Please choose a college from the list.');
const branchRule = () => query('branch').optional({ values: 'falsy' }).custom(async (id) => assert(await getBranch(id))).withMessage('Please choose a branch from the list.');
const semesterRule = () => query('semester').optional({ values: 'falsy' }).isInt({ min: 1, max: 8 }).withMessage('Please choose a semester between 1 and 8.').bail().toInt();

/** Comma-separated names (skills, tech): "React,Node.js" → ['React', 'Node.js']; matches any of them. */
const nameListRule = (field, label) =>
  query(field)
    .optional({ values: 'falsy' })
    .isString().withMessage(`${label} must be text.`)
    .bail()
    .customSanitizer((text) => {
      const seen = new Set();
      return text
        .split(',')
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
    })
    .custom((list) => list.length <= R.filterList.max && list.every((item) => item.length <= R.filterList.maxLength && LIST_ITEM.test(item)))
    .withMessage(`Filter by up to ${R.filterList.max} ${label.toLowerCase()}, each up to ${R.filterList.maxLength} characters.`);

const interestsRule = () =>
  query('interests')
    .optional({ values: 'falsy' })
    .isString().withMessage('Interests must be text.')
    .bail()
    .customSanitizer((text) => [...new Set(text.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))])
    .custom(async (list) => assert(list.length <= R.filterList.max && (await Promise.all(list.map(isKnownInterest))).every(Boolean)))
    .withMessage('Please choose interests from the list.');

const FILTERS = {
  [SEARCH_TYPES.STUDENTS]: [collegeRule(), branchRule(), semesterRule(), nameListRule('skills', 'Skills'), interestsRule()],
  [SEARCH_TYPES.POSTS]: [choiceRule('type', POST_TYPE_IDS, 'Please choose a post type from the list.')],
  [SEARCH_TYPES.PROJECTS]: [choiceRule('category', PROJECT_CATEGORY_IDS, 'Please choose a category from the list.'), nameListRule('tech', 'Tech')],
  [SEARCH_TYPES.COMMUNITIES]: [choiceRule('type', COMMUNITY_TYPE_IDS, 'Please choose a community type from the list.'), collegeRule(), branchRule()],
  [SEARCH_TYPES.OPPORTUNITIES]: [
    choiceRule('type', OPPORTUNITY_TYPE_IDS, 'Please choose an opportunity type from the list.'),
    choiceRule('mode', OPPORTUNITY_MODE_IDS, 'Please choose online, offline or hybrid.'),
    nameListRule('skills', 'Skills'),
    query('deadline').default('any').isIn(DEADLINE_FILTER_IDS).withMessage('Please choose a valid deadline filter.'),
    collegeRule(),
    branchRule(),
    semesterRule(),
  ],
  [SEARCH_TYPES.ACHIEVEMENTS]: [
    choiceRule('type', ACHIEVEMENT_TYPE_IDS, 'Please choose an achievement type from the list.'),
    query('verified').default('false').isIn(['true', 'false']).withMessage('verified must be true or false.').bail().toBoolean(),
  ],
};

/** GET /search: everything at once, a few of each. */
export const globalSearchRules = [searchTextRule()];

/** GET /search/<type>: one category with its own filters, sort and pages. */
export const categorySearchRules = (type) => [searchTextRule(), ...pageRules(), sortRule(type), ...FILTERS[type]];

export const suggestionRules = [searchTextRule()];
