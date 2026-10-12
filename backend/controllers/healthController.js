import { getHealthStatus } from '../services/healthService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export function getHealth(req, res) {
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, { message: 'CampusX API is running', data: getHealthStatus() });
}
