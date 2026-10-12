import { Router } from 'express';
import * as searchController from '../controllers/searchController.js';
import { CATEGORY_TYPE_IDS } from '../data/searchOptions.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { searchHistoryRateLimiter, searchRateLimiter, searchSuggestionRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { categorySearchRules, globalSearchRules, suggestionRules } from '../validators/searchValidator.js';

const router = Router();

// Search is for signed-in CampusX students. Every result passes the same visibility rules as the rest
// of CampusX, worked out from the signed-in student's own profile and memberships (never the request).
// Rate limits run before validation, so malformed floods are counted too.
router.use(requireDatabase, authenticate);

router.get('/options', searchController.getOptions);
router.get('/suggestions', searchSuggestionRateLimiter, validate(suggestionRules), searchController.suggestions);

router.get('/history', searchHistoryRateLimiter, searchController.history);
router.delete('/history', searchHistoryRateLimiter, searchController.clearHistory);
router.delete('/history/:id', searchHistoryRateLimiter, searchController.deleteHistoryEntry);

router.get('/', searchRateLimiter, validate(globalSearchRules), searchController.searchAll);
// /students, /posts, /projects, /communities, /opportunities, /achievements
for (const type of CATEGORY_TYPE_IDS) {
  router.get(`/${type}`, searchRateLimiter, validate(categorySearchRules(type)), searchController.searchCategory(type));
}

export default router;
