import { matchedData } from 'express-validator';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { recordOpportunityChange } from '../services/admin/auditService.js';
import * as applicationService from '../services/opportunityApplicationService.js';
import { removeOpportunityImage, replaceOpportunityImage } from '../services/opportunityMediaService.js';
import { recommendOpportunities } from '../services/opportunityRecommendationService.js';
import * as opportunityService from '../services/opportunityService.js';

// Opportunity data depends on who is asking (eligibility, tracking, role): never cache it.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const bodyOf = (req) => matchedData(req, { locations: ['body'] });
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export async function getOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Opportunity options', data: await opportunityService.getOpportunityOptions() });
}

export async function listOpportunities(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Opportunities', data: await opportunityService.listOpportunities(req.user, queryOf(req)) });
}

export async function listRecommended(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Recommended opportunities', data: await recommendOpportunities(req.user) });
}

export async function listMine(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your opportunities', data: await applicationService.listMyOpportunities(req.user, queryOf(req)) });
}

export async function getOpportunity(req, res) {
  noStore(res);
  const opportunity = await opportunityService.getOpportunity(req.params.opportunityId, req.user, { recordView: true });
  return sendSuccess(res, { message: 'Opportunity', data: { opportunity } });
}

// ----------------------------------------------------------------------------- tracking (any signed-in student, own records only)

export async function trackOpportunity(req, res) {
  noStore(res);
  const { tracking, created } = await applicationService.trackOpportunity(req.params.opportunityId, req.user, bodyOf(req));
  return sendSuccess(res, {
    statusCode: created ? 201 : 200,
    message: created ? 'Saved to My Opportunities.' : 'Already in My Opportunities.',
    data: { tracking },
  });
}

export async function updateTrackingStatus(req, res) {
  const changes = bodyOf(req);
  if (Object.keys(changes).length === 0) throw ApiError.unprocessable('Please choose a status.');
  noStore(res);
  const data = await applicationService.updateTrackingStatus(req.params.opportunityId, req.user, changes);
  return sendSuccess(res, { message: 'Status updated.', data });
}

export async function removeTracking(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Removed from My Opportunities.', data: await applicationService.removeTracking(req.params.opportunityId, req.user) });
}

export async function reportOpportunity(req, res) {
  await applicationService.reportOpportunity(req.params.opportunityId, req.user, bodyOf(req));
  return sendSuccess(res, { statusCode: 201, message: 'Thanks. Your report has been submitted.' });
}

// ----------------------------------------------------------------------------- managing (moderators/admins, checked by the routes)
// Used by /opportunities and by the admin control center's /admin/opportunities; every change is audited.

export async function listForStaff(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Opportunities', data: await opportunityService.listForStaff(req.user, queryOf(req)) });
}

export async function createOpportunity(req, res) {
  noStore(res);
  const opportunity = await opportunityService.createOpportunity(req.user, bodyOf(req));
  await recordOpportunityChange(req.user, { opportunityId: opportunity.id, created: true, newStatus: opportunity.status }, req.ip);
  return sendSuccess(res, { statusCode: 201, message: opportunity.status === 'published' ? 'Opportunity published.' : 'Draft saved.', data: { opportunity } });
}

const STATUS_MESSAGES = { published: 'Opportunity published.', closed: 'Opportunity closed.', archived: 'Opportunity archived.', draft: 'Moved back to drafts.' };

export async function updateOpportunity(req, res) {
  const changes = bodyOf(req);
  if (Object.keys(changes).length === 0) throw ApiError.unprocessable('There is nothing to update.');
  noStore(res);
  const previousStatus = await opportunityService.getOpportunityStatus(req.params.opportunityId);
  const opportunity = await opportunityService.updateOpportunity(req.params.opportunityId, req.user, changes);
  await recordOpportunityChange(req.user, { opportunityId: opportunity.id, previousStatus, newStatus: opportunity.status, fields: Object.keys(changes) }, req.ip);
  const message = Object.keys(changes).length === 1 && changes.status ? STATUS_MESSAGES[changes.status] : 'Opportunity updated.';
  return sendSuccess(res, { message, data: { opportunity } });
}

export async function deleteOpportunity(req, res) {
  const previousStatus = await opportunityService.getOpportunityStatus(req.params.opportunityId);
  const data = await opportunityService.deleteOpportunity(req.params.opportunityId, req.user);
  await recordOpportunityChange(req.user, { opportunityId: data.id, deleted: true, previousStatus }, req.ip);
  return sendSuccess(res, { message: 'Opportunity deleted.', data });
}

/** Runs before any upload is read, so files are only accepted for an opportunity that exists. */
export async function requireOpportunity(req, res, next) {
  await opportunityService.loadForImages(req.params.opportunityId);
  return next();
}

const imageHandlers = (kind, updatedMessage, removedMessage) => ({
  upload: async (req, res) => {
    noStore(res);
    const opportunity = await replaceOpportunityImage(kind, req.params.opportunityId, req.user, req.file.path);
    return sendSuccess(res, { message: updatedMessage, data: { opportunity } });
  },
  remove: async (req, res) => {
    noStore(res);
    const opportunity = await removeOpportunityImage(kind, req.params.opportunityId, req.user);
    return sendSuccess(res, { message: removedMessage, data: { opportunity } });
  },
});

export const image = imageHandlers('image', 'Image updated.', 'Image removed.');
export const logo = imageHandlers('logo', 'Organizer logo updated.', 'Organizer logo removed.');
