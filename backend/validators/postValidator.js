import { body, query } from 'express-validator';
import {
  FEED_FILTER_IDS,
  POST_RULES,
  POST_TYPE_IDS,
  POST_VISIBILITY_IDS,
  REPORT_REASON_IDS,
} from '../data/postOptions.js';

/*
 * Only the fields listed here reach the services (controllers read them with matchedData), so an
 * author, likes, counts or moderation status sent by the client are simply ignored.
 * Fields arrive as JSON or as multipart form fields (when photos/videos are attached).
 */

// Normalise line endings and squeeze runs of blank lines.
const cleanText = (text) => text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const postContentRule = () =>
  body('content')
    .optional({ values: 'undefined' })
    .isString().withMessage('Post content must be text.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ max: POST_RULES.content.maxLength })
    .withMessage(`Posts can be up to ${POST_RULES.content.maxLength} characters.`);

const postTypeRule = () =>
  body('type')
    .optional({ values: 'undefined' })
    .isIn(POST_TYPE_IDS).withMessage('Please choose a valid post type.');

const visibilityRule = () =>
  body('visibility')
    .optional({ values: 'undefined' })
    .isIn(POST_VISIBILITY_IDS).withMessage('Please choose who can see this post.');

const isObjectIdString = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export const createPostRules = [
  postContentRule(),
  postTypeRule(),
  visibilityRule(),
  // Posting inside a community (membership is checked by the post service).
  body('community').optional({ values: 'falsy' }).custom(isObjectIdString).withMessage('Please choose a valid community.'),
];

export const updatePostRules = [
  postContentRule(),
  postTypeRule(),
  visibilityRule(),
  // Ids of the post's existing photos/videos to keep. A JSON list in multipart requests.
  body('keepMedia')
    .optional({ values: 'undefined' })
    .customSanitizer((value) => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    })
    .custom((list) => Array.isArray(list) && list.length <= POST_RULES.media.maxImages && list.every(isObjectIdString))
    .withMessage('keepMedia must be a list of media ids.'),
];

const pageRules = ({ default: defaultSize, max }) => [
  query('page')
    .default(1)
    .isInt({ min: 1, max: 1000 }).withMessage('page must be a whole number from 1 to 1000.')
    .bail()
    .toInt(),
  query('limit')
    .default(defaultSize)
    .isInt({ min: 1, max }).withMessage(`limit must be a whole number from 1 to ${max}.`)
    .bail()
    .toInt(),
];

export const listPostsRules = [
  ...pageRules(POST_RULES.pageSize),
  query('filter')
    .default('all')
    .isIn(FEED_FILTER_IDS).withMessage('Please choose a valid feed filter.'),
];

export const listCommentsRules = pageRules(POST_RULES.commentPageSize);

export const commentRules = [
  body('content')
    .isString().withMessage('Comment must be text.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ min: 1 }).withMessage('Comment cannot be empty.')
    .bail()
    .isLength({ max: POST_RULES.comment.maxLength })
    .withMessage(`Comments can be up to ${POST_RULES.comment.maxLength} characters.`),
];

export const reportPostRules = [
  body('reason').isIn(REPORT_REASON_IDS).withMessage('Please choose a reason for your report.'),
  body('details')
    .optional({ values: 'falsy' })
    .isString().withMessage('Details must be text.')
    .bail()
    .customSanitizer(cleanText)
    .isLength({ max: POST_RULES.reportDetails.maxLength })
    .withMessage(`Please keep details to ${POST_RULES.reportDetails.maxLength} characters.`),
];
