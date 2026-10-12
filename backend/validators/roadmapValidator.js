import { body, param } from 'express-validator';
import { CAREER_GOAL_IDS, MILESTONE_ID_PATTERN, MILESTONE_STATUSES, ROADMAP_SEMESTERS } from '../data/roadmapOptions.js';

/*
 * The roadmap always belongs to the signed-in student: nothing here reads a user id, and matchedData keeps
 * only the fields below, so extra body fields (user, userId, completedAt, ...) are ignored.
 */

const semesterValue = (value) => (typeof value === 'string' && /^\d{1,2}$/.test(value.trim()) ? Number(value) : value);
const isSemester = (value) => Number.isInteger(value) && value >= 1 && value <= ROADMAP_SEMESTERS;
const SEMESTER_MESSAGE = `Please choose a semester between 1 and ${ROADMAP_SEMESTERS}.`;

export const semesterParamRules = [param('semester').customSanitizer(semesterValue).custom(isSemester).withMessage(SEMESTER_MESSAGE)];

const milestoneIdRule = param('milestoneId').isString().bail().matches(MILESTONE_ID_PATTERN).withMessage('Milestone not found.');

export const completeMilestoneRules = [milestoneIdRule];

export const milestoneProgressRules = [
  milestoneIdRule,
  body('status').exists({ values: 'falsy' }).withMessage('Please choose a status.').bail().isIn(MILESTONE_STATUSES).withMessage(`Status must be one of: ${MILESTONE_STATUSES.join(', ')}.`),
];

export const preferencesRules = [
  body('careerGoal').optional({ values: 'undefined' }).isIn(CAREER_GOAL_IDS).withMessage('Please choose one of the listed career goals.'),
  body('selectedSemester').optional({ values: 'undefined' }).customSanitizer(semesterValue).custom(isSemester).withMessage(SEMESTER_MESSAGE),
  body().custom((value, { req }) => req.body?.careerGoal !== undefined || req.body?.selectedSemester !== undefined).withMessage('Nothing to update: send careerGoal or selectedSemester.'),
];
