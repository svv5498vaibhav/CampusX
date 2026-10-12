import { matchedData } from 'express-validator';
import { sendSuccess } from '../../utils/apiResponse.js';
import { sessionFor } from '../../services/admin/adminAccess.js';
import * as dashboardService from '../../services/admin/dashboardService.js';

// Every admin response is sent with Cache-Control: no-store (middleware/adminAuth.js).
const queryOf = (req) => matchedData(req, { locations: ['query'] });

/** The signed-in staff member's role and permissions: the control center shows only what these allow. */
export function getSession(req, res) {
  return sendSuccess(res, { message: 'Admin session', data: sessionFor(req.user) });
}

export function getSystemStatus(req, res) {
  return sendSuccess(res, { message: 'System status', data: dashboardService.getSystemStatus(req.user) });
}

export async function getDashboard(req, res) {
  return sendSuccess(res, { message: 'Dashboard', data: await dashboardService.getDashboard(req.user, queryOf(req)) });
}
