import { body, query } from 'express-validator';
import {
  COMMUNITY_FILTER_IDS,
  COMMUNITY_RULES,
  COMMUNITY_SORT_IDS,
  COMMUNITY_STATUSES,
  COMMUNITY_TYPE_IDS,
  COMMUNITY_VISIBILITY_IDS,
  MEMBER_ROLES,
  VISIBILITY_FOR_TYPE,
} from '../data/communityOptions.js';

/*
 * Only the fields listed here reach the services (controllers read them with matchedData), so
 * createdBy, college, branch, semester, memberCount, official and the like are simply ignored.
 */

const { name: NAME, description: DESCRIPTION, tags: TAGS, rules: RULES } = COMMUNITY_RULES;
const singleSpaced = (text) => text.replace(/\s+/g, ' ').trim();
const cleanText = (text) => text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &'().,+#/:-]*$/u;
const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .+#&/-]*$/u;
const optional = { values: 'undefined' };

const nameRule = ({ required }) =>
  (required ? body('name') : body('name').optional(optional))
    .isString().withMessage('Please enter a community name.')
    .bail()
    .customSanitizer(singleSpaced)
    .isLength({ min: NAME.min, max: NAME.max }).withMessage(`Community names are ${NAME.min}–${NAME.max} characters.`)
    .bail()
    .matches(NAME_PATTERN).withMessage("Names can use letters, numbers, spaces and & ' ( ) . , + # / : -");

const descriptionRule = ({ required }) =>
  (required ? body('description') : body('description').optional(optional))
    .isString().withMessage('Please describe the community.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ min: DESCRIPTION.min, max: DESCRIPTION.max })
    .withMessage(`Descriptions are ${DESCRIPTION.min}–${DESCRIPTION.max} characters.`);

const tagsRule = ({ required }) =>
  (required ? body('tags') : body('tags').optional(optional))
    .custom(Array.isArray).withMessage('Tags must be a list.')
    .bail()
    .customSanitizer((tags) => tags.map((tag) => (typeof tag === 'string' ? singleSpaced(tag).toLowerCase() : tag)))
    .custom((tags) => tags.length >= TAGS.min && tags.length <= TAGS.max).withMessage(`Add ${TAGS.min}–${TAGS.max} tags.`)
    .bail()
    .custom((tags) => tags.every((tag) => typeof tag === 'string' && tag.length > 0 && tag.length <= TAGS.maxLength))
    .withMessage(`Each tag must be 1–${TAGS.maxLength} characters.`)
    .bail()
    .custom((tags) => tags.every((tag) => TAG_PATTERN.test(tag))).withMessage('Tags can use letters, numbers, spaces and . + # & / -')
    .bail()
    .custom((tags) => new Set(tags).size === tags.length).withMessage('Each tag can only be added once.');

const rulesRule = () =>
  body('rules')
    .optional(optional)
    .custom(Array.isArray).withMessage('Rules must be a list.')
    .bail()
    .customSanitizer((rules) => rules.map((rule) => (typeof rule === 'string' ? singleSpaced(rule) : rule)))
    .custom((rules) => rules.length <= RULES.max).withMessage(`Add up to ${RULES.max} rules.`)
    .bail()
    .custom((rules) => rules.every((rule) => typeof rule === 'string' && rule.length > 0 && rule.length <= RULES.maxLength))
    .withMessage(`Each rule must be 1–${RULES.maxLength} characters.`);

export const createCommunityRules = [
  nameRule({ required: true }),
  descriptionRule({ required: true }),
  body('type').isIn(COMMUNITY_TYPE_IDS).withMessage('Please choose a community type.'),
  body('visibility')
    .isIn(COMMUNITY_VISIBILITY_IDS).withMessage('Please choose who can join.')
    .bail()
    .custom((visibility, { req }) => VISIBILITY_FOR_TYPE[req.body.type]?.includes(visibility) ?? true)
    .withMessage('That visibility isn’t available for this type of community.'),
  tagsRule({ required: true }),
  rulesRule(),
];

// Type and visibility (and so the campus scope) are fixed once a community exists.
export const updateCommunityRules = [
  nameRule({ required: false }),
  descriptionRule({ required: false }),
  tagsRule({ required: false }),
  rulesRule(),
  body('status').optional(optional).isIn(COMMUNITY_STATUSES).withMessage('Status must be active or archived.'),
];

const pageRules = ({ default: defaultSize, max }) => [
  query('page').default(1).isInt({ min: 1, max: 1000 }).withMessage('page must be a whole number from 1 to 1000.').bail().toInt(),
  query('limit').default(defaultSize).isInt({ min: 1, max }).withMessage(`limit must be a whole number from 1 to ${max}.`).bail().toInt(),
];

export const listCommunitiesRules = [
  ...pageRules(COMMUNITY_RULES.pageSize),
  query('search')
    .optional({ values: 'falsy' })
    .isString().withMessage('Search must be text.')
    .bail()
    .customSanitizer(singleSpaced)
    .isLength({ max: COMMUNITY_RULES.search.maxLength }).withMessage(`Search is limited to ${COMMUNITY_RULES.search.maxLength} characters.`),
  query('filter').default('all').isIn(COMMUNITY_FILTER_IDS).withMessage('Please choose a valid filter.'),
  query('sort').default('popular').isIn(COMMUNITY_SORT_IDS).withMessage('Please choose popular or new.'),
];

export const listMembersRules = pageRules(COMMUNITY_RULES.memberPageSize);
export const communityPostsRules = pageRules({ default: 10, max: 20 });

export const changeRoleRules = [body('role').isIn(MEMBER_ROLES).withMessage('Role must be member, moderator or owner.')];
