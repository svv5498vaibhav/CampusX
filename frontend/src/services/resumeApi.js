import api from './api';

const unwrap = (response) => response.data.data;

/**
 * Resume Builder. Every call works on the signed-in student's own resumes; no call sends a user id.
 * The PDF is made in the browser (utils/resume/pdf.js) from the copy `export` returns.
 */
export const resumeApi = {
  /** Templates, roles, sections, colours, limits and whether the AI assistant is available. */
  options: () => api.get('/resumes/options').then(unwrap),
  /** { resumes: [summary], summary: { count, max, defaultResume, lastUpdatedAt } } */
  list: () => api.get('/resumes').then(unwrap),
  /** A draft from the student's CampusX profile: { draft, found, skipped, missing, limits }. Nothing is saved. */
  importProfile: () => api.get('/resumes/import').then(unwrap),
  create: (body) => api.post('/resumes', body).then((response) => unwrap(response).resume),
  get: (resumeId) => api.get(`/resumes/${encodeURIComponent(resumeId)}`).then((response) => unwrap(response).resume),
  /** changes: any of name, targetRole, customRole, template, settings, sections, content; plus the revision it is based on. */
  update: (resumeId, changes) => api.patch(`/resumes/${encodeURIComponent(resumeId)}`, changes).then((response) => unwrap(response).resume),
  duplicate: (resumeId, body = {}) => api.post(`/resumes/${encodeURIComponent(resumeId)}/duplicate`, body).then((response) => unwrap(response).resume),
  setDefault: (resumeId) => api.post(`/resumes/${encodeURIComponent(resumeId)}/default`).then((response) => unwrap(response).resume),
  remove: (resumeId) => api.delete(`/resumes/${encodeURIComponent(resumeId)}`).then(unwrap),
  /** The saved resume to build the PDF from (the download is counted). */
  export: (resumeId) => api.post(`/resumes/${encodeURIComponent(resumeId)}/export`).then((response) => unwrap(response).resume),
  /** { jobDescription?, pageCount? } → the checker's report. */
  analyze: (resumeId, body) => api.post(`/resumes/${encodeURIComponent(resumeId)}/analyze`, body).then((response) => unwrap(response).report),
  /** { task, text?, itemId?, jobDescription?, summaryTitle? } → a suggestion to review. */
  assist: (resumeId, body) => api.post(`/resumes/${encodeURIComponent(resumeId)}/ai`, body, { timeout: 90_000 }).then((response) => unwrap(response).result),
};
