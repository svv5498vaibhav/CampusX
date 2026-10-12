import { matchedData } from 'express-validator';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as achievementService from '../services/achievementService.js';

const noStore = (res) => res.set('Cache-Control', 'no-store');
const bodyOf = (req) => matchedData(req, { locations: ['body'] });
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export function getOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Achievement options', data: achievementService.getAchievementOptions() });
}

export async function listAchievements(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Achievements', data: await achievementService.listAchievements(req.user, queryOf(req)) });
}

export async function listMine(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your achievements', data: await achievementService.listMyAchievements(req.user) });
}

export async function listUserAchievements(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Achievements', data: await achievementService.listUserAchievements(req.params.userId, req.user, queryOf(req)) });
}

export async function getAchievement(req, res) {
  noStore(res);
  const achievement = await achievementService.getAchievement(req.params.achievementId, req.user);
  return sendSuccess(res, { message: 'Achievement', data: { achievement } });
}

export async function createAchievement(req, res) {
  noStore(res);
  const achievement = await achievementService.createAchievement(req.user, bodyOf(req));
  return sendSuccess(res, { statusCode: 201, message: 'Achievement added!', data: { achievement } });
}

export async function updateAchievement(req, res) {
  const changes = bodyOf(req);
  if (Object.keys(changes).length === 0) throw ApiError.unprocessable('There is nothing to update.');
  noStore(res);
  const achievement = await achievementService.updateAchievement(req.params.achievementId, req.user, changes);
  return sendSuccess(res, { message: 'Achievement updated.', data: { achievement } });
}

export async function deleteAchievement(req, res) {
  return sendSuccess(res, { message: 'Achievement deleted.', data: await achievementService.deleteAchievement(req.params.achievementId, req.user) });
}

/** Runs before any upload is read, so only the owner's files ever reach the disk. */
export async function requireAchievementOwner(req, res, next) {
  await achievementService.loadOwnAchievement(req.params.achievementId, req.user);
  return next();
}

export async function addProof(req, res) {
  noStore(res);
  const achievement = await achievementService.addProof(req.params.achievementId, req.user, req.files);
  return sendSuccess(res, { message: 'Proof submitted for review.', data: { achievement } });
}

export async function removeProof(req, res) {
  noStore(res);
  const achievement = await achievementService.removeProof(req.params.achievementId, req.params.proofId, req.user);
  return sendSuccess(res, { message: 'Proof removed.', data: { achievement } });
}

/** Moderators/admins only (checked by the route): verify or reject a pending achievement. */
export async function reviewAchievement(req, res) {
  noStore(res);
  const achievement = await achievementService.reviewAchievement(req.params.achievementId, req.user, bodyOf(req));
  return sendSuccess(res, { message: `Achievement ${achievement.verificationStatus}.`, data: { achievement } });
}
