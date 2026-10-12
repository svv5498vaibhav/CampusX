import { Router } from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { notificationMutationRateLimiter, notificationPreferenceRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { listRules, preferencesRules } from '../validators/notificationValidator.js';

const router = Router();

// The signed-in student's own notifications only. There is deliberately no route that creates a
// notification or chooses its recipient: notifications come from server-side events.
router.use(requireDatabase, authenticate);

router.get('/', validate(listRules), notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.get('/preferences', notificationController.preferences);
router.put('/preferences', notificationPreferenceRateLimiter, validate(preferencesRules), notificationController.updatePreferences);
router.patch('/read-all', notificationMutationRateLimiter, notificationController.markAllAsRead);
router.delete('/read', notificationMutationRateLimiter, notificationController.removeRead);
router.patch('/:id/read', notificationMutationRateLimiter, notificationController.markAsRead);
router.delete('/:id', notificationMutationRateLimiter, notificationController.remove);

export default router;
