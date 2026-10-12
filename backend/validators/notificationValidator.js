import { body, query } from 'express-validator';
import { EDITABLE_CATEGORY_IDS, NOTIFICATION_RULES } from '../data/notificationOptions.js';
import { pageRules } from './showcaseRules.js';

/*
 * Notifications are always the signed-in student's own: no recipient, user or notification fields
 * are read from a request, except the notification id in the URL (checked against the owner).
 */

export const listRules = [
  ...pageRules(NOTIFICATION_RULES.pageSize),
  query('filter').default('all').isIn(['all', 'unread']).withMessage('Please choose all or unread.'),
];

export const preferencesRules = [
  body().custom((value) => value && typeof value === 'object' && !Array.isArray(value)).withMessage('Please send your preferences.'),
  body('system').optional().custom((value) => value === true).withMessage("CampusX updates can't be turned off."),
  ...EDITABLE_CATEGORY_IDS.map((id) => body(id).optional().custom((value) => typeof value === 'boolean').withMessage('Please choose on or off.')),
  body()
    .custom((value) => EDITABLE_CATEGORY_IDS.some((id) => value?.[id] !== undefined))
    .withMessage('Please change at least one preference.'),
];
