import { body } from 'express-validator';
import { PROFILE_RULES, PROFILE_THEME_IDS } from '../data/profileOptions.js';
import {
  branchRule,
  collegeRule,
  interestsRule,
  nameRule,
  rollNumberRule,
  semesterRule,
  skillsRule,
} from './fieldRules.js';

const optional = { optional: true };

/**
 * PUT /profile changes only the fields that are sent; each one present must be valid.
 * Campus fields use the same rules as onboarding. A branch is checked against the college
 * being saved, or the student's current college when the college isn't changing.
 */
export const updateProfileRules = [
  nameRule('firstName', 'first name', optional),
  nameRule('lastName', 'last name', optional),

  body('bio')
    .optional({ values: 'undefined' })
    .isString().withMessage('Bio must be text.')
    .bail()
    // Normalise line endings and squeeze runs of blank lines.
    .customSanitizer((bio) => bio.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
    .isLength({ max: PROFILE_RULES.bio.maxLength })
    .withMessage(`Bio must be ${PROFILE_RULES.bio.maxLength} characters or fewer.`),

  skillsRule(),
  interestsRule(optional),

  body('profileTheme')
    .optional({ values: 'undefined' })
    .custom((theme) => PROFILE_THEME_IDS.includes(theme))
    .withMessage('Please choose one of the CampusX profile styles.'),

  collegeRule(optional),
  // Moving to another college means picking a branch there too.
  body('college')
    .optional({ values: 'undefined' })
    .custom((college, { req }) => req.body.branch !== undefined)
    .withMessage('Please choose your branch for the new college.'),
  branchRule({ ...optional, collegeOf: (req) => req.body.college ?? req.user.college }),
  semesterRule(optional),
  rollNumberRule(optional),
];
