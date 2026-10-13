import { body, param, query } from 'express-validator';
import { FOLLOW_RULES, MESSAGE_RULES } from '../data/socialOptions.js';
import { cleanText, isObjectIdString, singleSpaced } from './showcaseRules.js';

/*
 * Follows, blocks and direct messages. The student acting is always the signed-in one (req.user): no rule
 * here reads a follower, sender or participant id from the request. The only ids taken from a request are
 * the other student (URL) and the conversation (URL, checked against the viewer's own conversations).
 */

const userIdParam = () => param('userId').isMongoId().withMessage('Please choose a valid student.');
const conversationIdParam = () => param('conversationId').isMongoId().withMessage('Please choose a valid conversation.');
const limitRule = ({ default: defaultSize, max }) =>
  query('limit').default(defaultSize).isInt({ min: 1, max }).withMessage(`limit must be a whole number from 1 to ${max}.`).bail().toInt();

export const userRules = [userIdParam()];

export const relationListRules = [
  userIdParam(),
  limitRule(FOLLOW_RULES.pageSize),
  query('cursor').optional({ values: 'falsy' }).isMongoId().withMessage('That page link is not valid.'),
  query('search')
    .optional({ values: 'falsy' })
    .isString().withMessage('Search must be text.')
    .bail()
    .customSanitizer(singleSpaced)
    .isLength({ max: FOLLOW_RULES.searchMaxLength }).withMessage(`Search is limited to ${FOLLOW_RULES.searchMaxLength} characters.`),
];

export const followStatusRules = [
  query('ids')
    .isString().withMessage('Please list the students to check.')
    .bail()
    .customSanitizer((value) => [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))])
    .custom((ids) => ids.length >= 1 && ids.length <= FOLLOW_RULES.statusBatchMax).withMessage(`Please check 1 to ${FOLLOW_RULES.statusBatchMax} students at a time.`)
    .bail()
    .custom((ids) => ids.every(isObjectIdString)).withMessage('Please choose valid students.'),
];

export const inboxRules = [
  limitRule(MESSAGE_RULES.conversationPageSize),
  query('cursor').optional({ values: 'falsy' }).matches(/^\d{1,15}_[a-f\d]{24}$/i).withMessage('That page link is not valid.'),
];

export const openConversationRules = [body('userId').custom(isObjectIdString).withMessage('Please choose a valid student.')];

export const conversationRules = [conversationIdParam()];

export const historyRules = [
  conversationIdParam(),
  limitRule(MESSAGE_RULES.pageSize),
  query('before').optional({ values: 'falsy' }).isMongoId().withMessage('That page link is not valid.'),
];

export const sendMessageRules = [
  conversationIdParam(),
  body('text')
    .isString().withMessage('Message must be text.')
    .bail()
    // Control characters other than line breaks and tabs never belong in a message.
    .customSanitizer((value) => cleanText(value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')))
    .isLength({ min: 1 }).withMessage("You can't send an empty message.")
    .bail()
    .isLength({ max: MESSAGE_RULES.maxLength }).withMessage(`Messages can be up to ${MESSAGE_RULES.maxLength} characters.`),
  body('clientId')
    .optional({ values: 'null' })
    .isString().withMessage('clientId must be text.')
    .bail()
    .matches(new RegExp(`^[A-Za-z0-9_-]{8,${MESSAGE_RULES.clientIdMaxLength}}$`)).withMessage('clientId is not valid.'),
];
