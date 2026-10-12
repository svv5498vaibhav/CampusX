import { Router } from 'express';
import * as moderationController from '../controllers/moderationController.js';
import { authenticate, authorizeRoles } from '../middleware/authMiddleware.js';
import { moderationRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { ROLES } from '../models/User.js';
import { decideCaseRules, listCasesRules } from '../validators/moderationValidator.js';

const router = Router();

// CampusX moderators and admins only (students: 403, before anything is read). The minimal backend the
// Phase 15 admin dashboard will build on: list cases, open one, decide it. No anonymous author is ever
// revealed here.
router.use(requireDatabase, authenticate, authorizeRoles(ROLES.ADMIN, ROLES.MODERATOR), moderationRateLimiter);

router.get('/cases', validate(listCasesRules), moderationController.listCases);
router.get('/cases/:id', moderationController.getCase);
router.patch('/cases/:id', validate(decideCaseRules), moderationController.decideCase);

export default router;
