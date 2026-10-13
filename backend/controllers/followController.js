import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as followService from '../services/followService.js';

// Relationships are personal to whoever is asking: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export async function follow(req, res) {
  const result = await followService.followStudent(req.user, req.params.userId);
  return sendSuccess(res, { statusCode: result.changed ? 201 : 200, message: result.changed ? 'Following' : 'Already following', data: result });
}

export async function unfollow(req, res) {
  const result = await followService.unfollowStudent(req.user, req.params.userId);
  return sendSuccess(res, { message: result.changed ? 'Unfollowed' : 'Not following', data: result });
}

export async function followers(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Followers', data: await followService.listFollowers(req.user, req.params.userId, queryOf(req)) });
}

export async function following(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Following', data: await followService.listFollowing(req.user, req.params.userId, queryOf(req)) });
}

export async function relationship(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Relationship', data: await followService.getRelationship(req.user, req.params.userId) });
}

export async function followStatus(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Follow status', data: { statuses: await followService.getFollowStatuses(req.user, queryOf(req).ids) } });
}

export async function block(req, res) {
  const result = await followService.blockStudent(req.user, req.params.userId);
  return sendSuccess(res, { message: 'Blocked', data: result });
}

export async function unblock(req, res) {
  const result = await followService.unblockStudent(req.user, req.params.userId);
  return sendSuccess(res, { message: 'Unblocked', data: result });
}
