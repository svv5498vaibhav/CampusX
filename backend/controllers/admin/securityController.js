import { getSecurityStatus } from '../../services/admin/securityStatusService.js';
import { sendSuccess } from '../../utils/apiResponse.js';

/** GET /admin/security/status: protections, limits and recent security events. No secrets. */
export async function getStatus(req, res) {
  return sendSuccess(res, { message: 'Security status', data: await getSecurityStatus(req.user) });
}
