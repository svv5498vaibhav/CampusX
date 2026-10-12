import { Router } from 'express';
import * as roadmapController from '../controllers/roadmapController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { roadmapUpdateRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { completeMilestoneRules, milestoneProgressRules, preferencesRules, semesterParamRules } from '../validators/roadmapValidator.js';

const router = Router();

// Semester Roadmap: always the signed-in student's own roadmap (req.user). No route takes a user id, and
// there is no route that creates, edits or publishes templates (they come from data/roadmapOptions.js).
router.use(requireDatabase, authenticate);

router.get('/me', roadmapController.me);
router.get('/progress', roadmapController.progress);
router.get('/templates', roadmapController.templates);
router.get('/semester/:semester', validate(semesterParamRules), roadmapController.semester);
router.put('/preferences', roadmapUpdateRateLimiter, validate(preferencesRules), roadmapController.updatePreferences);
router.patch('/milestones/:milestoneId/complete', roadmapUpdateRateLimiter, validate(completeMilestoneRules), roadmapController.completeMilestone);
router.patch('/milestones/:milestoneId/progress', roadmapUpdateRateLimiter, validate(milestoneProgressRules), roadmapController.milestoneProgress);

export default router;
