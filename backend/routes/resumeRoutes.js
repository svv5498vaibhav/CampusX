import { Router } from 'express';
import * as resumeController from '../controllers/resumeController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { resumeAiRateLimiter, resumeAnalyzeRateLimiter, resumeWriteRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import {
  analyzeResumeRules,
  assistRules,
  createResumeRules,
  duplicateResumeRules,
  resumeIdRules,
  updateResumeRules,
} from '../validators/resumeValidator.js';

const router = Router();

// Resume Builder: always the signed-in student's own resumes (req.user). No route takes a user id, every
// query is filtered on the owner, and nothing here is reachable from profiles, search or admin routes.
router.use(requireDatabase, authenticate);

router.get('/options', resumeController.options);
router.get('/import', resumeController.importProfile);
router.get('/', resumeController.list);
router.post('/', resumeWriteRateLimiter, validate(createResumeRules), resumeController.create);

router.get('/:resumeId', validate(resumeIdRules), resumeController.get);
router.patch('/:resumeId', resumeWriteRateLimiter, validate(updateResumeRules), resumeController.update);
router.delete('/:resumeId', resumeWriteRateLimiter, validate(resumeIdRules), resumeController.remove);
router.post('/:resumeId/duplicate', resumeWriteRateLimiter, validate(duplicateResumeRules), resumeController.duplicate);
router.post('/:resumeId/default', resumeWriteRateLimiter, validate(resumeIdRules), resumeController.setDefault);
router.post('/:resumeId/export', resumeWriteRateLimiter, validate(resumeIdRules), resumeController.exportResume);
router.post('/:resumeId/analyze', resumeAnalyzeRateLimiter, validate(analyzeResumeRules), resumeController.analyze);
router.post('/:resumeId/ai', resumeAiRateLimiter, validate(assistRules), resumeController.assist);

export default router;
