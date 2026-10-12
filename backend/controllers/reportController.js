import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as reportService from '../services/reportService.js';

// A student's own reports: never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const bodyOf = (req) => matchedData(req, { locations: ['body'] });
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export function getOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Report options', data: reportService.getReportOptions() });
}

export async function createReport(req, res) {
  noStore(res);
  const data = await reportService.createReport(req.user, bodyOf(req));
  return sendSuccess(res, { statusCode: 201, message: 'Thanks. Your report has been submitted.', data });
}

export async function listMine(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Your reports', data: await reportService.listMyReports(req.user, queryOf(req)) });
}

export async function withdraw(req, res) {
  return sendSuccess(res, { message: 'Report withdrawn.', data: await reportService.withdrawReport(req.user, req.params.id) });
}
