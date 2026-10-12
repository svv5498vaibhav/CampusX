import { matchedData } from 'express-validator';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as contentManagementService from '../../services/admin/contentManagementService.js';

const MESSAGES = { approve: 'Approved.', flag: 'Flagged for review.', restrict: 'Restricted.', remove: 'Removed.', verify: 'Achievement verified.', reject: 'Proof rejected.' };

export async function listContent(req, res) {
  return sendSuccess(res, { message: 'Content', data: await contentManagementService.listContent(req.user, matchedData(req, { locations: ['query'] })) });
}

export async function actOnContent(req, res) {
  const body = matchedData(req, { locations: ['body'] });
  const data = await contentManagementService.actOnContent(req.user, req.params.type, req.params.id, body);
  return sendSuccess(res, { message: MESSAGES[body.action] ?? 'Updated.', data });
}
