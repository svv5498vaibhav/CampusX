import { NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/constants/auth';

// Client-side checks are for quick feedback only; the API validates everything again.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;

export const PASSWORD_RULES = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (value) => value.length >= PASSWORD_MIN_LENGTH },
  { id: 'letter', label: 'At least one letter', test: (value) => /\p{L}/u.test(value) },
  { id: 'number', label: 'At least one number', test: (value) => /\d/.test(value) },
];

export function validateName(value, label) {
  const name = value.trim();
  if (!name) return `Please enter your ${label}.`;
  const capitalised = label[0].toUpperCase() + label.slice(1);
  if (name.length > NAME_MAX_LENGTH) return `${capitalised} must be ${NAME_MAX_LENGTH} characters or fewer.`;
  if (!NAME_PATTERN.test(name)) return `${capitalised} can only contain letters, spaces, hyphens and apostrophes.`;
  return undefined;
}

function validateEmail(value) {
  const email = value.trim();
  if (!email) return 'Please enter your email.';
  if (!EMAIL_PATTERN.test(email)) return 'Please enter a valid email.';
  return undefined;
}

function validateNewPassword(value) {
  if (!value) return 'Please enter a password.';
  if (value.length < PASSWORD_MIN_LENGTH) return `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  if (!PASSWORD_RULES.every((rule) => rule.test(value))) return 'Password must include at least one letter and one number.';
  return undefined;
}

export function validateLoginForm({ email, password }) {
  return {
    email: validateEmail(email),
    password: password ? undefined : 'Please enter your password.',
  };
}

const validateConfirmation = (confirmPassword, password) =>
  !confirmPassword ? 'Please confirm your password.' : confirmPassword !== password ? 'Passwords do not match.' : undefined;

export function validateChangePasswordForm({ currentPassword, newPassword, confirmPassword }) {
  return {
    currentPassword: currentPassword ? undefined : 'Please enter your current password.',
    newPassword:
      validateNewPassword(newPassword) ??
      (newPassword === currentPassword ? 'Choose a new password that is different from your current one.' : undefined),
    confirmPassword: validateConfirmation(confirmPassword, newPassword),
  };
}

export function validateRegisterForm({ firstName, lastName, email, password, confirmPassword }) {
  return {
    firstName: validateName(firstName, 'first name'),
    lastName: validateName(lastName, 'last name'),
    email: validateEmail(email),
    password: validateNewPassword(password),
    confirmPassword: validateConfirmation(confirmPassword, password),
  };
}
