import { Router } from 'express';
import * as reportController from '../controllers/reportController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { reportRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { createReportRules, myReportsRules } from '../validators/reportValidator.js';

const router = Router();

// Reports for signed-in students: file one, see your own, withdraw a pending one. Resolving or dismissing
// reports is for CampusX moderators only (/moderation); there is deliberately no student route for it.
router.use(requireDatabase, authenticate);

router.get('/options', reportController.getOptions);
router.get('/me', validate(myReportsRules), reportController.listMine);
router.post('/', reportRateLimiter, validate(createReportRules), reportController.createReport);
router.delete('/:id', reportController.withdraw);

export default router;
