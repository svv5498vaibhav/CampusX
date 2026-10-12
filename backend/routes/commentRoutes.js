import { Router } from 'express';
import * as commentController from '../controllers/commentController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { commentRules } from '../validators/postValidator.js';

const router = Router();

// Comments are created and listed under /posts/:postId/comments. Here students can only change
// their own; the comment service checks the author against the session.
router.use(requireDatabase, authenticate);

router.put('/:commentId', validate(commentRules), commentController.updateComment);
router.delete('/:commentId', commentController.deleteComment);

export default router;
