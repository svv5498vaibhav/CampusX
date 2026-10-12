import { matchedData } from 'express-validator';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as contentManagementService from '../../services/admin/contentManagementService.js';

const MESSAGES = { suspend: 'Community suspended.', restore: 'Community restored.', remove: 'Community removed.' };

export async function listCommunities(req, res) {
  return sendSuccess(res, { message: 'Communities', data: await contentManagementService.listCommunities(req.user, matchedData(req, { locations: ['query'] })) });
}

export async function actOnCommunity(req, res) {
  const body = matchedData(req, { locations: ['body'] });
  const data = await contentManagementService.actOnCommunity(req.user, req.params.id, body);
  return sendSuccess(res, { message: MESSAGES[body.action] ?? 'Community updated.', data });
}
