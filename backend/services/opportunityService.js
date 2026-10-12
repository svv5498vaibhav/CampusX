import crypto from 'node:crypto';
import { BYTES_PER_MB, MEDIA_PRESETS } from '../config/media.js';
import {
  DEADLINE_FILTERS,
  OPPORTUNITY_FILTERS,
  OPPORTUNITY_MODES,
  OPPORTUNITY_REPORT_REASONS,
  OPPORTUNITY_RULES,
  OPPORTUNITY_SORTS,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_VISIBILITY,
  TRACKING_STATUSES,
} from '../data/opportunityOptions.js';
import { TECH_SUGGESTIONS } from '../data/showcaseOptions.js';
import Opportunity from '../models/Opportunity.js';
import OpportunityApplication from '../models/OpportunityApplication.js';
import OpportunityReport from '../models/OpportunityReport.js';
import { REPORT_STATUSES } from '../models/PostReport.js';
import Report from '../models/Report.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { toObjectId } from '../utils/objectId.js';
import { slugify } from '../utils/slug.js';
import { getCache, setCache } from './cacheService.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { getBranch, getCollege, getOnboardingOptions } from './campusOptionsService.js';
import { discardMedia } from './mediaService.js';
import {
  canView,
  daysFromNow,
  displayStatus,
  eligibilityOf,
  eligibleFilter,
  isClosed,
  isListed,
  isStaff,
  listedFor,
  openFilter,
  openTo,
} from './opportunityAccess.js';
import { analyzeOpportunity, recordOutcome } from './moderationService.js';
import { getStudentSummaries } from './profileService.js';

export const OPPORTUNITY_NOT_FOUND = 'Opportunity not found.';
const URL_FIELDS = ['applicationUrl', 'registrationUrl'];
const DATE_FIELDS = ['startDate', 'endDate', 'applicationDeadline'];
const VIEW_WINDOW_SECONDS = 6 * 60 * 60;
// Never sent to the browser (aggregations don't apply the schema's select: false).
const HIDDEN_FIELDS = { 'image.publicId': 0, 'organizerLogo.publicId': 0 };

/*
 * Every function takes `viewer`: the signed-in user's document (req.user). createdBy/updatedBy are
 * always the viewer; eligibility is always worked out from the viewer's own college, branch and
 * semester. Creating, editing and deleting are for moderators and admins (checked by the routes).
 */

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const exactInsensitive = (text) => new RegExp(`^${escapeRegex(text)}$`, 'i');
const newSlug = (title) => `${slugify(title, 'opportunity')}-${crypto.randomBytes(3).toString('hex')}`;

// ----------------------------------------------------------------------------- presenting

/** College and branch names for every eligibility rule on a page of opportunities. */
async function campusNames(opportunities) {
  const collegeIds = [...new Set(opportunities.flatMap((item) => item.eligibleColleges ?? []))];
  const branchIds = [...new Set(opportunities.flatMap((item) => item.eligibleBranches ?? []))];
  const [colleges, branches] = await Promise.all([Promise.all(collegeIds.map(getCollege)), Promise.all(branchIds.map(getBranch))]);
  return {
    colleges: new Map(colleges.filter(Boolean).map((college) => [college.id, { id: college.id, name: college.name, shortName: college.aliases?.[0] ?? college.name }])),
    branches: new Map(branches.filter(Boolean).map((branch) => [branch.id, { id: branch.id, name: branch.name, shortName: branch.shortName }])),
  };
}

export const listText = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** Plain reasons a student isn't eligible, e.g. "Only for CSE, IT students". */
function eligibilityReasons(unmet, eligibleFor) {
  return unmet.map((rule) => {
    if (rule === 'college') {
      const names = eligibleFor.colleges.map((college) => college.shortName);
      return names.length <= 3 ? `Only for students at ${names.join(' or ')}` : `Only for students at ${names.length} selected colleges`;
    }
    if (rule === 'branch') return `Only for ${eligibleFor.branches.map((branch) => branch.shortName).join(', ')} students`;
    const semesters = eligibleFor.semesters;
    return `Only for ${semesters.length === 1 ? 'semester' : 'semesters'} ${listText(semesters.map(String))}`;
  });
}

export const trackingView = (record) =>
  record
    ? {
        status: record.status,
        appliedAt: record.appliedAt ?? null,
        statusChangedAt: record.statusChangedAt ?? record.updatedAt ?? null,
        notes: record.notes ?? '',
      }
    : null;

function toOpportunityView(opportunity, viewer, { names, tracking, people, detail, now }) {
  const eligibleFor = {
    colleges: (opportunity.eligibleColleges ?? []).map((id) => names.colleges.get(id)).filter(Boolean),
    branches: (opportunity.eligibleBranches ?? []).map((id) => names.branches.get(id)).filter(Boolean),
    semesters: [...(opportunity.eligibleSemesters ?? [])].sort((a, b) => a - b),
  };
  const eligibility = eligibilityOf(opportunity, viewer);
  return {
    id: opportunity._id.toString(),
    slug: opportunity.slug,
    title: opportunity.title,
    shortDescription: opportunity.shortDescription,
    type: opportunity.type,
    organizer: opportunity.organizer,
    organizerLogo: opportunity.organizerLogo?.url ?? null,
    image: opportunity.image?.url ?? null,
    location: opportunity.location ?? '',
    mode: opportunity.mode,
    applicationUrl: opportunity.applicationUrl ?? null,
    registrationUrl: opportunity.registrationUrl ?? null,
    startDate: opportunity.startDate ?? null,
    endDate: opportunity.endDate ?? null,
    applicationDeadline: opportunity.applicationDeadline ?? null,
    skills: [...(opportunity.skills ?? [])],
    tags: [...(opportunity.tags ?? [])],
    prize: opportunity.prize ?? '',
    fee: opportunity.fee ?? '',
    featured: Boolean(opportunity.featured),
    views: opportunity.views ?? 0,
    status: opportunity.status,
    displayStatus: displayStatus(opportunity, now),
    acceptingApplications: isListed(opportunity) && !isClosed(opportunity, now),
    eligibleFor,
    viewerEligibility: { ...eligibility, reasons: eligibilityReasons(eligibility.unmet, eligibleFor) },
    tracking: trackingView(tracking),
    publishedAt: opportunity.publishedAt ?? null,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
    ...(detail && { description: opportunity.description, eligibility: opportunity.eligibility ?? '' }),
    ...(isStaff(viewer) && {
      visibility: opportunity.visibility,
      canManage: true,
      createdBy: people.get(opportunity.createdBy?.toString()) ?? null,
    }),
  };
}

/** Views for a page of opportunities, with the viewer's own tracking and eligibility. */
export async function presentOpportunities(opportunities, viewer, { detail = false, now = new Date(), trackingRecords } = {}) {
  if (opportunities.length === 0) return [];
  const ids = opportunities.map((item) => item._id);
  const [names, records, people] = await Promise.all([
    campusNames(opportunities),
    trackingRecords ?? OpportunityApplication.find({ user: viewer._id, opportunity: { $in: ids } }).lean(),
    isStaff(viewer) ? getStudentSummaries(opportunities.map((item) => item.createdBy).filter(Boolean)) : new Map(),
  ]);
  const tracking = new Map(records.map((record) => [record.opportunity.toString(), record]));
  return opportunities.map((item) => toOpportunityView(item, viewer, { names, tracking: tracking.get(item._id.toString()), people, detail, now }));
}

// ----------------------------------------------------------------------------- reading

/**
 * Real orderings only, never a ranking score:
 *   deadline  open opportunities first, nearest deadline first (rolling ones after, newest first),
 *             then closed ones, most recently closed first
 *   latest    most recently published
 *   popular   most viewed
 */
export function sortStages(sort, now) {
  if (sort === 'latest') return [{ $sort: { publishedAt: -1, createdAt: -1, _id: -1 } }];
  if (sort === 'popular') return [{ $sort: { views: -1, publishedAt: -1, _id: -1 } }];
  const hasDeadline = { $ne: [{ $ifNull: ['$applicationDeadline', null] }, null] };
  return [
    { $addFields: { _closed: { $cond: [{ $or: [{ $eq: ['$status', 'closed'] }, { $and: [hasDeadline, { $lte: ['$applicationDeadline', now] }] }] }, 1, 0] } } },
    {
      $addFields: {
        _rolling: { $cond: [{ $and: [{ $eq: ['$_closed', 0] }, { $not: [hasDeadline] }] }, 1, 0] },
        _when: {
          $switch: {
            branches: [
              { case: { $eq: ['$_closed', 1] }, then: { $multiply: [-1, { $toLong: { $ifNull: ['$applicationDeadline', '$updatedAt'] } }] } },
              { case: hasDeadline, then: { $toLong: '$applicationDeadline' } },
            ],
            default: { $multiply: [-1, { $toLong: '$createdAt' }] },
          },
        },
      },
    },
    { $sort: { _closed: 1, _rolling: 1, _when: 1, _id: -1 } },
    { $project: { _closed: 0, _rolling: 0, _when: 0 } },
  ];
}

async function pageOf(match, viewer, { sort = 'deadline', page = 1, limit = OPPORTUNITY_RULES.pageSize.default }) {
  const now = new Date();
  const pipeline = [{ $match: match }, ...sortStages(sort, now), { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { description: 0, ...HIDDEN_FIELDS } }];
  const [opportunities, total] = await Promise.all([Opportunity.aggregate(pipeline), Opportunity.countDocuments(match)]);
  return { opportunities: await presentOpportunities(opportunities, viewer, { now }), pagination: { page, limit, total, hasMore: page * limit < total } };
}

const searchFilter = (search) => {
  const pattern = new RegExp(escapeRegex(search), 'i');
  return { $or: ['title', 'shortDescription', 'description', 'organizer', 'skills', 'tags'].map((field) => ({ [field]: pattern })) };
};

const DEADLINE_WINDOWS = { '7d': 7, '30d': 30 };

/**
 * Discovery: listed opportunities the viewer may see. The college/branch/semester filters mean
 * "open to" that college/branch/semester (rules that include it, or no rule at all); `eligible`
 * uses the viewer's own profile and nothing from the request.
 */
export async function listOpportunities(viewer, query = {}) {
  const { search, type = 'all', mode, location, skills = [], deadline = 'any', college, branch, semester, eligible = false, sort = 'deadline', page, limit } = query;
  const now = new Date();
  const conditions = [listedFor(viewer)];
  if (type !== 'all') conditions.push({ type });
  if (mode) conditions.push({ mode });
  if (location) conditions.push({ location: new RegExp(escapeRegex(location), 'i') });
  if (skills.length) conditions.push({ skills: { $in: skills.map(exactInsensitive) } });
  if (deadline !== 'any') conditions.push(openFilter(now));
  if (DEADLINE_WINDOWS[deadline]) conditions.push({ applicationDeadline: { $gt: now, $lte: daysFromNow(DEADLINE_WINDOWS[deadline], now) } });
  if (college) conditions.push(openTo('eligibleColleges', college));
  if (branch) conditions.push(openTo('eligibleBranches', branch));
  if (semester) conditions.push(openTo('eligibleSemesters', semester));
  if (eligible) conditions.push(eligibleFilter(viewer));
  if (search) conditions.push(searchFilter(search));
  return pageOf({ $and: conditions }, viewer, { sort, page, limit });
}

/** Counts a view at most once per user every few hours; the creator's own visits never count. */
async function countView(opportunity, viewer) {
  if (opportunity.createdBy?.equals(viewer._id)) return false;
  const key = `opportunity-view:${opportunity._id}:${viewer._id}`;
  try {
    if (await getCache(key)) return false;
    await setCache(key, 1, VIEW_WINDOW_SECONDS);
    await Opportunity.updateOne({ _id: opportunity._id }, { $inc: { views: 1 } }, { timestamps: false });
    return true;
  } catch (error) {
    logger.warn(`Could not count an opportunity view: ${error?.message ?? error}`);
    return false;
  }
}

/** One opportunity with everything the detail page shows. 404 for ones the viewer can't see. */
export async function getOpportunity(opportunityId, viewer, { recordView = false } = {}) {
  const id = toObjectId(opportunityId);
  const opportunity = id ? await Opportunity.findById(id).lean() : null;
  if (!opportunity || !canView(opportunity, viewer)) throw ApiError.notFound(OPPORTUNITY_NOT_FOUND);
  const counted = recordView && isListed(opportunity) ? await countView(opportunity, viewer) : false;
  const [view] = await presentOpportunities([{ ...opportunity, views: (opportunity.views ?? 0) + (counted ? 1 : 0) }], viewer, { detail: true });
  return view;
}

/** Any opportunity a student may see (published or closed), as a lean document. 404 otherwise. */
export async function loadVisibleOpportunity(opportunityId, viewer) {
  const id = toObjectId(opportunityId);
  const opportunity = id ? await Opportunity.findOne({ $and: [{ _id: id }, listedFor(viewer)] }).lean() : null;
  if (!opportunity) throw ApiError.notFound(OPPORTUNITY_NOT_FOUND);
  return opportunity;
}

// ----------------------------------------------------------------------------- managing (moderators/admins)

/** Changing a link to "" or a date to null removes it; other values are saved as given. */
function splitChanges(changes) {
  const set = {};
  const unset = {};
  for (const [key, value] of Object.entries(changes)) {
    if ((URL_FIELDS.includes(key) && value === '') || (DATE_FIELDS.includes(key) && value === null)) unset[key] = 1;
    else set[key] = value;
  }
  return { set, unset };
}

/** Rules that involve more than one field, checked on the opportunity as it will be saved. */
function assertConsistent(values, { creating, publishing, now }) {
  const errors = [];
  const { startDate, endDate, applicationDeadline: deadline } = values;
  if (startDate && endDate && endDate < startDate) errors.push({ field: 'endDate', message: 'The end date can’t be before the start date.' });
  if (deadline && endDate && deadline > endDate) errors.push({ field: 'applicationDeadline', message: 'The application deadline can’t be after the end date.' });
  if (deadline && deadline <= now && (creating || publishing)) {
    errors.push({ field: 'applicationDeadline', message: creating ? 'The application deadline has already passed.' : 'The application deadline has passed. Choose a new deadline before publishing.' });
  }
  if (values.mode !== 'online' && !values.location) errors.push({ field: 'location', message: 'Please add a location for offline or hybrid opportunities.' });
  if (values.visibility === 'college' && !(values.eligibleColleges ?? []).length) {
    errors.push({ field: 'eligibleColleges', message: 'Choose at least one eligible college, or show it to every CampusX student.' });
  }
  if (errors.length) throw ApiError.unprocessable(errors[0].message, errors);
}

/** Creates an opportunity. createdBy is always the signed-in moderator/admin. */
export async function createOpportunity(viewer, data) {
  const now = new Date();
  const { set } = splitChanges(data);
  const values = { visibility: 'public', status: 'draft', ...set };
  assertConsistent(values, { creating: true, now });
  const opportunity = await Opportunity.create({
    ...values,
    slug: newSlug(values.title),
    createdBy: viewer._id,
    updatedBy: viewer._id,
    ...(values.status !== 'draft' && { publishedAt: now }),
  });
  // Trust & Safety: staff content is never hidden automatically; anything suspicious opens a review case.
  await recordOutcome({ targetType: 'opportunity', targetId: opportunity._id, ownerId: viewer._id, verdict: await analyzeOpportunity(viewer, values) });
  if (opportunity.status === 'published') emitCampusEvent(CAMPUS_EVENTS.OPPORTUNITY_PUBLISHED, { opportunityId: opportunity.id, by: viewer.id });
  return getOpportunity(opportunity.id, viewer);
}

const STATUS_EVENTS = {
  published: CAMPUS_EVENTS.OPPORTUNITY_PUBLISHED,
  closed: CAMPUS_EVENTS.OPPORTUNITY_CLOSED,
  archived: CAMPUS_EVENTS.OPPORTUNITY_ARCHIVED,
};

/** Edits, publishes, closes or archives an opportunity (status is one of the editable fields). */
export async function updateOpportunity(opportunityId, viewer, changes) {
  const now = new Date();
  const id = toObjectId(opportunityId);
  const opportunity = id ? await Opportunity.findById(id).lean() : null;
  if (!opportunity) throw ApiError.notFound(OPPORTUNITY_NOT_FOUND);

  const { set, unset } = splitChanges(changes);
  // Fields whose values really change (the editor sends every field on each save).
  const differs = (key, value) => JSON.stringify(opportunity[key] ?? null) !== JSON.stringify(value ?? null);
  const changed = [...Object.keys(set).filter((key) => differs(key, set[key])), ...Object.keys(unset).filter((key) => differs(key, null))];
  const merged = { ...opportunity, ...set };
  for (const key of Object.keys(unset)) delete merged[key];
  const statusChanged = set.status !== undefined && set.status !== opportunity.status;
  assertConsistent(merged, { creating: false, publishing: statusChanged && set.status === 'published', now });

  if (set.title && set.title !== opportunity.title) set.slug = newSlug(set.title);
  if (statusChanged && set.status !== 'draft' && !opportunity.publishedAt) set.publishedAt = now;
  set.updatedBy = viewer._id;
  await Opportunity.updateOne(
    { _id: opportunity._id },
    { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
    { runValidators: true },
  );

  const textFields = ['title', 'shortDescription', 'description', 'organizer', 'prize', 'fee', 'applicationUrl', 'registrationUrl'];
  if (changed.some((key) => textFields.includes(key))) {
    await recordOutcome({ targetType: 'opportunity', targetId: opportunity._id, ownerId: viewer._id, verdict: await analyzeOpportunity(viewer, merged) });
  }
  emitCampusEvent(CAMPUS_EVENTS.OPPORTUNITY_UPDATED, { opportunityId: opportunity._id.toString(), by: viewer.id, changed });
  if (statusChanged && STATUS_EVENTS[set.status]) {
    emitCampusEvent(STATUS_EVENTS[set.status], { opportunityId: opportunity._id.toString(), by: viewer.id, previousStatus: opportunity.status });
  }
  return getOpportunity(opportunity._id.toString(), viewer);
}

/**
 * Deletes an opportunity for good: its Cloudinary images (best effort), the opportunity and every
 * student's tracking of it. Reports stay for the moderation team. Archiving is the gentler option.
 */
export async function deleteOpportunity(opportunityId, viewer) {
  const id = toObjectId(opportunityId);
  const opportunity = id ? await Opportunity.findById(id).select('+image.publicId +organizerLogo.publicId') : null;
  if (!opportunity) throw ApiError.notFound(OPPORTUNITY_NOT_FOUND);
  await Promise.all([discardMedia(opportunity.image?.publicId), discardMedia(opportunity.organizerLogo?.publicId)]);
  const { deletedCount } = await Opportunity.deleteOne({ _id: opportunity._id });
  if (deletedCount === 0) throw ApiError.notFound(OPPORTUNITY_NOT_FOUND);
  await OpportunityApplication.deleteMany({ opportunity: opportunity._id });
  emitCampusEvent(CAMPUS_EVENTS.OPPORTUNITY_DELETED, { opportunityId: opportunity.id, by: viewer.id });
  return { id: opportunity.id };
}

/** Every opportunity (any status) for the management page, with open report and tracking counts. */
export async function listForStaff(viewer, { status = 'all', search, page = 1, limit = OPPORTUNITY_RULES.pageSize.default } = {}) {
  const conditions = [];
  if (status !== 'all') conditions.push({ status });
  if (search) conditions.push(searchFilter(search));
  const match = conditions.length ? { $and: conditions } : {};
  const now = new Date();
  const [opportunities, total, byStatus] = await Promise.all([
    Opportunity.aggregate([{ $match: match }, { $sort: { updatedAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { description: 0, ...HIDDEN_FIELDS } }]),
    Opportunity.countDocuments(match),
    Opportunity.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const ids = opportunities.map((item) => item._id);
  // Open reports: active ones from the shared report system, plus any still pending from before Phase 13.
  const [views, reports, legacyReports, trackers] = await Promise.all([
    presentOpportunities(opportunities, viewer, { now }),
    Report.aggregate([{ $match: { targetType: 'opportunity', targetId: { $in: ids }, active: true } }, { $group: { _id: '$targetId', count: { $sum: 1 } } }]),
    OpportunityReport.aggregate([{ $match: { opportunity: { $in: ids }, status: REPORT_STATUSES.PENDING } }, { $group: { _id: '$opportunity', count: { $sum: 1 } } }]),
    OpportunityApplication.aggregate([{ $match: { opportunity: { $in: ids } } }, { $group: { _id: '$opportunity', count: { $sum: 1 } } }]),
  ]);
  const countOf = (rows) => rows.reduce((map, row) => map.set(row._id.toString(), (map.get(row._id.toString()) ?? 0) + row.count), new Map());
  const [reportCounts, trackerCounts] = [countOf([...reports, ...legacyReports]), countOf(trackers)];
  const counts = Object.fromEntries(OPPORTUNITY_STATUSES.map((item) => [item.id, 0]));
  for (const row of byStatus) counts[row._id] = row.count;
  counts.all = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    opportunities: views.map((view) => ({ ...view, openReports: reportCounts.get(view.id) ?? 0, trackedBy: trackerCounts.get(view.id) ?? 0 })),
    counts,
    pagination: { page, limit, total, hasMore: page * limit < total },
  };
}

/** The stored status of an opportunity (for the audit log), or null when there is none. */
export async function getOpportunityStatus(opportunityId) {
  const id = toObjectId(opportunityId);
  const opportunity = id ? await Opportunity.findById(id).select('status').lean() : null;
  return opportunity?.status ?? null;
}

/** The opportunity's current images (with their Cloudinary ids), for the image service. */
export async function loadForImages(opportunityId) {
  const id = toObjectId(opportunityId);
  const opportunity = id ? await Opportunity.findById(id).select('+image.publicId +organizerLogo.publicId') : null;
  if (!opportunity) throw ApiError.notFound(OPPORTUNITY_NOT_FOUND);
  return opportunity;
}

// ----------------------------------------------------------------------------- options

const mediaRules = (presetName) => {
  const preset = MEDIA_PRESETS[presetName];
  return { maxBytes: preset.maxFileSize, maxMegabytes: preset.maxFileSize / BYTES_PER_MB, mimeTypes: preset.allowedMimeTypes };
};

/** Everything the discovery, tracking and management screens need, from the lists the server validates against. */
export async function getOpportunityOptions() {
  const campus = await getOnboardingOptions();
  return {
    types: OPPORTUNITY_TYPES,
    filters: OPPORTUNITY_FILTERS,
    modes: OPPORTUNITY_MODES,
    statuses: OPPORTUNITY_STATUSES,
    visibility: OPPORTUNITY_VISIBILITY,
    trackingStatuses: TRACKING_STATUSES,
    deadlineFilters: DEADLINE_FILTERS,
    sorts: OPPORTUNITY_SORTS,
    reportReasons: OPPORTUNITY_REPORT_REASONS,
    rules: OPPORTUNITY_RULES,
    media: { image: mediaRules('opportunityImage'), logo: mediaRules('opportunityLogo') },
    colleges: campus.colleges.map(({ id, name, aliases }) => ({ id, name, shortName: aliases?.[0] ?? name })),
    branches: campus.branches,
    semesters: campus.semesters,
    skillSuggestions: [...new Set([...TECH_SUGGESTIONS, ...campus.skillSuggestions])],
  };
}
