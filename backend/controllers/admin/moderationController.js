import { matchedData } from 'express-validator';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as moderationService from '../../services/admin/moderationService.js';

const queryOf = (req) => matchedData(req, { locations: ['query'] });
const bodyOf = (req) => matchedData(req, { locations: ['body'] });

export async function listCases(req, res) {
  return sendSuccess(res, { message: 'Moderation queue', data: await moderationService.listModerationQueue(req.user, queryOf(req)) });
}

export async function getCase(req, res) {
  return sendSuccess(res, { message: 'Moderation case', data: await moderationService.getModerationCase(req.user, req.params.id) });
}

export async function decideCase(req, res) {
  const data = await moderationService.decideModerationCase(req.user, req.params.id, bodyOf(req));
  return sendSuccess(res, { message: 'Case updated.', data });
}

export async function revealAuthor(req, res) {
  const data = await moderationService.revealAnonymousAuthor(req.user, req.params.id, bodyOf(req));
  return sendSuccess(res, { message: 'Author revealed. This lookup was recorded in the audit log.', data });
}
