import { body, param } from 'express-validator';
import {
  PAGE_MODE_IDS,
  RESUME_ACCENT_IDS,
  RESUME_AI_TASK_IDS,
  RESUME_DENSITY_IDS,
  RESUME_FONT_IDS,
  RESUME_LIMITS,
  RESUME_TEMPLATE_IDS,
  SUMMARY_TITLES,
  TARGET_ROLE_IDS,
} from '../data/resumeOptions.js';

/*
 * Resume requests. The owner is always the signed-in student: no rule reads a user or owner id, and
 * matchedData keeps only the fields below (owner, isDefault, revision counters and timestamps sent by a
 * client are ignored). The nested resume content, section layout and settings are checked field by field
 * in services/resumeContent.js.
 */

const singleLine = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);

export const resumeIdRules = [param('resumeId').isMongoId().withMessage('Resume not found.')];

const nameRule = () =>
  body('name')
    .optional({ values: 'undefined' })
    .isString().withMessage('Resume name must be text.').bail()
    .customSanitizer(singleLine)
    .isLength({ min: RESUME_LIMITS.name.min, max: RESUME_LIMITS.name.max }).withMessage(`Give your resume a name of up to ${RESUME_LIMITS.name.max} characters.`);

const settingsRules = [
  body('settings').optional({ values: 'undefined' }).isObject().withMessage('Settings must be an object.'),
  body('settings.accent').optional({ values: 'undefined' }).isIn(RESUME_ACCENT_IDS).withMessage('Please choose one of the listed colours.'),
  body('settings.font').optional({ values: 'undefined' }).isIn(RESUME_FONT_IDS).withMessage('Please choose one of the listed fonts.'),
  body('settings.density').optional({ values: 'undefined' }).isIn(RESUME_DENSITY_IDS).withMessage('Please choose one of the listed spacing options.'),
  body('settings.pageMode').optional({ values: 'undefined' }).isIn(PAGE_MODE_IDS).withMessage('Please choose one of the listed page options.'),
];

const commonRules = [
  nameRule(),
  body('customRole')
    .optional({ values: 'undefined' })
    .isString().withMessage('Role must be text.').bail()
    .customSanitizer(singleLine)
    .isLength({ max: RESUME_LIMITS.customRole.max }).withMessage(`Keep the role under ${RESUME_LIMITS.customRole.max} characters.`),
  body('template').optional({ values: 'undefined' }).isIn(RESUME_TEMPLATE_IDS).withMessage('Please choose one of the listed templates.'),
  body('content').optional({ values: 'undefined' }).isObject().withMessage('Resume content must be an object.'),
  body('sections').optional({ values: 'undefined' }).isObject().withMessage('Sections must be an object.'),
  ...settingsRules,
];

export const createResumeRules = [
  body('targetRole').exists({ values: 'falsy' }).withMessage('Please choose a target role.').bail().isIn(TARGET_ROLE_IDS).withMessage('Please choose one of the listed roles.'),
  ...commonRules,
];

export const updateResumeRules = [
  ...resumeIdRules,
  body('revision').exists({ values: 'null' }).withMessage('Send the revision this change is based on.').bail().isInt({ min: 0 }).withMessage('Revision must be a whole number.').toInt(),
  body('targetRole').optional({ values: 'undefined' }).isIn(TARGET_ROLE_IDS).withMessage('Please choose one of the listed roles.'),
  body('markImported').optional({ values: 'undefined' }).isBoolean({ strict: true }).withMessage('markImported must be true or false.'),
  ...commonRules,
  body().custom((value) => ['name', 'targetRole', 'customRole', 'template', 'content', 'sections', 'settings'].some((key) => value?.[key] !== undefined)).withMessage('Nothing to update.'),
];

export const duplicateResumeRules = [...resumeIdRules, nameRule()];

export const analyzeResumeRules = [
  ...resumeIdRules,
  body('jobDescription').optional({ values: 'null' }).isString().withMessage('Job description must be text.').bail().isLength({ max: RESUME_LIMITS.jobDescription.max }).withMessage(`Paste up to ${RESUME_LIMITS.jobDescription.max} characters of the job description.`),
  body('pageCount').optional({ values: 'null' }).isInt({ min: 1, max: 20 }).withMessage('pageCount must be between 1 and 20.').toInt(),
];

export const assistRules = [
  ...resumeIdRules,
  body('task').exists({ values: 'falsy' }).withMessage('Please choose what the assistant should do.').bail().isIn(RESUME_AI_TASK_IDS).withMessage('Please choose one of the listed tasks.'),
  body('text').optional({ values: 'null' }).isString().withMessage('Text must be text.').bail().isLength({ max: RESUME_LIMITS.aiText.max }).withMessage(`Send up to ${RESUME_LIMITS.aiText.max} characters at a time.`),
  body('text').if(body('task').isIn(['bullets', 'grammar'])).trim().notEmpty().withMessage('Write something first, then ask the assistant to improve it.'),
  body('itemId').optional({ values: 'null' }).isString().bail().matches(/^[A-Za-z0-9_-]{1,24}$/).withMessage('Unknown item.'),
  body('summaryTitle').optional({ values: 'null' }).isIn(SUMMARY_TITLES).withMessage('Unknown summary type.'),
  body('jobDescription').optional({ values: 'null' }).isString().withMessage('Job description must be text.').bail().isLength({ max: RESUME_LIMITS.jobDescription.max }).withMessage(`Paste up to ${RESUME_LIMITS.jobDescription.max} characters of the job description.`),
  body('jobDescription').if(body('task').equals('keywords')).trim().notEmpty().withMessage('Paste the job description first.'),
];
