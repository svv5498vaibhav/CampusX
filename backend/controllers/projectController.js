import { matchedData } from 'express-validator';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as projectService from '../services/projectService.js';

// Project data depends on who is asking (visibility, likes, ownership): never cache it.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const bodyOf = (req) => matchedData(req, { locations: ['body'] });
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export function getOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Project options', data: projectService.getProjectOptions() });
}

export async function listProjects(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Projects', data: await projectService.listProjects(req.user, queryOf(req)) });
}

export async function listMine(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your projects', data: await projectService.listMyProjects(req.user) });
}

export async function listUserProjects(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Projects', data: await projectService.listUserProjects(req.params.userId, req.user, queryOf(req)) });
}

export async function teamCandidates(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Students', data: await projectService.findTeamCandidates(queryOf(req).search, req.user) });
}

export async function getProject(req, res) {
  noStore(res);
  const project = await projectService.getProject(req.params.projectId, req.user, { recordView: true });
  return sendSuccess(res, { message: 'Project', data: { project } });
}

export async function createProject(req, res) {
  noStore(res);
  const project = await projectService.createProject(req.user, bodyOf(req));
  return sendSuccess(res, { statusCode: 201, message: 'Project saved!', data: { project } });
}

export async function updateProject(req, res) {
  const changes = bodyOf(req);
  if (Object.keys(changes).length === 0) throw ApiError.unprocessable('There is nothing to update.');
  noStore(res);
  const project = await projectService.updateProject(req.params.projectId, req.user, changes);
  return sendSuccess(res, { message: 'Project updated.', data: { project } });
}

export async function deleteProject(req, res) {
  return sendSuccess(res, { message: 'Project deleted.', data: await projectService.deleteProject(req.params.projectId, req.user) });
}

/** Runs before any upload is read, so only the owner's files ever reach the disk. */
export async function requireProjectOwner(req, res, next) {
  await projectService.loadOwnProject(req.params.projectId, req.user);
  return next();
}

export async function addImages(req, res) {
  noStore(res);
  const project = await projectService.addImages(req.params.projectId, req.user, req.files);
  return sendSuccess(res, { message: 'Images added.', data: { project } });
}

export async function removeImage(req, res) {
  noStore(res);
  const project = await projectService.removeImage(req.params.projectId, req.params.imageId, req.user);
  return sendSuccess(res, { message: 'Image removed.', data: { project } });
}

export const likeProject = async (req, res) =>
  sendSuccess(res, { message: 'Project liked', data: await projectService.setLike(req.params.projectId, req.user, true) });
export const unlikeProject = async (req, res) =>
  sendSuccess(res, { message: 'Like removed', data: await projectService.setLike(req.params.projectId, req.user, false) });

export async function acceptInvitation(req, res) {
  noStore(res);
  const project = await projectService.acceptInvitation(req.params.projectId, req.user);
  return sendSuccess(res, { message: 'You joined the project team.', data: { project } });
}

export async function leaveTeam(req, res) {
  return sendSuccess(res, { message: 'You left the project team.', data: await projectService.leaveTeam(req.params.projectId, req.user) });
}
