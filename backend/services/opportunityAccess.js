import { LISTED_OPPORTUNITY_STATUSES, OPPORTUNITY_RULES } from '../data/opportunityOptions.js';
import { ROLES } from '../models/User.js';

/*
 * Who sees an opportunity, whether it is still open, and who is eligible. `viewer` is always the
 * signed-in user's document from the database (req.user): college, branch, semester and role are read
 * from it, never from the request.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const STAFF_ROLES = Object.freeze([ROLES.ADMIN, ROLES.MODERATOR]);
export const isStaff = (viewer) => STAFF_ROLES.includes(viewer?.role);

const PUBLIC_VISIBILITY = ['public', 'campus'];

/**
 * MongoDB filter for opportunities a student may see: published or closed, and either open to all
 * CampusX students or limited to colleges that include the student's own.
 */
export function listedFor(viewer) {
  const audiences = [{ visibility: { $in: PUBLIC_VISIBILITY } }];
  if (viewer.college) audiences.push({ visibility: 'college', eligibleColleges: viewer.college });
  return { status: { $in: LISTED_OPPORTUNITY_STATUSES }, $or: audiences };
}

/** The same rule for one opportunity. Moderators and admins can also open drafts and archived ones. */
export function canView(opportunity, viewer) {
  if (isStaff(viewer)) return true;
  if (!LISTED_OPPORTUNITY_STATUSES.includes(opportunity.status)) return false;
  if (PUBLIC_VISIBILITY.includes(opportunity.visibility)) return true;
  return Boolean(viewer.college) && (opportunity.eligibleColleges ?? []).includes(viewer.college);
}

export const isListed = (opportunity) => LISTED_OPPORTUNITY_STATUSES.includes(opportunity.status);

/** Closed: by a moderator, or because the application deadline has passed (worked out, never stored). */
export const isClosed = (opportunity, now = new Date()) =>
  opportunity.status === 'closed' || (Boolean(opportunity.applicationDeadline) && new Date(opportunity.applicationDeadline) <= now);

/** Published and still taking applications (no deadline, or one still ahead). */
export const openFilter = (now = new Date()) => ({
  status: 'published',
  $or: [{ applicationDeadline: null }, { applicationDeadline: { $gt: now } }],
});

/**
 * What students see: draft · archived · closed · closing-soon (deadline within a few days) · open.
 * Calculated on every read, so nothing has to rewrite the database when a deadline passes.
 */
export function displayStatus(opportunity, now = new Date()) {
  if (!isListed(opportunity)) return opportunity.status;
  if (isClosed(opportunity, now)) return 'closed';
  const deadline = opportunity.applicationDeadline ? new Date(opportunity.applicationDeadline) : null;
  if (deadline && deadline.getTime() - now.getTime() <= OPPORTUNITY_RULES.closingSoonDays * DAY_MS) return 'closing-soon';
  return 'open';
}

/**
 * Eligibility from the viewer's own profile. Empty rule lists mean "anyone".
 * Returns { eligible, restricted, unmet: ['college' | 'branch' | 'semester'] }.
 */
export function eligibilityOf(opportunity, viewer) {
  const unmet = [];
  const colleges = opportunity.eligibleColleges ?? [];
  const branches = opportunity.eligibleBranches ?? [];
  const semesters = opportunity.eligibleSemesters ?? [];
  if (colleges.length && !(viewer.college && colleges.includes(viewer.college))) unmet.push('college');
  if (branches.length && !(viewer.branch && branches.includes(viewer.branch))) unmet.push('branch');
  if (semesters.length && !(viewer.semester && semesters.includes(viewer.semester))) unmet.push('semester');
  return { eligible: unmet.length === 0, restricted: colleges.length + branches.length + semesters.length > 0, unmet };
}

/** "Open to" a value: the rule list is empty (anyone) or includes it. */
export const openTo = (field, value) => ({ $or: [{ [field]: { $size: 0 } }, ...(value !== undefined && value !== null && value !== '' ? [{ [field]: value }] : [])] });

/** MongoDB filter: opportunities the viewer's own profile is eligible for. */
export const eligibleFilter = (viewer) => ({
  $and: [openTo('eligibleColleges', viewer.college), openTo('eligibleBranches', viewer.branch), openTo('eligibleSemesters', viewer.semester)],
});

export const daysFromNow = (days, now = new Date()) => new Date(now.getTime() + days * DAY_MS);
