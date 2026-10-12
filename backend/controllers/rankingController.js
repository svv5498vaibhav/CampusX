import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as rankingService from '../services/rankingService.js';

// Rankings and points depend on who is asking: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const queryOf = (req) => matchedData(req, { locations: ['query'] });

/** GET /rankings/:scope (overall, college, branch, semester). */
export const leaderboard = (scope) => async (req, res) => {
  noStore(res);
  return sendSuccess(res, { message: 'Leaderboard', data: await rankingService.getLeaderboard(req.user, { ...queryOf(req), scope }) });
};

/** GET /rankings/weekly and /rankings/monthly: the campus-wide leaderboard for the current week or month. */
export const periodLeaderboard = (period) => async (req, res) => {
  noStore(res);
  return sendSuccess(res, { message: 'Leaderboard', data: await rankingService.getLeaderboard(req.user, { ...queryOf(req), scope: 'overall', period }) });
};

export async function myRanks(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your campus position', data: await rankingService.getMyRanks(req.user) });
}
