import User, { toSafeUser } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';

export const ROLL_NUMBER_TAKEN =
  'This roll number is already registered at your college. If it is yours, please contact CampusX support.';

export function getOnboardingStatus(user) {
  return { completed: Boolean(user.onboardingCompleted) };
}

/**
 * College and roll number are campus identity: editable until the account is verified, then only by
 * CampusX staff. Both ways of saving them (onboarding and profile editing) go through this check.
 */
export function assertIdentityUnlocked(user, { college, rollNumber }) {
  const changesIdentity = (college !== undefined && college !== user.college) || (rollNumber !== undefined && rollNumber !== user.rollNumber);
  if (user.isVerified && changesIdentity) {
    throw ApiError.forbidden('Your campus identity is verified. Contact CampusX support to change your college or roll number.');
  }
}

/**
 * Saves the campus identity for the signed-in student. `userId` always comes from the
 * authenticated session, never from the request body, so a student can only change their own
 * account. The first successful save completes onboarding; later saves update the details and
 * keep the original completion time.
 */
export async function saveOnboarding(userId, { college, branch, semester, rollNumber, interests, skills }) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Please log in to continue.');
  // Onboarding can be saved again later; a verified identity stays locked here too.
  assertIdentityUnlocked(user, { college, rollNumber });

  Object.assign(user, { college, branch, semester, rollNumber, interests, skills });
  const firstTime = !user.onboardingCompleted;
  if (firstTime) {
    user.onboardingCompleted = true;
    user.onboardingCompletedAt = new Date();
  }

  try {
    await user.save();
  } catch (error) {
    if (error?.code === 11000 && error.keyPattern?.rollNumber) {
      throw ApiError.conflict(ROLL_NUMBER_TAKEN, [{ field: 'rollNumber', message: ROLL_NUMBER_TAKEN }]);
    }
    throw error;
  }

  emitCampusEvent(CAMPUS_EVENTS.STUDENT_PROFILE_CHANGED, { userId: user.id });
  if (firstTime) emitCampusEvent(CAMPUS_EVENTS.STUDENT_ONBOARDED, { userId: user.id });
  return toSafeUser(user);
}
