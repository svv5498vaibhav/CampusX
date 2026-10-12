import { matchedData } from 'express-validator';
import { sendSuccess } from '../utils/apiResponse.js';
import * as searchHistoryService from '../services/searchHistoryService.js';
import * as searchService from '../services/searchService.js';

// Results depend on who is asking (visibility, memberships, likes): never cached by browsers or proxies.
const noStore = (res) => res.set('Cache-Control', 'no-store');
const queryOf = (req) => matchedData(req, { locations: ['query'] });

export async function getOptions(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  return sendSuccess(res, { message: 'Search options', data: await searchService.getSearchOptions() });
}

/** GET /search?q= : a few results of every kind. */
export async function searchAll(req, res) {
  noStore(res);
  const { q } = queryOf(req);
  const data = await searchService.searchAll(req.user, q);
  await searchHistoryService.recordSearch(req.user, q);
  return sendSuccess(res, { message: 'Search results', data });
}

/** GET /search/<type>?q= : one category, with its filters, sort and pages. */
export const searchCategory = (type) =>
  async function searchOneCategory(req, res) {
    noStore(res);
    const { q, page, limit, sort, ...filters } = queryOf(req);
    const data = await searchService.searchByType(type, req.user, q, { filters, sort, page, limit });
    // A new search is remembered; turning pages of the same one isn't.
    if (page === 1) await searchHistoryService.recordSearch(req.user, q);
    return sendSuccess(res, { message: 'Search results', data });
  };

export async function suggestions(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Search suggestions', data: await searchService.getSuggestions(req.user, queryOf(req).q) });
}

export async function history(req, res) {
  noStore(res);
  return sendSuccess(res, { message: 'Recent searches', data: await searchHistoryService.listHistory(req.user) });
}

export async function deleteHistoryEntry(req, res) {
  return sendSuccess(res, { message: 'Removed from recent searches', data: await searchHistoryService.deleteHistoryEntry(req.user, req.params.id) });
}

export async function clearHistory(req, res) {
  return sendSuccess(res, { message: 'Recent searches cleared', data: await searchHistoryService.clearHistory(req.user) });
}
