import { body, query } from 'express-validator';
import { CASE_DECISION_IDS, CASE_RULES, CASE_STATUSES } from '../config/moderationConfig.js';
import { cleanText, pageRules } from './showcaseRules.js';

/* The moderators' case API (staff only; the route checks the role first). */

export const listCasesRules = [
  ...pageRules(CASE_RULES.pageSize),
  query('status').default('open').isIn([...CASE_STATUSES, 'all']).withMessage('Please choose a valid case status.'),
];

export const decideCaseRules = [
  body('decision').isIn(CASE_DECISION_IDS).withMessage(`Choose one of: ${CASE_DECISION_IDS.join(', ')}.`),
  body('note')
    .optional({ values: 'falsy' })
    .isString().withMessage('The note must be text.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ max: CASE_RULES.noteMax }).withMessage(`Notes can be up to ${CASE_RULES.noteMax} characters.`),
];
