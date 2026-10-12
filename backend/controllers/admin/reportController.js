import { matchedData } from 'express-validator';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as reportService from '../../services/admin/reportService.js';

const MESSAGES = { review: 'Report marked as under review.', resolve: 'Report resolved.', reject: 'Report rejected.', escalate: 'Report escalated.' };

export async function listReports(req, res) {
  return sendSuccess(res, { message: 'Reports', data: await reportService.listReports(req.user, matchedData(req, { locations: ['query'] })) });
}

export async function getReport(req, res) {
  return sendSuccess(res, { message: 'Report', data: await reportService.getReport(req.user, req.params.id) });
}

export async function actOnReport(req, res) {
  const body = matchedData(req, { locations: ['body'] });
  const data = await reportService.actOnReport(req.user, req.params.id, body);
  return sendSuccess(res, { message: MESSAGES[body.action] ?? 'Report updated.', data });
}
