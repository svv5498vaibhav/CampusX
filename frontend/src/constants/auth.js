export const ROLES = Object.freeze({
  STUDENT: 'student',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
});

/*
 * Non-secret hint ("this browser has signed in before") so the app only asks the API to
 * restore a session when one might exist. The actual credentials stay in the HttpOnly cookie.
 */
export const SESSION_HINT_KEY = 'campusx-has-session';

// Must match backend/validators/authValidators.js.
export const NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
// Typed to confirm account deletion. Must match backend/config/securityConfig.js ACCOUNT_DELETION.confirmationText.
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE';
