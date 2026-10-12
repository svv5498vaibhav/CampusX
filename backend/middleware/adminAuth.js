import { STAFF_ROLES, permissionsFor } from '../config/adminConfig.js';
import { invalidateAdminCaches } from '../services/admin/adminCache.js';
import { recordAccessDenied } from '../services/admin/auditService.js';
import ApiError from '../utils/ApiError.js';
import { authenticate } from './authMiddleware.js';
import { adminRateLimiter } from './rateLimiter.js';
import { requireDatabase } from './requireDatabase.js';

/*
 * The gate in front of every /api/v1/admin route, in this order:
 *
 *   database up → valid access token + live session + active account (authenticate, the same JWT system
 *   as the rest of CampusX) → a staff role from the database (403 for students, logged) → the per-staff
 *   request limit → request context (no caching, audit address, permissions)
 *
 * Each route then asks for the permission it needs (middleware/adminPermission.js), and each admin
 * service checks that permission again.
 */

export const STAFF_AREA = 'ADMIN_AREA';

/** Students (and any role without staff rights) get 403 before anything else runs. */
export function requireStaff(req, res, next) {
  if (!STAFF_ROLES.includes(req.user?.role)) {
    recordAccessDenied(req.user, { permission: STAFF_AREA, method: req.method, path: req.originalUrl, ip: req.ip });
    return next(ApiError.forbidden('This area is for CampusX staff.'));
  }
  return next();
}

/**
 * Admin data is never cached by browsers; every audit row written during the request carries the caller's
 * address; a successful change clears the admin statistics caches so the next view agrees with it.
 */
export function adminContext(req, res, next) {
  res.set('Cache-Control', 'no-store');
  req.user.$locals.auditIp = req.ip;
  req.permissions = permissionsFor(req.user.role);
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) invalidateAdminCaches();
    });
  }
  return next();
}

export const adminAuth = [requireDatabase, authenticate, requireStaff, adminRateLimiter, adminContext];

