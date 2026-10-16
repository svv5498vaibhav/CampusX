import { matchedData } from 'express-validator';
import * as resumeService from '../services/resumeService.js';
import { sendSuccess } from '../utils/apiResponse.js';

// Resumes hold personal details: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const idOf = (req) => matchedData(req, { locations: ['params'] }).resumeId;
const bodyOf = (req) => matchedData(req, { locations: ['body'] });

export async function options(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Resume Builder options', data: resumeService.getOptions() });
}

export async function list(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your resumes', data: await resumeService.listResumes(req.user) });
}

export async function importProfile(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your CampusX profile, ready to review', data: await resumeService.getProfileImport(req.user) });
}

export async function create(req, res) {
  noStore(res);
  return sendSuccess(res, { statusCode: 201, message: 'Resume created', data: { resume: await resumeService.createResume(req.user, bodyOf(req)) } });
}

export async function get(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your resume', data: { resume: await resumeService.getResume(req.user, idOf(req)) } });
}

export async function update(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Resume saved', data: { resume: await resumeService.updateResume(req.user, idOf(req), bodyOf(req)) } });
}

export async function duplicate(req, res) {
  noStore(res);
  return sendSuccess(res, { statusCode: 201, message: 'Resume duplicated', data: { resume: await resumeService.duplicateResume(req.user, idOf(req), bodyOf(req)) } });
}

export async function setDefault(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Default resume updated', data: { resume: await resumeService.setDefaultResume(req.user, idOf(req)) } });
}

export async function remove(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Resume deleted', data: await resumeService.deleteResume(req.user, idOf(req)) });
}

export async function exportResume(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Resume ready to download', data: { resume: await resumeService.exportResume(req.user, idOf(req)) } });
}

export async function analyze(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Resume check', data: { report: await resumeService.analyze(req.user, idOf(req), bodyOf(req)) } });
}

export async function assist(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'AI suggestion', data: { result: await resumeService.assist(req.user, idOf(req), bodyOf(req)) } });
}
