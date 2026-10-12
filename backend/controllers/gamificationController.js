import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as gamificationService from '../services/gamificationService.js';

// Points depend on who is asking: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export function rules(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'How points work', data: gamificationService.getRules() });
}

export async function myGamification(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your campus journey', data: await gamificationService.getGamificationProfile(req.user) });
}

export async function transactions(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your points history', data: await gamificationService.listTransactions(req.user, queryOf(req)) });
}

export async function badges(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Badges', data: await gamificationService.listBadges(req.user) });
}
