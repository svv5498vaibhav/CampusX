import { matchedData } from 'express-validator';
import { FEEDBACK_ACTIONS } from '../config/recommendationConfig.js';
import * as recommendationService from '../services/recommendationService.js';
import { sendSuccess } from '../utils/apiResponse.js';

// Recommendations depend on who is asking: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');

/** GET /recommendations : the home page's "Recommended for you", a few sections and trending. */
export async function home(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Recommendations', data: await recommendationService.getPersonalizedHome(req.user) });
}

/** GET /recommendations/discover : every section for the Discover page. */
export async function discover(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Campus discovery', data: await recommendationService.getCampusDiscovery(req.user) });
}

/** GET /recommendations/<type> : one kind, a page at a time. */
export const list = (type) =>
  async function listRecommendations(req, res) {
    noStore(res);
    const { page, limit } = matchedData(req, { locations: ['query'] });
    return sendSuccess(res, { message: 'Recommendations', data: await recommendationService.getRecommendations(type, req.user, { page, limit }) });
  };

/** POST /recommendations/<type>/:id/dismiss : "Not interested" (or just hide this one). */
export const dismiss = (type) =>
  async function dismissRecommendation(req, res) {
    const { action } = matchedData(req, { locations: ['body'] });
    const data = await recommendationService.dismissRecommendation(req.user, type, req.params.id, action);
    const message = action === FEEDBACK_ACTIONS.NOT_INTERESTED ? "Got it. You'll see less like this." : 'Hidden from your recommendations.';
    return sendSuccess(res, { message, data });
  };

/** POST /recommendations/interactions : recommendations shown or opened (light analytics). */
export async function interactions(req, res) {
  const { action, items } = matchedData(req, { locations: ['body'] });
  const data = await recommendationService.recordInteractions(req.user, { action, items: items.map(({ type, id }) => ({ type, id })) });
  return sendSuccess(res, { message: 'Recorded', data });
}
