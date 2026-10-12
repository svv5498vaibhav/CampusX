import { matchedData } from 'express-validator';
import { getOnboardingOptions } from '../services/campusOptionsService.js';
import { getOnboardingStatus, saveOnboarding } from '../services/onboardingService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export function getStatus(req, res) {
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, { message: 'Onboarding status', data: getOnboardingStatus(req.user) });
}

export async function getOptions(req, res) {
  // Same for every student and rarely changes; a short private cache saves repeat requests.
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Onboarding options', data: await getOnboardingOptions() });
}

export async function save(req, res) {
  // Only fields that passed validation (already normalised) reach the service. Anything else in
  // the body, such as userId, role or onboardingCompleted, is ignored.
  const { college, branch, semester, rollNumber, interests, skills = [] } = matchedData(req, { locations: ['body'] });
  const user = await saveOnboarding(req.user.id, { college, branch, semester, rollNumber, interests, skills });
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, { message: 'Your campus identity is all set.', data: { user } });
}
