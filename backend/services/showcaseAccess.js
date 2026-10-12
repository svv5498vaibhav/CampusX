import { PUBLIC_STATUSES } from '../config/moderationConfig.js';

/*
 * Visibility for projects and achievements. `viewer` is always the signed-in student's user document
 * from the database (req.user); their college is read from it, never from the request.
 *
 *   public, campus  any signed-in CampusX student
 *   college         students at the owner's college (kept on the item as audience.college)
 *   private         the owner only
 *
 * Trust & Safety: other students only see items in good standing (approved or flagged; items saved before
 * moderation existed have no status and count as approved). Owners keep seeing their own items while
 * they're held for review, but not once they're removed.
 */

/** Items other students may see, by moderation status. */
export const IN_GOOD_STANDING = Object.freeze({ moderationStatus: { $in: [...PUBLIC_STATUSES, null] } });

/** MongoDB filter for items the viewer may see. `extra` adds clauses (e.g. a project's teammates). */
export function showcaseVisibleTo(viewer, extra = []) {
  const audiences = [{ visibility: { $in: ['public', 'campus'] } }, ...extra];
  if (viewer.college) audiences.push({ visibility: 'college', 'audience.college': viewer.college });
  return { $or: [{ owner: viewer._id, moderationStatus: { $ne: 'removed' } }, { $and: [IN_GOOD_STANDING, { $or: audiences }] }] };
}

/** Changing a URL field to "" removes it; other values are saved as given. */
export function splitUnset(changes, fields) {
  const set = {};
  const unset = {};
  for (const [key, value] of Object.entries(changes)) {
    if (fields.includes(key) && value === '') unset[key] = 1;
    else set[key] = value;
  }
  return { set, unset };
}
