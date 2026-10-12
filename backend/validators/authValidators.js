import { body } from 'express-validator';
import { PASSWORD_MAX_BYTES } from '../config/auth.js';
import { EMAIL_MAX_LENGTH } from '../models/User.js';
import { nameRule } from './fieldRules.js';

// A short list of passwords that pass the basic rules but are guessed first by attackers.
const COMMON_PASSWORDS = new Set([
  'password1', 'password12', 'password123', 'passw0rd', 'qwerty123', 'qwerty1234', 'abc12345',
  'abcd1234', 'iloveyou1', 'welcome1', 'welcome123', 'admin123', 'letmein1', '1q2w3e4r',
  'campusx1', 'campusx123', 'student1', 'student123', 'college123', 'test1234',
]);

const lowercaseTrimmed = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// Normalised as trim + lowercase only, so the stored address is exactly what the student typed.
const emailRule = () =>
  body('email')
    .isString().withMessage('Please enter your email.')
    .bail()
    .customSanitizer(lowercaseTrimmed)
    .notEmpty().withMessage('Please enter your email.')
    .bail()
    .isLength({ max: EMAIL_MAX_LENGTH }).withMessage('Please enter a valid email.')
    .bail()
    .isEmail().withMessage('Please enter a valid email.');

/** The password policy for a new password (sign-up and password change). */
const newPasswordRule = (field) =>
  body(field)
    .isString().withMessage('Please enter a password.')
    .bail()
    .isLength({ min: 8 }).withMessage('Password must contain at least 8 characters.')
    .bail()
    .custom((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES)
    .withMessage(`Password must be ${PASSWORD_MAX_BYTES} characters or fewer.`)
    .bail()
    .custom((value) => /\p{L}/u.test(value) && /\d/.test(value))
    .withMessage('Password must include at least one letter and one number.')
    .bail()
    .custom((value) => !COMMON_PASSWORDS.has(value.toLowerCase()))
    .withMessage('This password is too common. Please choose another one.');

const confirmRule = (field) =>
  body('confirmPassword')
    .isString().withMessage('Please confirm your password.')
    .bail()
    .custom((value, { req }) => value === req.body[field])
    .withMessage('Passwords do not match.');

export const registerRules = [
  nameRule('firstName', 'first name'),
  nameRule('lastName', 'last name'),
  emailRule(),
  newPasswordRule('password'),
  confirmRule('password'),
];

// Changing the password of a signed-in account: the current password, then a new one under the same policy.
export const changePasswordRules = [
  body('currentPassword')
    .isString().withMessage('Please enter your current password.')
    .bail()
    .notEmpty().withMessage('Please enter your current password.')
    .bail()
    .custom((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES)
    .withMessage('Your current password is incorrect.'),
  newPasswordRule('newPassword'),
  confirmRule('newPassword'),
];

// Login only checks shape. Strength rules apply at sign-up, so a policy change never locks out
// existing accounts.
export const loginRules = [
  emailRule(),
  body('password')
    .isString().withMessage('Please enter your password.')
    .bail()
    .notEmpty().withMessage('Please enter your password.')
    .bail()
    .custom((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES)
    .withMessage('Invalid email or password.'),
];
