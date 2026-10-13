import { Router } from 'express';
import * as followController from '../controllers/followController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { blockRateLimiter, followRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { followStatusRules, relationListRules, userRules } from '../validators/socialValidator.js';

const router = Router();

// Follows and blocks between signed-in students. The student acting is always req.user (from the session);
// the URL only names the other student, so nobody can change a relationship between two other students.
router.use(requireDatabase, authenticate);

router.get('/follow-status', validate(followStatusRules), followController.followStatus);
router.get('/:userId/followers', validate(relationListRules), followController.followers);
router.get('/:userId/following', validate(relationListRules), followController.following);
router.get('/:userId/relationship', validate(userRules), followController.relationship);
router.post('/:userId/follow', followRateLimiter, validate(userRules), followController.follow);
router.delete('/:userId/follow', followRateLimiter, validate(userRules), followController.unfollow);
router.post('/:userId/block', blockRateLimiter, validate(userRules), followController.block);
router.delete('/:userId/block', blockRateLimiter, validate(userRules), followController.unblock);

export default router;
