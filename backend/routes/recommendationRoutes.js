import { Router } from 'express';
import * as recommendationController from '../controllers/recommendationController.js';
import { LIST_TYPES } from '../config/recommendationConfig.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { recommendationFeedbackRateLimiter, recommendationInteractionRateLimiter, recommendationRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { dismissRules, interactionRules, listRules } from '../validators/recommendationValidator.js';

const router = Router();

// Recommendations are for signed-in CampusX students and always use the signed-in student's own account
// (req.user): nothing here accepts a user id, campus details or eligibility from the client.
// Rate limits run before validation, so malformed floods are counted too.
router.use(requireDatabase, authenticate);

router.get('/', recommendationRateLimiter, recommendationController.home);
router.get('/discover', recommendationRateLimiter, recommendationController.discover);
router.post('/interactions', recommendationInteractionRateLimiter, validate(interactionRules), recommendationController.interactions);

// /posts, /projects, /communities, /opportunities, /students, /achievements
for (const type of LIST_TYPES) {
  router.get(`/${type}`, recommendationRateLimiter, validate(listRules), recommendationController.list(type));
  router.post(`/${type}/:id/dismiss`, recommendationFeedbackRateLimiter, validate(dismissRules), recommendationController.dismiss(type));
}

export default router;
