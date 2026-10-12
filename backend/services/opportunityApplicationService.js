import {
  AFTER_APPLYING_STATUSES,
  BEFORE_APPLYING_STATUSES,
  OPPORTUNITY_RULES,
  TRACKING_STATUS_IDS,
} from '../data/opportunityOptions.js';
import Opportunity from '../models/Opportunity.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import ApiError from '../utils/ApiError.js';
import { toObjectId } from '../utils/objectId.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { canView, isClosed, isListed } from './opportunityAccess.js';
import { OPPORTUNITY_NOT_FOUND, loadVisibleOpportunity, presentOpportunities, trackingView } from './opportunityService.js';
import { createLegacyReport } from './reportService.js';

/*
 * A student's own tracking of opportunities ("My Opportunities"). The student is always the signed-in
 * user (req.user): no request can name another user, so nobody can read or change someone else's
 * tracking. CampusX can't see external applications, so every status is the student's own record.
 */

export const OPPORTUNITY_CLOSED = 'Applications for this opportunity have closed.';
const NOT_TRACKED = 'This opportunity isn’t in your list.';
const ALREADY_REPORTED = "You've already reported this opportunity. Our team will take a look.";

const findOwn = (opportunityId, viewer) => OpportunityApplication.findOne({ opportunity: opportunityId, user: viewer._id }).lean();

/**
 * Whether the student may move to `status`:
 *   - a closed (or no longer listed) opportunity can't be newly saved, marked interested or applied to
 *   - "saved"/"interested" only make sense while it is open
 *   - shortlisted, selected, rejected and withdrawn can only follow "applied"
 */
function assertAllowed(status, opportunity, existing) {
  const over = !isListed(opportunity) || isClosed(opportunity);
  if (!existing && over) throw ApiError.conflict(OPPORTUNITY_CLOSED);
  if (existing?.status === status) return;
  if (over && BEFORE_APPLYING_STATUSES.includes(status)) {
    throw ApiError.conflict('This opportunity has closed, so it can’t be saved or marked interested any more.');
  }
  if (AFTER_APPLYING_STATUSES.includes(status) && !existing?.appliedAt) {
    throw ApiError.unprocessable('Mark this opportunity as applied first.', [{ field: 'status', message: 'Mark it as applied first.' }]);
  }
}

/** The fields to write for a status change. Going back to saved/interested clears the applied date. */
function statusUpdate(status, existing, now) {
  if (status === undefined || existing?.status === status) return { set: {}, unset: {} };
  const set = { status, statusChangedAt: now };
  const unset = {};
  if (status === 'applied' && !existing?.appliedAt) set.appliedAt = now;
  if (BEFORE_APPLYING_STATUSES.includes(status) && existing?.appliedAt) unset.appliedAt = 1;
  return { set, unset };
}

/**
 * Adds an opportunity to the student's list (default "saved"). If it is already there nothing changes
 * (one record per student per opportunity, enforced by a unique index).
 * Returns { tracking, created }.
 */
export async function trackOpportunity(opportunityId, viewer, { status = 'saved', notes } = {}) {
  const opportunity = await loadVisibleOpportunity(opportunityId, viewer);
  const existing = await findOwn(opportunity._id, viewer);
  if (existing) return { tracking: trackingView(existing), created: false };
  assertAllowed(status, opportunity, null);

  const now = new Date();
  try {
    const record = await OpportunityApplication.create({
      opportunity: opportunity._id,
      user: viewer._id,
      status,
      statusChangedAt: now,
      ...(status === 'applied' && { appliedAt: now }),
      ...(notes !== undefined && { notes }),
    });
    emitCampusEvent(CAMPUS_EVENTS.OPPORTUNITY_TRACKING_CHANGED, { opportunityId: opportunity._id.toString(), userId: viewer.id, status });
    return { tracking: trackingView(record), created: true };
  } catch (error) {
    // Two requests at the same moment: the unique index keeps one record; return it.
    if (error?.code === 11000) return { tracking: trackingView(await findOwn(opportunity._id, viewer)), created: false };
    throw error;
  }
}

/**
 * Sets the student's status (and/or notes) for an opportunity, adding it to their list if needed.
 * Only ever touches the signed-in student's own record.
 */
export async function updateTrackingStatus(opportunityId, viewer, { status, notes }) {
  const id = toObjectId(opportunityId);
  const existing = id ? await findOwn(id, viewer) : null;
  // A student keeps access to what they already track; anything new must be visible to them.
  const opportunity = existing ? await Opportunity.findById(id).lean() : await loadVisibleOpportunity(opportunityId, viewer);
  if (!opportunity) throw ApiError.notFound(OPPORTUNITY_NOT_FOUND);
  const nextStatus = status ?? existing?.status ?? 'saved';
  assertAllowed(nextStatus, opportunity, existing);

  const now = new Date();
  const { set, unset } = statusUpdate(nextStatus, existing, now);
  if (notes !== undefined) set.notes = notes;
  // Nothing changes (same status, no notes): a new record always gets a status, so `existing` is set here.
  if (!Object.keys(set).length && !Object.keys(unset).length) return { tracking: trackingView(existing) };
  const update = { $set: set, ...(Object.keys(unset).length && { $unset: unset }) };
  const write = () =>
    OpportunityApplication.findOneAndUpdate({ opportunity: opportunity._id, user: viewer._id }, update, {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
      lean: true,
    });

  let record;
  try {
    record = await write();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    record = await write(); // lost an insert race: the record exists now, so this updates it
  }
  if (set.status) emitCampusEvent(CAMPUS_EVENTS.OPPORTUNITY_TRACKING_CHANGED, { opportunityId: opportunity._id.toString(), userId: viewer.id, status: set.status });
  return { tracking: trackingView(record) };
}

/** Removes the opportunity from the student's list (unsave). */
export async function removeTracking(opportunityId, viewer) {
  const id = toObjectId(opportunityId);
  const { deletedCount } = id ? await OpportunityApplication.deleteOne({ opportunity: id, user: viewer._id }) : { deletedCount: 0 };
  if (deletedCount === 0) throw ApiError.notFound(NOT_TRACKED);
  emitCampusEvent(CAMPUS_EVENTS.OPPORTUNITY_TRACKING_CHANGED, { opportunityId, userId: viewer.id, status: null });
  return { id: opportunityId, tracking: null };
}

/**
 * The student's list ("My Opportunities"), newest change first, with a count per status.
 * Opportunities that are no longer listed for them (archived, or now limited to other colleges) stay in
 * the list with `available: false` and only their basic details.
 */
export async function listMyOpportunities(viewer, { status = 'all', page = 1, limit = OPPORTUNITY_RULES.myPageSize.default } = {}) {
  const match = { user: viewer._id, ...(status !== 'all' && { status }) };
  const [records, total, grouped] = await Promise.all([
    OpportunityApplication.find(match).sort({ statusChangedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    OpportunityApplication.countDocuments(match),
    OpportunityApplication.aggregate([{ $match: { user: viewer._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const opportunities = await Opportunity.find({ _id: { $in: records.map((record) => record.opportunity) } }).select('-description').lean();
  const views = await presentOpportunities(opportunities, viewer, { trackingRecords: records });
  const byId = new Map(views.map((view) => [view.id, view]));
  const raw = new Map(opportunities.map((item) => [item._id.toString(), item]));

  const items = records
    .filter((record) => byId.has(record.opportunity.toString()))
    .map((record) => {
      const view = byId.get(record.opportunity.toString());
      const available = canView(raw.get(view.id), viewer) && isListed(raw.get(view.id));
      return available
        ? { ...view, available }
        : { id: view.id, title: view.title, organizer: view.organizer, type: view.type, mode: view.mode, applicationDeadline: view.applicationDeadline, displayStatus: view.displayStatus, tracking: view.tracking, available };
    });

  const counts = Object.fromEntries(TRACKING_STATUS_IDS.map((id) => [id, 0]));
  for (const row of grouped) counts[row._id] = row.count;
  counts.all = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { opportunities: items, counts, pagination: { page, limit, total, hasMore: page * limit < total } };
}

/** One open report per student per opportunity. */
export async function reportOpportunity(opportunityId, viewer, { reason, details = '' }) {
  // Stored with every other report (services/reportService.js, Trust & Safety).
  await createLegacyReport(viewer, { family: 'opportunity', targetType: 'opportunity', targetId: opportunityId, reason, details }, { duplicate: ALREADY_REPORTED, own: "You can't report an opportunity you posted.", notFound: OPPORTUNITY_NOT_FOUND });
  emitCampusEvent(CAMPUS_EVENTS.OPPORTUNITY_REPORTED, { opportunityId: String(opportunityId), reason });
}
