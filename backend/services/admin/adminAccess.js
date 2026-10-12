import { STAFF_ROLES, hasPermission, permissionsFor } from '../../config/adminConfig.js';
import User from '../../models/User.js';
import ApiError from '../../utils/ApiError.js';
import { getBranch, getCollege } from '../campusOptionsService.js';

/*
 * Shared by every admin service. The routes check permissions first (middleware/adminPermission.js);
 * services check again, so no admin function can be reached by a caller that skipped the middleware.
 */

export const isStaff = (user) => STAFF_ROLES.includes(user?.role);

export function assertPermission(actor, permission) {
  if (!hasPermission(actor, permission)) throw ApiError.forbidden("Your role doesn't have access to this.");
}

/** What the control center needs to know about the signed-in staff member. */
export const sessionFor = (user) => ({
  user: { id: user._id.toString(), firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl ?? null, role: user.role },
  role: user.role,
  permissions: [...permissionsFor(user.role)],
});

export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const truncate = (text, length) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
};
export const pageOf = (page, limit, total) => ({ page, limit, total, hasMore: page * limit < total });

/** College and branch display names for option ids (unknown ids are kept as ids). */
export async function campusLabels(collegeId, branchId) {
  const [college, branch] = await Promise.all([collegeId ? getCollege(collegeId) : null, branchId ? getBranch(branchId) : null]);
  return {
    college: collegeId ? { id: collegeId, name: college?.name ?? collegeId, shortName: college?.aliases?.[0] ?? college?.name ?? collegeId } : null,
    branch: branchId ? { id: branchId, name: branch?.name ?? branchId, shortName: branch?.shortName ?? branch?.name ?? branchId } : null,
  };
}

/**
 * Short identities for staff screens, any account status (unlike profileService.getStudentSummaries,
 * which leaves out suspended accounts). Name, photo, role, status and campus only: never emails or
 * anything private. Keyed by id.
 */
export async function peopleById(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select('firstName lastName avatarUrl role status college branch semester').lean();
  const people = await Promise.all(
    users.map(async (user) => ({
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`.trim(),
      avatarUrl: user.avatarUrl ?? null,
      role: user.role,
      status: user.status,
      semester: user.semester ?? null,
      ...(await campusLabels(user.college, user.branch)),
    })),
  );
  return new Map(people.map((person) => [person.id, person]));
}
