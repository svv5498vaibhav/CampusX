import { Router } from 'express';
import * as messageController from '../controllers/messageController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { conversationRateLimiter, messageRateLimiter, messageReadRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { conversationRules, historyRules, inboxRules, openConversationRules, sendMessageRules } from '../validators/socialValidator.js';

const router = Router();

// Direct messages. Every conversation is looked up among the signed-in student's own (anyone else's answers
// 404), and the sender of a message is always req.user. Sockets only deliver what these routes saved.
router.use(requireDatabase, authenticate);

router.get('/', validate(inboxRules), messageController.list);
router.get('/unread-count', messageController.unreadCount);
router.post('/', conversationRateLimiter, validate(openConversationRules), messageController.open);
router.get('/:conversationId', validate(conversationRules), messageController.get);
router.get('/:conversationId/messages', validate(historyRules), messageController.messages);
router.post('/:conversationId/messages', messageRateLimiter, validate(sendMessageRules), messageController.send);
router.post('/:conversationId/read', messageReadRateLimiter, validate(conversationRules), messageController.read);

export default router;
