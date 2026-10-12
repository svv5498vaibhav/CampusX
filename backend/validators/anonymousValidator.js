import { body, query } from 'express-validator';
import {
  ANONYMOUS_CATEGORY_IDS,
  ANONYMOUS_REPORT_REASON_IDS,
  ANONYMOUS_RULES,
  ANONYMOUS_SORT_IDS,
  ANONYMOUS_VISIBILITY_IDS,
} from '../data/anonymousOptions.js';
import { findPersonalInfo, personalInfoMessage } from '../utils/personalInfo.js';
import { cleanText, isObjectIdString, pageRules, searchRule, textRule } from './showcaseRules.js';

/*
 * Only the fields listed here reach the anonymous services (controllers read them with matchedData):
 * author, userId, createdBy, moderationStatus, status, reportsCount, likes, audience and any college or
 * branch sent by a client are ignored. Text is plain text (markup is refused) and must not contain
 * phone numbers, email addresses, passwords/OTPs or similar private details.
 */

const R = ANONYMOUS_RULES;
const optional = { values: 'undefined' };

const withoutPersonalInfo = (chain) =>
  chain.bail().custom((value) => {
    const kind = findPersonalInfo(value);
    if (kind) throw new Error(personalInfoMessage(kind));
    return true;
  });

const postFields = ({ creating }) => [
  (creating ? body('category') : body('category').optional(optional)).isIn(ANONYMOUS_CATEGORY_IDS).withMessage('Please choose a category.'),
  withoutPersonalInfo(textRule('title', 'Title', { min: R.title.min, max: R.title.max, required: creating })),
  withoutPersonalInfo(textRule('content', 'Your post', { min: R.content.min, max: R.content.max, required: creating, multiline: true })),
];

export const createAnonymousPostRules = [
  ...postFields({ creating: true }),
  body('visibility').optional({ values: 'falsy' }).isIn(ANONYMOUS_VISIBILITY_IDS).withMessage('Please choose who can see it.'),
  body('community').optional({ values: 'falsy' }).custom(isObjectIdString).withMessage('Choose one of your communities.'),
];

/** The author may change the title, content and category only. */
export const updateAnonymousPostRules = postFields({ creating: false });

export const listAnonymousPostsRules = [
  ...pageRules(R.pageSize),
  searchRule(),
  query('category').default('all').isIn(['all', ...ANONYMOUS_CATEGORY_IDS]).withMessage('Please choose a valid category.'),
  query('sort').default('recent').isIn(ANONYMOUS_SORT_IDS).withMessage('Please choose recent or discussed.'),
  query('community').optional({ values: 'falsy' }).custom(isObjectIdString).withMessage('Choose one of your communities.'),
];

export const myAnonymousPostsRules = pageRules(R.pageSize);
export const listAnonymousCommentsRules = pageRules(R.commentPageSize);

export const anonymousCommentRules = [
  withoutPersonalInfo(textRule('content', 'Comment', { min: R.comment.min, max: R.comment.max, required: true, multiline: true })),
];

export const anonymousReportRules = [
  body('reason').isIn(ANONYMOUS_REPORT_REASON_IDS).withMessage('Please choose a reason for your report.'),
  body('details')
    .optional({ values: 'falsy' })
    .isString().withMessage('Details must be text.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ max: R.reportDetails.max })
    .withMessage(`Please keep details to ${R.reportDetails.max} characters.`),
];
