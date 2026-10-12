import { SEARCH_RULES } from '../data/searchOptions.js';
import SearchHistory from '../models/SearchHistory.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { toObjectId } from '../utils/objectId.js';
import { findPersonalInfo } from '../utils/personalInfo.js';
import { normalizeQuery } from './searchQuery.js';

/*
 * Recent searches: private to the signed-in student (`viewer`, req.user), who can delete one or all.
 * Only the query text and when it was last searched are kept, for the newest SEARCH_RULES.history.keep
 * distinct queries. Search routes all need a sign-in, so nothing is ever kept for signed-out visitors,
 * and the Anonymous Zone's own search (/anonymous) never records anything here.
 */

const KEEP = SEARCH_RULES.history.keep;

const toView = (entry) => ({ id: entry._id.toString(), query: entry.query, searchedAt: entry.searchedAt });

/**
 * Remembers a search (moving a repeat to the top instead of duplicating it) and trims older ones.
 * Queries that look like private details (an email address, a phone number) are not kept.
 * Never fails the search itself: problems are logged and ignored.
 */
export async function recordSearch(viewer, rawQuery) {
  const { text } = normalizeQuery(rawQuery);
  if (!text || findPersonalInfo(text)) return;
  try {
    const key = text.toLowerCase();
    await SearchHistory.updateOne({ user: viewer._id, key }, { $set: { query: text, searchedAt: new Date() } }, { upsert: true });
    const overflow = await SearchHistory.find({ user: viewer._id }).sort({ searchedAt: -1, _id: -1 }).skip(KEEP).select('_id').lean();
    if (overflow.length) await SearchHistory.deleteMany({ user: viewer._id, _id: { $in: overflow.map((entry) => entry._id) } });
  } catch (error) {
    // Two identical searches at the same moment: the unique index keeps one entry, which is all we want.
    if (error?.code !== 11000) logger.warn(`Could not save a recent search: ${error?.message ?? error}`);
  }
}

/** The student's recent searches, newest first. */
export async function listHistory(viewer) {
  const entries = await SearchHistory.find({ user: viewer._id }).sort({ searchedAt: -1, _id: -1 }).limit(KEEP).lean();
  return { history: entries.map(toView) };
}

/** Deletes one of the student's own entries. Anyone else's (or an unknown id) is simply not found. */
export async function deleteHistoryEntry(viewer, entryId) {
  const id = toObjectId(entryId);
  const { deletedCount } = id ? await SearchHistory.deleteOne({ _id: id, user: viewer._id }) : { deletedCount: 0 };
  if (deletedCount === 0) throw ApiError.notFound('That search is no longer in your history.');
  return { id: entryId };
}

export async function clearHistory(viewer) {
  const { deletedCount } = await SearchHistory.deleteMany({ user: viewer._id });
  return { deleted: deletedCount };
}
