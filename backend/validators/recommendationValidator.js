import { body, query } from 'express-validator';
import { FEEDBACK_ACTION_IDS, INTERACTION_ACTION_IDS, INTERACTION_RULES, LIST_TYPES, RESULT_RULES } from '../config/recommendationConfig.js';

/*
 * Only the fields listed here reach the recommendation service (the controller reads them with
 * matchedData). There is never a user id, college, branch, semester or eligibility to validate: all of
 * that comes from the signed-in student's own account.
 */

const R = RESULT_RULES;
const maxPage = R.ranked;

/** page 1+; a larger limit than allowed is lowered to the maximum rather than refused. */
export const listRules = [
  query('page').default(1).isInt({ min: 1, max: maxPage }).withMessage(`page must be a whole number from 1 to ${maxPage}.`).bail().toInt(),
  query('limit')
    .default(R.pageSize.default)
    .isInt({ min: 1 }).withMessage('limit must be a whole number of at least 1.')
    .bail()
    .customSanitizer((value) => Math.min(Number.parseInt(value, 10), R.pageSize.max)),
];

/** "Not interested" by default (the app's menu); "dismiss" only hides that one item. */
export const dismissRules = [
  body('action').default('not_interested').isIn(FEEDBACK_ACTION_IDS).withMessage(`action must be one of: ${FEEDBACK_ACTION_IDS.join(', ')}.`),
];

export const interactionRules = [
  body('action').isIn(INTERACTION_ACTION_IDS).withMessage(`action must be one of: ${INTERACTION_ACTION_IDS.join(', ')}.`),
  body('items')
    .isArray({ min: 1, max: INTERACTION_RULES.maxBatch }).withMessage(`Send between 1 and ${INTERACTION_RULES.maxBatch} items.`),
  body('items.*.type').isIn(LIST_TYPES).withMessage(`Each item's type must be one of: ${LIST_TYPES.join(', ')}.`),
  body('items.*.id').isMongoId().withMessage('Each item needs a valid id.'),
];
