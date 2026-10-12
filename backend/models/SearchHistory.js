import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { SEARCH_RULES } from '../data/searchOptions.js';

/**
 * A signed-in student's recent searches, private to them. One entry per distinct query (`key` is the
 * query in lower case): searching again moves it to the top instead of adding a duplicate. Only the
 * newest SEARCH_RULES.history.keep entries are kept; queries that look like private details (an email
 * address, a phone number) are never stored. No result data, filters or IP addresses are stored.
 */
const searchHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    query: { type: String, required: true, trim: true, maxlength: SEARCH_RULES.query.max },
    key: { type: String, required: true, maxlength: SEARCH_RULES.query.max },
    // Last time the student ran this search; recent searches are listed by it.
    searchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

searchHistorySchema.index({ user: 1, key: 1 }, { unique: true });
searchHistorySchema.index({ user: 1, searchedAt: -1 });

const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);
watchIndexBuild(SearchHistory);

export default SearchHistory;
