import { body, query } from 'express-validator';
import { ACHIEVEMENT_RULES, ACHIEVEMENT_TYPE_IDS, SHOWCASE_VISIBILITY_IDS } from '../data/showcaseOptions.js';
import { nameListRule, pageRules, searchRule, textRule, urlRule } from './showcaseRules.js';

/*
 * Only the fields listed here reach the achievement service (controllers read them with matchedData).
 * verificationStatus, verification details, owner, proof and audience sent by the client are ignored.
 */

const R = ACHIEVEMENT_RULES;
const optional = { values: 'undefined' };
const EARLIEST = new Date('1990-01-01T00:00:00Z');

const dateRule = ({ required }) =>
  (required ? body('date') : body('date').optional(optional))
    .isISO8601({ strict: true }).withMessage('Please choose a valid date.')
    .bail()
    .toDate()
    .custom((date) => date >= EARLIEST && date.getTime() <= Date.now() + 24 * 60 * 60 * 1000)
    .withMessage('The date can’t be in the future.');

const achievementFields = ({ required }) => [
  textRule('title', 'Title', { min: R.title.min, max: R.title.max, required }),
  textRule('description', 'Description', { max: R.description.max, multiline: true }),
  (required ? body('type') : body('type').optional(optional)).isIn(ACHIEVEMENT_TYPE_IDS).withMessage('Please choose a type.'),
  textRule('organization', 'Organization', { max: R.organization.max }),
  textRule('eventName', 'Event name', { max: R.eventName.max }),
  dateRule({ required }),
  textRule('rank', 'Result', { max: R.rank.max }),
  urlRule('certificateUrl', 'the certificate', R.url.maxLength),
  nameListRule('skills', 'Skills', { max: R.skills.max, maxLength: R.skills.maxLength }),
  body('visibility').optional(optional).isIn(SHOWCASE_VISIBILITY_IDS).withMessage('Please choose who can see it.'),
];

export const createAchievementRules = achievementFields({ required: true });
export const updateAchievementRules = achievementFields({ required: false });

export const listAchievementsRules = [
  ...pageRules(R.pageSize),
  searchRule(),
  query('type').default('all').isIn(['all', ...ACHIEVEMENT_TYPE_IDS]).withMessage('Please choose a valid type.'),
  // "Verified only" means verificationStatus = verified, nothing else.
  query('verified').default('false').isIn(['true', 'false']).withMessage('verified must be true or false.').bail().toBoolean(),
];

export const userAchievementsRules = pageRules({ default: 6, max: 30 });

export const reviewAchievementRules = [
  body('status').isIn(['verified', 'rejected']).withMessage('Status must be verified or rejected.'),
  textRule('note', 'Note', { max: R.verificationNote.max }),
];
