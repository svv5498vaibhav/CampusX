import { Router } from 'express';
import * as rankingController from '../controllers/rankingController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { fixedPeriodLeaderboardRules, leaderboardRules } from '../validators/gamificationValidator.js';

const router = Router();

// Read-only leaderboards for signed-in students. Scopes come from the student's own profile.
router.use(requireDatabase, authenticate);

router.get('/me', rankingController.myRanks);
router.get('/weekly', validate(fixedPeriodLeaderboardRules), rankingController.periodLeaderboard('week'));
router.get('/monthly', validate(fixedPeriodLeaderboardRules), rankingController.periodLeaderboard('month'));
for (const scope of ['overall', 'college', 'branch', 'semester']) {
  router.get(`/${scope}`, validate(leaderboardRules), rankingController.leaderboard(scope));
}

export default router;
