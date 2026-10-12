import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as moderationCaseService from '../services/moderationCaseService.js';

// Internal moderation data: never cached.
const noStore = (res) => res.set('Cache-Control', 'no-store');

export async function listCases(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Moderation cases', data: await moderationCaseService.listCases(req.user, matchedData(req, { locations: ['query'] })) });
}

export async function getCase(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Moderation case', data: await moderationCaseService.getCase(req.user, req.params.id) });
}

export async function decideCase(req, res) {
  noStore(res);
  const data = await moderationCaseService.decideCase(req.user, req.params.id, matchedData(req, { locations: ['body'] }));
  return sendSuccess(res, { message: 'Case updated.', data });
}
