import { body } from 'express-validator';
import { NAME_MAX_LENGTH } from '../models/User.js';
import {
  canonicalSkillName,
  getCollege,
  isKnownInterest,
  isValidSemester,
  listBranches,
  onboardingRules,
} from '../services/campusOptionsService.js';

/*
 * Field rules shared by registration, onboarding and profile editing, so each field is
 * validated (and normalised) the same way everywhere. Every factory takes { optional }:
 * optional fields are only checked when present in the request.
 */

const { interests: INTEREST_LIMITS, skills: SKILL_LIMITS, rollNumber: ROLL_LIMITS } = onboardingRules;

// Letters from any language, plus spaces, hyphens, apostrophes and periods (e.g. "Anne-Marie", "D'Souza").
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
// Checked after normalisation (trimmed, single spaces, upper case).
const ROLL_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9 ./_-]*$/;
// Letters/digits in any script plus the symbols real skill names use: C++, C#, Node.js, UI/UX, R&D.
const SKILL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .+#&/_-]*$/u;

const isFilledString = (value) => typeof value === 'string' && value.length > 0;
const trimmed = (value) => (typeof value === 'string' ? value.trim() : value);
const singleSpaced = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
const capitalise = (label) => label[0].toUpperCase() + label.slice(1);

// Async custom validators must throw to fail; the message comes from .withMessage().
const assert = (condition) => {
  if (!condition) throw new Error('invalid');
  return true;
};

const field = (name, { optional = false } = {}) => {
  const chain = body(name);
  return optional ? chain.optional({ values: 'undefined' }) : chain;
};

export const nameRule = (name, label, options) =>
  field(name, options)
    .isString().withMessage(`Please enter your ${label}.`)
    .bail()
    .trim()
    .notEmpty().withMessage(`Please enter your ${label}.`)
    .bail()
    .isLength({ max: NAME_MAX_LENGTH }).withMessage(`${capitalise(label)} must be ${NAME_MAX_LENGTH} characters or fewer.`)
    .bail()
    .matches(NAME_PATTERN).withMessage(`${capitalise(label)} can only contain letters, spaces, hyphens and apostrophes.`);

export const collegeRule = (options) =>
  field('college', options)
    .customSanitizer(trimmed)
    .custom(isFilledString).withMessage('Please select your college.')
    .bail()
    .custom(async (collegeId) => assert(await getCollege(collegeId)))
    .withMessage('Please select a college from the list.');

/** `collegeOf(req)` says which college the branch must belong to (from the body, or the saved profile). */
export const branchRule = ({ collegeOf = (req) => req.body.college, ...options } = {}) =>
  field('branch', options)
    .customSanitizer(trimmed)
    .custom(isFilledString).withMessage('Please select your branch.')
    .bail()
    .custom(async (branchId, { req }) => assert((await listBranches(collegeOf(req))).some((branch) => branch.id === branchId)))
    .withMessage('Please select a branch from the list.');

export const semesterRule = (options) =>
  field('semester', options)
    .exists({ values: 'null' }).withMessage('Please select your semester.')
    .bail()
    // Accept 7 or "7"; always store the number.
    .customSanitizer((value) => (typeof value === 'string' && /^\d{1,2}$/.test(value.trim()) ? Number(value) : value))
    .custom(isValidSemester).withMessage('Please select a semester between 1 and 8.');

export const rollNumberRule = (options) =>
  field('rollNumber', options)
    .customSanitizer((value) => (typeof value === 'string' ? singleSpaced(value).toUpperCase() : value))
    .custom(isFilledString).withMessage('Please enter your roll number.')
    .bail()
    .isLength({ max: ROLL_LIMITS.maxLength }).withMessage(`Roll number must be ${ROLL_LIMITS.maxLength} characters or fewer.`)
    .bail()
    .matches(ROLL_NUMBER_PATTERN).withMessage('Roll number can only use letters, numbers, spaces and - / . _');

export const interestsRule = (options) =>
  field('interests', options)
    .custom(Array.isArray).withMessage('Please choose your interests.')
    .bail()
    .customSanitizer((list) => list.map((id) => (typeof id === 'string' ? id.trim().toLowerCase() : id)))
    .custom((list) => list.every(isFilledString)).withMessage('Please choose interests from the list.')
    .bail()
    .custom((list) => list.length >= INTEREST_LIMITS.min).withMessage(`Please choose at least ${INTEREST_LIMITS.min} interests.`)
    .bail()
    .custom((list) => list.length <= INTEREST_LIMITS.max).withMessage(`Please choose no more than ${INTEREST_LIMITS.max} interests.`)
    .bail()
    .custom((list) => new Set(list).size === list.length).withMessage('Each interest can only be chosen once.')
    .bail()
    .custom(async (list) => assert((await Promise.all(list.map(isKnownInterest))).every(Boolean)))
    .withMessage('Please choose interests from the list.');

/** Skills are always optional to fill in; a missing list (or null) is skipped. */
export const skillsRule = () =>
  body('skills')
    .optional({ values: 'null' })
    .custom(Array.isArray).withMessage('Skills must be a list.')
    .bail()
    .customSanitizer((list) => list.map((skill) => (typeof skill === 'string' ? canonicalSkillName(singleSpaced(skill)) : skill)))
    .custom((list) => list.length <= SKILL_LIMITS.max).withMessage(`You can add up to ${SKILL_LIMITS.max} skills.`)
    .bail()
    .custom((list) => list.every(isFilledString)).withMessage('Skills cannot be empty.')
    .bail()
    .custom((list) => list.every((skill) => skill.length <= SKILL_LIMITS.maxLength))
    .withMessage(`Each skill must be ${SKILL_LIMITS.maxLength} characters or fewer.`)
    .bail()
    .custom((list) => list.every((skill) => SKILL_PATTERN.test(skill)))
    .withMessage('Skills can use letters, numbers, spaces and + # . & / - _')
    .bail()
    .custom((list) => new Set(list.map((skill) => skill.toLowerCase())).size === list.length)
    .withMessage('Each skill can only be added once.');
