import { body, query } from 'express-validator';
import {
  PROJECT_CATEGORY_IDS,
  PROJECT_RULES,
  PROJECT_STATUS_IDS,
  SHOWCASE_VISIBILITY_IDS,
  TEAM_ROLE_IDS,
  TECH_SUGGESTIONS,
} from '../data/showcaseOptions.js';
import { isObjectIdString, nameListRule, pageRules, searchRule, singleSpaced, textRule, urlRule } from './showcaseRules.js';

/*
 * Only the fields listed here reach the project service (controllers read them with matchedData):
 * owner, slug, views, likes, images, audience and team statuses sent by the client are ignored.
 */

const R = PROJECT_RULES;
const optional = { values: 'undefined' };

const projectFields = ({ required }) => [
  textRule('title', 'Project title', { min: R.title.min, max: R.title.max, required }),
  textRule('shortDescription', 'Short description', { min: R.shortDescription.min, max: R.shortDescription.max, required }),
  textRule('description', 'Description', { min: R.description.min, max: R.description.max, required, multiline: true }),
  (required ? body('category') : body('category').optional(optional)).isIn(PROJECT_CATEGORY_IDS).withMessage('Please choose a category.'),
  nameListRule('techStack', 'Technologies', { max: R.techStack.max, maxLength: R.techStack.maxLength, suggestions: TECH_SUGGESTIONS }),
  urlRule('githubUrl', 'GitHub', R.url.maxLength),
  urlRule('liveUrl', 'Live site', R.url.maxLength),
  urlRule('demoUrl', 'Demo', R.url.maxLength),
  body('status').optional(optional).isIn(PROJECT_STATUS_IDS).withMessage('Please choose a status.'),
  body('visibility').optional(optional).isIn(SHOWCASE_VISIBILITY_IDS).withMessage('Please choose who can see it.'),
  body('featured').optional(optional).isBoolean({ strict: true }).withMessage('featured must be true or false.'),
  // Teammates are CampusX students picked by id; the service checks they exist and are active.
  body('teamMembers')
    .optional(optional)
    .custom(Array.isArray).withMessage('Team must be a list.')
    .bail()
    .custom((team) => team.length <= R.team.max).withMessage(`A project can have up to ${R.team.max} teammates.`)
    .bail()
    .custom((team) => team.every((member) => member && isObjectIdString(member.user) && TEAM_ROLE_IDS.includes(member.role ?? 'developer')))
    .withMessage('Each teammate needs a valid student and role.')
    .bail()
    .customSanitizer((team) => team.map((member) => ({ user: member.user, role: member.role ?? 'developer' }))),
];

export const createProjectRules = projectFields({ required: true });

export const updateProjectRules = [
  ...projectFields({ required: false }),
  body('thumbnailImageId').optional(optional).custom(isObjectIdString).withMessage('Choose one of the project’s images.'),
];

export const listProjectsRules = [
  ...pageRules(R.pageSize),
  searchRule(),
  query('category').default('all').isIn(['all', ...PROJECT_CATEGORY_IDS]).withMessage('Please choose a valid category.'),
  query('status').optional({ values: 'falsy' }).isIn(PROJECT_STATUS_IDS).withMessage('Please choose a valid status.'),
  query('sort').default('new').isIn(['new', 'popular']).withMessage('Please choose new or popular.'),
];

export const userProjectsRules = pageRules({ default: 6, max: 30 });

export const teamCandidatesRules = [
  query('search')
    .isString().withMessage('Type a name to search.')
    .bail()
    .customSanitizer(singleSpaced)
    .isLength({ min: 2, max: 50 }).withMessage('Type at least 2 letters of a name.'),
];
