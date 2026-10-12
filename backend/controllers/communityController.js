import { matchedData } from 'express-validator';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { removeCommunityImage, replaceCommunityImage } from '../services/communityMediaService.js';
import * as communityService from '../services/communityService.js';

// Community data depends on who is asking (membership, permissions): never cache it.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const bodyOf = (req) => matchedData(req, { locations: ['body'] });
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export function getOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Community options', data: communityService.getCommunityOptions() });
}

export async function listCommunities(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Communities', data: await communityService.listCommunities(req.user, queryOf(req)) });
}

export async function listMine(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your communities', data: await communityService.listMyCommunities(req.user) });
}

export async function listRecommended(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Recommended communities', data: await communityService.recommendCommunities(req.user) });
}

export async function getCommunity(req, res) {
  noStore(res);
  const community = await communityService.getCommunity(req.params.communityId, req.user);
  return sendSuccess(res, { message: 'Community', data: { community } });
}

export async function createCommunity(req, res) {
  noStore(res);
  const community = await communityService.createCommunity(req.user, bodyOf(req));
  return sendSuccess(res, { statusCode: 201, message: 'Community created!', data: { community } });
}

export async function updateCommunity(req, res) {
  const changes = bodyOf(req);
  if (Object.keys(changes).length === 0) throw ApiError.unprocessable('There is nothing to update.');
  noStore(res);
  const community = await communityService.updateCommunity(req.params.communityId, req.user, changes);
  return sendSuccess(res, { message: 'Community updated.', data: { community } });
}

export async function archiveCommunity(req, res) {
  noStore(res);
  const community = await communityService.archiveCommunity(req.params.communityId, req.user);
  return sendSuccess(res, { message: 'Community archived.', data: { community } });
}

export async function joinCommunity(req, res) {
  noStore(res);
  const community = await communityService.joinCommunity(req.params.communityId, req.user);
  return sendSuccess(res, { message: 'Joined community!', data: { community } });
}

export async function leaveCommunity(req, res) {
  const data = await communityService.leaveCommunity(req.params.communityId, req.user);
  return sendSuccess(res, { message: 'You left the community.', data });
}

export async function listMembers(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Members', data: await communityService.listMembers(req.params.communityId, req.user, queryOf(req)) });
}

export async function changeMemberRole(req, res) {
  noStore(res);
  const data = await communityService.changeMemberRole(req.params.communityId, req.params.userId, req.user, bodyOf(req).role);
  return sendSuccess(res, { message: 'Role updated.', data });
}

export async function removeMember(req, res) {
  const data = await communityService.removeMember(req.params.communityId, req.params.userId, req.user);
  return sendSuccess(res, { message: 'Member removed.', data });
}

export async function listPosts(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Community posts', data: await communityService.listCommunityPosts(req.params.communityId, req.user, queryOf(req)) });
}

/** Runs before any upload is read, so only owners' files ever reach the disk. */
export async function requireCommunityOwner(req, res, next) {
  await communityService.assertCommunityOwner(req.params.communityId, req.user);
  return next();
}

const imageHandlers = (kind, updatedMessage, removedMessage) => ({
  upload: async (req, res) => {
    noStore(res);
    const community = await replaceCommunityImage(kind, req.params.communityId, req.user, req.file.path);
    return sendSuccess(res, { message: updatedMessage, data: { community } });
  },
  remove: async (req, res) => {
    noStore(res);
    const community = await removeCommunityImage(kind, req.params.communityId, req.user);
    return sendSuccess(res, { message: removedMessage, data: { community } });
  },
});

export const icon = imageHandlers('icon', 'Community icon updated.', 'Community icon removed.');
export const cover = imageHandlers('cover', 'Community cover updated.', 'Community cover removed.');
