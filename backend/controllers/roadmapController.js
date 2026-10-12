import { matchedData } from 'express-validator';
import * as roadmapService from '../services/roadmapService.js';
import { sendSuccess } from '../utils/apiResponse.js';

// A student's own progress: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const paramsOf = (req) => matchedData(req, { locations: ['params'] });
const bodyOf = (req) => matchedData(req, { locations: ['body'] });

export async function me(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your semester roadmap', data: await roadmapService.getMyRoadmap(req.user) });
}

export async function progress(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your roadmap progress', data: await roadmapService.getProgressSummary(req.user) });
}

export async function semester(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Semester roadmap', data: await roadmapService.getSemester(req.user, paramsOf(req).semester) });
}

export async function templates(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Roadmap templates', data: await roadmapService.getTemplates(req.user) });
}

export async function updatePreferences(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Roadmap preferences saved', data: await roadmapService.updatePreferences(req.user, bodyOf(req)) });
}

export async function completeMilestone(req, res) {
  noStore(res);
  const result = await roadmapService.setMilestoneStatus(req.user, paramsOf(req).milestoneId, 'completed');
  return sendSuccess(res, { message: result.changed ? 'Milestone completed' : 'Milestone already completed', data: result });
}

export async function milestoneProgress(req, res) {
  noStore(res);
  const { milestoneId } = paramsOf(req);
  const result = await roadmapService.setMilestoneStatus(req.user, milestoneId, bodyOf(req).status);
  return sendSuccess(res, { message: result.changed ? 'Milestone updated' : 'Milestone unchanged', data: result });
}
