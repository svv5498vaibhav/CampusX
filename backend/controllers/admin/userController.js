import { matchedData } from 'express-validator';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as userManagementService from '../../services/admin/userManagementService.js';

const MESSAGES = { suspend: 'Account suspended.', unsuspend: 'Suspension lifted.', block: 'Account blocked.', activate: 'Account activated.', deactivate: 'Account deactivated.' };

export async function listUsers(req, res) {
  return sendSuccess(res, { message: 'Students', data: await userManagementService.listUsers(req.user, matchedData(req, { locations: ['query'] })) });
}

export async function getUser(req, res) {
  return sendSuccess(res, { message: 'Student', data: await userManagementService.getUserDetail(req.user, req.params.id) });
}

export async function changeStatus(req, res) {
  const body = matchedData(req, { locations: ['body'] });
  const data = await userManagementService.changeUserStatus(req.user, req.params.id, body);
  return sendSuccess(res, { message: MESSAGES[body.action] ?? 'Account updated.', data });
}
