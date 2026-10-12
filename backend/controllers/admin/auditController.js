import { matchedData } from 'express-validator';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as auditService from '../../services/admin/auditService.js';

export async function listAuditLogs(req, res) {
  return sendSuccess(res, { message: 'Audit log', data: await auditService.listAuditLogs(req.user, matchedData(req, { locations: ['query'] })) });
}
