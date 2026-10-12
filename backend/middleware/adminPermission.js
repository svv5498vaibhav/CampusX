import { PERMISSION_IDS, hasPermission } from '../config/adminConfig.js';
import { recordAccessDenied } from '../services/admin/auditService.js';
import ApiError from '../utils/ApiError.js';

/**
 * Allows the request only if the signed-in staff member's role grants every listed permission
 * (config/adminConfig.js ROLE_PERMISSIONS). Use after adminAuth:
 *
 *   router.get('/users', requirePermission(PERMISSIONS.MANAGE_USERS), handler)
 *
 * Refusals are 403 and go to the audit log (at most once per person and permission every few minutes).
 */
export function requirePermission(...permissions) {
  const unknown = permissions.filter((permission) => !PERMISSION_IDS.includes(permission));
  if (permissions.length === 0 || unknown.length > 0) {
    throw new Error(`requirePermission needs known permissions; got: ${permissions.join(', ') || 'none'}`);
  }

  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Please log in to continue.'));
    const missing = permissions.find((permission) => !hasPermission(req.user, permission));
    if (missing) {
      recordAccessDenied(req.user, { permission: missing, method: req.method, path: req.originalUrl, ip: req.ip });
      return next(ApiError.forbidden("Your role doesn't have access to this."));
    }
    return next();
  };
}
