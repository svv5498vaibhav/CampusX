import { body, param, query } from 'express-validator';
import {
  ADMIN_PAGE_SIZE,
  ANALYTICS_RANGES,
  AUDIT_ACTOR_ROLES,
  AUDIT_CATEGORY_IDS,
  CASE_ACTIONS,
  CASE_ACTION_IDS,
  COMMUNITY_ACTIONS,
  COMMUNITY_ACTION_IDS,
  CONTENT_ACTIONS,
  CONTENT_ACTION_IDS,
  CONTENT_TYPE_IDS,
  REASON_RULES,
  REPORT_ACTION_IDS,
  REVEAL_REASON_RULES,
  USER_STATUS_ACTIONS,
  USER_STATUS_ACTION_IDS,
} from '../config/adminConfig.js';
import { CASE_STATUSES, CASE_TARGET_TYPES, CONTENT_STATUSES, PRIORITIES, REPORT_REASON_IDS, REPORT_STATUSES, REPORT_TARGET_IDS, RISK_LEVEL_IDS } from '../config/moderationConfig.js';
import { COMMUNITY_STATUSES, COMMUNITY_TYPE_IDS } from '../data/communityOptions.js';
import { VERIFICATION_STATUSES } from '../data/showcaseOptions.js';
import { ACCOUNT_STATUSES, ROLES } from '../models/User.js';
import { getBranch, getCollege } from '../services/campusOptionsService.js';
import { mongoIdParam } from './commonValidators.js';
import { cleanText, pageRules, searchRule } from './showcaseRules.js';

/*
 * Admin control center requests. Only the fields named here reach the admin services (controllers read
 * them with matchedData). Dangerous actions must carry confirm: true (the control center asks first)
 * and, where config/adminConfig.js says so, a reason that goes into the audit log.
 */

const MARKUP = /<\s*\/?\s*[a-z!?]/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

const page = () => pageRules(ADMIN_PAGE_SIZE);
const optionalIn = (field, values, message) => query(field).optional({ values: 'falsy' }).isIn(values).withMessage(message);
const refreshRule = () => query('refresh').default('false').isIn(['true', 'false']).withMessage('refresh must be true or false.').bail().toBoolean();

/** A date (YYYY-MM-DD or full ISO time). `to` dates without a time mean the end of that day. */
const dateQuery = (field, { endOfDay = false } = {}) =>
  query(field)
    .optional({ values: 'falsy' })
    .custom((value) => typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)))
    .withMessage(`${field} must be a date (YYYY-MM-DD).`)
    .bail()
    .customSanitizer((value) => (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value)));

/** A typed reason or note: plain text, required (min length) when `required(req)` says so. */
const reasonRule = (field, required, { min = REASON_RULES.min, max = REASON_RULES.max } = {}) =>
  body(field)
    .customSanitizer((value) => (typeof value === 'string' ? cleanText(value) : value))
    .custom((value, { req }) => {
      if (value === undefined || value === null || value === '') {
        if (required(req)) throw new Error(`Please give a reason (at least ${min} characters). It is kept in the audit log.`);
        return true;
      }
      if (typeof value !== 'string') throw new Error('The reason must be text.');
      if (value.length > max) throw new Error(`Please keep the reason to ${max} characters.`);
      if (required(req) && value.length < min) throw new Error(`Please give a reason (at least ${min} characters). It is kept in the audit log.`);
      if (MARKUP.test(value)) throw new Error("Please don't include HTML or code tags.");
      return true;
    });

/** confirm: true, required when the chosen action is a dangerous one. */
const confirmRule = (needsConfirm) =>
  body('confirm')
    .custom((value, { req }) => !needsConfirm(req) || value === true)
    .withMessage('Please confirm this action.');

const rule = (actions, field = 'action') => (req) => actions[req.body?.[field]] ?? {};

// ----------------------------------------------------------------------------- dashboard, analytics, audit

export const dashboardRules = [refreshRule()];

export const analyticsRules = [query('range').default('30d').isIn(Object.keys(ANALYTICS_RANGES)).withMessage('Choose 7d, 30d or 90d.'), refreshRule()];

export const auditLogRules = [
  ...pageRules({ default: 25, max: 100 }),
  optionalIn('category', AUDIT_CATEGORY_IDS, 'Please choose a valid category.'),
  optionalIn('actorRole', AUDIT_ACTOR_ROLES, 'Please choose a valid role.'),
  query('action').optional({ values: 'falsy' }).matches(/^[A-Z_]{2,60}$/).withMessage('Please choose a valid action.'),
  optionalIn('targetType', CASE_TARGET_TYPES, 'Please choose a valid target type.'),
  query('targetId').optional({ values: 'falsy' }).isMongoId().withMessage('targetId must be a valid id.'),
  query('actorId').optional({ values: 'falsy' }).isMongoId().withMessage('actorId must be a valid id.'),
  dateQuery('from'),
  dateQuery('to', { endOfDay: true }),
];

// ----------------------------------------------------------------------------- moderation

export const listModerationRules = [
  ...page(),
  query('status').default('active').isIn(['active', 'all', ...CASE_STATUSES]).withMessage('Please choose a valid case status.'),
  optionalIn('riskLevel', RISK_LEVEL_IDS, 'Please choose a valid risk level.'),
  optionalIn('targetType', CASE_TARGET_TYPES, 'Please choose a valid content type.'),
  optionalIn('priority', [...PRIORITIES, 'urgent'], 'Please choose a valid priority.'),
  query('sort').default('priority').isIn(['priority', 'newest']).withMessage('Sort by priority or newest.'),
  dateQuery('from'),
  dateQuery('to', { endOfDay: true }),
];

export const caseIdRules = [mongoIdParam('id')];

export const decideCaseRules = [
  mongoIdParam('id'),
  body('decision').isIn(CASE_ACTION_IDS).withMessage(`Choose one of: ${CASE_ACTION_IDS.join(', ')}.`),
  reasonRule('note', (req) => Boolean(rule(CASE_ACTIONS, 'decision')(req).reason)),
  confirmRule((req) => Boolean(rule(CASE_ACTIONS, 'decision')(req).confirm)),
];

export const revealAuthorRules = [mongoIdParam('id'), reasonRule('reason', () => true, REVEAL_REASON_RULES)];

// ----------------------------------------------------------------------------- reports

export const listReportsRules = [
  ...page(),
  query('status').default('pending').isIn(['all', 'high', ...REPORT_STATUSES]).withMessage('Please choose a valid report status.'),
  optionalIn('priority', PRIORITIES, 'Please choose a valid priority.'),
  optionalIn('targetType', REPORT_TARGET_IDS, 'Please choose a valid target type.'),
  optionalIn('reason', REPORT_REASON_IDS, 'Please choose a valid reason.'),
];

export const reportIdRules = [mongoIdParam('id')];

export const reportActionRules = [
  mongoIdParam('id'),
  body('action').isIn(REPORT_ACTION_IDS).withMessage(`Choose one of: ${REPORT_ACTION_IDS.join(', ')}.`),
  reasonRule('note', () => false),
];

// ----------------------------------------------------------------------------- users

export const listUsersRules = [
  ...page(),
  searchRule(),
  optionalIn('status', Object.values(ACCOUNT_STATUSES), 'Please choose a valid status.'),
  optionalIn('role', Object.values(ROLES), 'Please choose a valid role.'),
  query('college').optional({ values: 'falsy' }).custom(async (id) => Boolean(await getCollege(id)) || Promise.reject(new Error('unknown'))).withMessage('Please choose a college from the list.'),
  query('branch').optional({ values: 'falsy' }).custom(async (id) => Boolean(await getBranch(id)) || Promise.reject(new Error('unknown'))).withMessage('Please choose a branch from the list.'),
  query('sort').default('newest').isIn(['newest', 'oldest', 'name', 'lastLogin']).withMessage('Please choose a valid sort.'),
];

export const userIdRules = [mongoIdParam('id')];

export const userStatusRules = [
  mongoIdParam('id'),
  body('action').isIn(USER_STATUS_ACTION_IDS).withMessage(`Choose one of: ${USER_STATUS_ACTION_IDS.join(', ')}.`),
  reasonRule('reason', (req) => Boolean(rule(USER_STATUS_ACTIONS)(req).reason)),
  confirmRule((req) => Boolean(rule(USER_STATUS_ACTIONS)(req).confirm)),
];

// ----------------------------------------------------------------------------- content and communities

export const listContentRules = [
  ...page(),
  searchRule(),
  query('type').default('post').isIn(CONTENT_TYPE_IDS).withMessage('Please choose a content type.'),
  query('status').default('all').isIn(['all', ...CONTENT_STATUSES]).withMessage('Please choose a valid status.'),
  optionalIn('verification', VERIFICATION_STATUSES, 'Please choose a valid verification status.'),
];

export const contentActionRules = [
  param('type').isIn(CONTENT_TYPE_IDS).withMessage('Please choose a content type.'),
  mongoIdParam('id'),
  body('action').isIn(CONTENT_ACTION_IDS).withMessage(`Choose one of: ${CONTENT_ACTION_IDS.join(', ')}.`),
  reasonRule('reason', (req) => Boolean(rule(CONTENT_ACTIONS)(req).reason)),
  confirmRule((req) => Boolean(rule(CONTENT_ACTIONS)(req).confirm)),
];

export const listCommunitiesRules = [
  ...page(),
  searchRule(),
  optionalIn('type', COMMUNITY_TYPE_IDS, 'Please choose a community type.'),
  optionalIn('status', COMMUNITY_STATUSES, 'Please choose active or archived.'),
  optionalIn('moderation', CONTENT_STATUSES, 'Please choose a valid moderation status.'),
];

export const communityActionRules = [
  mongoIdParam('id'),
  body('action').isIn(COMMUNITY_ACTION_IDS).withMessage(`Choose one of: ${COMMUNITY_ACTION_IDS.join(', ')}.`),
  reasonRule('reason', (req) => Boolean(rule(COMMUNITY_ACTIONS)(req).reason)),
  confirmRule((req) => Boolean(rule(COMMUNITY_ACTIONS)(req).confirm)),
];
