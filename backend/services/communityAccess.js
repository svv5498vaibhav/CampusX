import CommunityMember from '../models/CommunityMember.js';

/*
 * Community access rules, shared by the community and post services. `viewer` is always the signed-in
 * student's user document from the database (req.user): college, branch and semester are read from it,
 * never from the request.
 */

export const MANAGER_ROLES = Object.freeze(['owner', 'moderator']);

/** The student's active memberships as Map(communityId → role). Loaded once per request. */
export async function viewerMemberships(viewer) {
  if (viewer.$locals?.communityRoles) return viewer.$locals.communityRoles;
  const rows = await CommunityMember.find({ user: viewer._id, status: 'active' }).select('community role').lean();
  const roles = new Map(rows.map((row) => [row.community.toString(), row.role]));
  if (viewer.$locals) viewer.$locals.communityRoles = roles;
  return roles;
}

/** Call after the student's memberships change within a request. */
export function forgetMemberships(viewer) {
  if (viewer.$locals) delete viewer.$locals.communityRoles;
}

/**
 * Whether the student's campus identity fits a community's scope:
 *   public      every CampusX student
 *   college     students at the community's college
 *   branch      students in its college + branch
 *   restricted  students in its college + branch + semester (a class)
 */
export function scopeAllows(community, viewer) {
  const sameCollege = Boolean(viewer.college) && viewer.college === community.college;
  const sameBranch = sameCollege && Boolean(viewer.branch) && viewer.branch === community.branch;
  switch (community.visibility) {
    case 'public':
      return true;
    case 'college':
      return sameCollege;
    case 'branch':
      return sameBranch;
    case 'restricted':
      return sameBranch && Boolean(viewer.semester) && viewer.semester === community.semester;
    default:
      return false;
  }
}

/** The same rules as a MongoDB filter, for listing communities. */
export function scopeFilter(viewer) {
  const allowed = [{ visibility: 'public' }];
  if (viewer.college) {
    allowed.push({ visibility: 'college', college: viewer.college });
    if (viewer.branch) {
      allowed.push({ visibility: 'branch', college: viewer.college, branch: viewer.branch });
      if (viewer.semester) {
        allowed.push({ visibility: 'restricted', college: viewer.college, branch: viewer.branch, semester: viewer.semester });
      }
    }
  }
  return { $or: allowed };
}
