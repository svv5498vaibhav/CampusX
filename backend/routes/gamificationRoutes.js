import { Router } from 'express';
import * as gamificationController from '../controllers/gamificationController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { transactionsRules } from '../validators/gamificationValidator.js';

const router = Router();

// Read-only. There is deliberately no route that adds points, changes a level or grants a badge:
// those only change through server-side events handled by services/gamificationEvents.js.
router.use(requireDatabase, authenticate);

router.get('/rules', gamificationController.rules);
router.get('/me', gamificationController.myGamification);
router.get('/transactions', validate(transactionsRules), gamificationController.transactions);
router.get('/badges', gamificationController.badges);

export default router;
