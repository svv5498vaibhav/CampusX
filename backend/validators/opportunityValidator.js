import { body, query } from 'express-validator';
import {
  DEADLINE_FILTER_IDS,
  OPPORTUNITY_MODE_IDS,
  OPPORTUNITY_REPORT_REASON_IDS,
  OPPORTUNITY_RULES,
  OPPORTUNITY_SORT_IDS,
  OPPORTUNITY_STATUS_IDS,
  OPPORTUNITY_TYPE_IDS,
  OPPORTUNITY_VISIBILITY_IDS,
  TRACKING_STATUS_IDS,
} from '../data/opportunityOptions.js';
import { SKILL_SUGGESTIONS } from '../data/campusOptions.js';
import { TECH_SUGGESTIONS } from '../data/showcaseOptions.js';
import { getBranch, getCollege, isValidSemester } from '../services/campusOptionsService.js';
import { cleanText, nameListRule, pageRules, searchRule, singleSpaced, textRule, urlRule } from './showcaseRules.js';

/*
 * Only the fields listed here reach the opportunity services (controllers read them with matchedData).
 * createdBy, updatedBy, slug, views, images, publishedAt, and any user, college, branch or semester sent
 * in a body are ignored: owners and eligibility always come from the signed-in user.
 */

const R = OPPORTUNITY_RULES;
const optional = { values: 'undefined' };
const SUGGESTIONS = [...new Set([...TECH_SUGGESTIONS, ...SKILL_SUGGESTIONS])];
const EARLIEST = new Date('2000-01-01T00:00:00Z');
const LATEST = new Date('2100-01-01T00:00:00Z');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const assert = (condition) => {
  if (!condition) throw new Error('invalid');
  return true;
};

/** An http(s) link (never javascript:, data: or other schemes) without a username or password in it. */
const linkRule = (field, label) =>
  urlRule(field, label, R.url.maxLength)
    .bail()
    .custom((value) => {
      if (value === '') return true;
      const url = new URL(value);
      return !url.username && !url.password;
    })
    .withMessage(`Please enter a plain link for ${label}, without a username or password in it.`);

/** A date and time (ISO 8601). null or "" clears it when editing. */
const dateRule = (field, label) =>
  body(field)
    .optional(optional)
    .custom((value) => value === null || value === '' || (typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))))
    .withMessage(`Please choose a valid ${label}.`)
    .bail()
    .customSanitizer((value) => (value === null || value === '' ? null : new Date(value)))
    .custom((date) => date === null || (date >= EARLIEST && date < LATEST))
    .withMessage(`Please choose a valid ${label}.`);

/** A list of option ids, each known to CampusX, without duplicates. */
const idListRule = (field, label, { max, isKnown }) =>
  body(field)
    .optional(optional)
    .custom(Array.isArray).withMessage(`${label} must be a list.`)
    .bail()
    .custom((list) => list.length <= max).withMessage(`Choose up to ${max} ${label.toLowerCase()}.`)
    .bail()
    .custom((list) => list.every((item) => typeof item === 'string' && item.length <= 100)).withMessage(`Please choose ${label.toLowerCase()} from the list.`)
    .bail()
    .customSanitizer((list) => [...new Set(list.map((item) => item.trim()))])
    .custom(async (list) => assert((await Promise.all(list.map(isKnown))).every(Boolean)))
    .withMessage(`Please choose ${label.toLowerCase()} from the list.`);

const semestersRule = () =>
  body('eligibleSemesters')
    .optional(optional)
    .custom(Array.isArray).withMessage('Semesters must be a list.')
    .bail()
    .customSanitizer((list) => list.map((value) => (typeof value === 'string' && /^\d{1,2}$/.test(value.trim()) ? Number(value) : value)))
    .custom((list) => list.every(isValidSemester)).withMessage('Please choose semesters between 1 and 8.')
    .bail()
    .customSanitizer((list) => [...new Set(list)].sort((a, b) => a - b));

const required = (field, isRequired) => (isRequired ? body(field) : body(field).optional(optional));

const opportunityFields = ({ creating }) => [
  textRule('title', 'Title', { min: R.title.min, max: R.title.max, required: creating }),
  textRule('shortDescription', 'Short description', { min: R.shortDescription.min, max: R.shortDescription.max, required: creating }),
  textRule('description', 'Description', { min: R.description.min, max: R.description.max, required: creating, multiline: true }),
  required('type', creating).isIn(OPPORTUNITY_TYPE_IDS).withMessage('Please choose a type.'),
  textRule('organizer', 'Organizer', { min: R.organizer.min, max: R.organizer.max, required: creating }),
  required('mode', creating).isIn(OPPORTUNITY_MODE_IDS).withMessage('Please choose online, offline or hybrid.'),
  textRule('location', 'Location', { max: R.location.max }),
  linkRule('applicationUrl', 'the application link'),
  linkRule('registrationUrl', 'the registration link'),
  dateRule('startDate', 'start date'),
  dateRule('endDate', 'end date'),
  dateRule('applicationDeadline', 'application deadline'),
  textRule('eligibility', 'Eligibility', { max: R.eligibility.max, multiline: true }),
  idListRule('eligibleColleges', 'Colleges', { max: R.eligibleColleges.max, isKnown: getCollege }),
  idListRule('eligibleBranches', 'Branches', { max: 20, isKnown: getBranch }),
  semestersRule(),
  nameListRule('skills', 'Skills', { max: R.skills.max, maxLength: R.skills.maxLength, suggestions: SUGGESTIONS }),
  nameListRule('tags', 'Tags', { max: R.tags.max, maxLength: R.tags.maxLength }),
  textRule('prize', 'Prize', { max: R.prize.max }),
  textRule('fee', 'Fee', { max: R.fee.max }),
  body('visibility').optional(optional).isIn(OPPORTUNITY_VISIBILITY_IDS).withMessage('Please choose who can see it.'),
  body('featured').optional(optional).isBoolean({ strict: true }).withMessage('featured must be true or false.'),
  // New opportunities start as a draft or go straight to published; closing and archiving are edits.
  body('status')
    .optional(optional)
    .isIn(creating ? ['draft', 'published'] : OPPORTUNITY_STATUS_IDS)
    .withMessage(creating ? 'New opportunities are saved as a draft or published.' : 'Please choose a valid status.'),
];

export const createOpportunityRules = opportunityFields({ creating: true });
export const updateOpportunityRules = opportunityFields({ creating: false });

/** Discovery filters. college/branch/semester here only filter the list; eligibility uses the profile. */
export const listOpportunitiesRules = [
  ...pageRules(R.pageSize),
  searchRule(),
  query('type').default('all').isIn(['all', ...OPPORTUNITY_TYPE_IDS]).withMessage('Please choose a valid type.'),
  query('mode').optional({ values: 'falsy' }).isIn(OPPORTUNITY_MODE_IDS).withMessage('Please choose online, offline or hybrid.'),
  query('location')
    .optional({ values: 'falsy' })
    .isString().withMessage('Location must be text.')
    .bail()
    .customSanitizer(singleSpaced)
    .isLength({ max: 80 }).withMessage('Location is limited to 80 characters.'),
  // Comma-separated, e.g. skills=React,Node.js (matches any).
  query('skills')
    .optional({ values: 'falsy' })
    .isString().withMessage('Skills must be text.')
    .bail()
    .customSanitizer((text) => [...new Set(text.split(',').map(singleSpaced).filter(Boolean))])
    .custom((list) => list.length <= 10 && list.every((skill) => skill.length <= R.skills.maxLength))
    .withMessage('Filter by up to 10 skills.'),
  query('deadline').default('any').isIn(DEADLINE_FILTER_IDS).withMessage('Please choose a valid deadline filter.'),
  query('college').optional({ values: 'falsy' }).custom(async (id) => assert(await getCollege(id))).withMessage('Please choose a college from the list.'),
  query('branch').optional({ values: 'falsy' }).custom(async (id) => assert(await getBranch(id))).withMessage('Please choose a branch from the list.'),
  query('semester').optional({ values: 'falsy' }).isInt({ min: 1, max: 8 }).withMessage('Please choose a semester between 1 and 8.').bail().toInt(),
  query('eligible').default('false').isIn(['true', 'false']).withMessage('eligible must be true or false.').bail().toBoolean(),
  query('sort').default('deadline').isIn(OPPORTUNITY_SORT_IDS).withMessage('Please choose a valid sort.'),
];

export const manageOpportunitiesRules = [
  ...pageRules(R.pageSize),
  searchRule(),
  query('status').default('all').isIn(['all', ...OPPORTUNITY_STATUS_IDS]).withMessage('Please choose a valid status.'),
];

const notesRule = () =>
  body('notes')
    .optional(optional)
    .isString().withMessage('Notes must be text.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ max: R.notes.max }).withMessage(`Notes can be up to ${R.notes.max} characters.`)
    .bail()
    .not().matches(/<\s*\/?\s*[a-z!?]/i).withMessage("Please don't include HTML or code tags.");

/** Adding to the student's list starts as saved, interested or applied. */
export const trackOpportunityRules = [
  body('status').optional(optional).isIn(['saved', 'interested', 'applied']).withMessage('Choose saved, interested or applied.'),
  notesRule(),
];

export const updateTrackingRules = [
  body('status').optional(optional).isIn(TRACKING_STATUS_IDS).withMessage('Please choose a valid status.'),
  notesRule(),
];

export const myOpportunitiesRules = [
  ...pageRules(R.myPageSize),
  query('status').default('all').isIn(['all', ...TRACKING_STATUS_IDS]).withMessage('Please choose a valid status.'),
];

export const reportOpportunityRules = [
  body('reason').isIn(OPPORTUNITY_REPORT_REASON_IDS).withMessage('Please choose a reason for your report.'),
  body('details')
    .optional({ values: 'falsy' })
    .isString().withMessage('Details must be text.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ max: R.reportDetails.max })
    .withMessage(`Please keep details to ${R.reportDetails.max} characters.`),
];
