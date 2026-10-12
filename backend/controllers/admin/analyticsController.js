import { matchedData } from 'express-validator';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as analyticsService from '../../services/admin/analyticsService.js';

export async function getAnalytics(req, res) {
  return sendSuccess(res, { message: 'Analytics', data: await analyticsService.getAnalytics(req.user, matchedData(req, { locations: ['query'] })) });
}
