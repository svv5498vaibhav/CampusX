import { body } from 'express-validator';
import { REPORT_REASON_IDS, REPORT_RULES, REPORT_TARGET_IDS } from '../config/moderationConfig.js';
import { cleanText, pageRules } from './showcaseRules.js';

/*
 * Only these fields reach the report service (the controller reads them with matchedData). A reporter,
 * status, priority or anything else in the body is ignored: the reporter is always the signed-in student
 * and only CampusX moderators change a report's status. Whether a reason fits the kind of content is
 * checked by the service (config/moderationConfig.js REPORT_TARGETS).
 */

export const createReportRules = [
  body('targetType').isIn(REPORT_TARGET_IDS).withMessage('Please choose what you are reporting.'),
  body('targetId').isMongoId().withMessage('That can’t be reported.'),
  body('reason').isIn(REPORT_REASON_IDS).withMessage('Please choose a reason for your report.'),
  body('description')
    .optional({ values: 'falsy' })
    .isString().withMessage('Details must be text.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ max: REPORT_RULES.descriptionMax }).withMessage(`Please keep details to ${REPORT_RULES.descriptionMax} characters.`)
    .bail()
    .not().matches(/<\s*\/?\s*[a-z!?]/i).withMessage("Please don't include HTML or code tags."),
];

export const myReportsRules = pageRules(REPORT_RULES.pageSize);
