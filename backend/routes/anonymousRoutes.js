import { Router } from 'express';
import * as anonymousController from '../controllers/anonymousController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { anonymousCommentRateLimiter, anonymousPostRateLimiter, anonymousReportRateLimiter, likeRateLimiter, mediaUploadRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { uploadFiles } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { ANONYMOUS_RULES } from '../data/anonymousOptions.js';
import {
  anonymousCommentRules,
  anonymousReportRules,
  createAnonymousPostRules,
  listAnonymousCommentsRules,
  listAnonymousPostsRules,
  myAnonymousPostsRules,
  updateAnonymousPostRules,
} from '../validators/anonymousValidator.js';

const router = Router();

// The Anonymous Zone is for signed-in CampusX students only. Authors are always the signed-in student
// (stored for safety, never shown); visibility and ownership are checked in the services against the
// student's own profile and memberships. No route here ever returns who wrote something.
router.use(requireDatabase, authenticate);

// Optional photos with a new post (multipart), or plain JSON without them.
const uploadImages = uploadFiles('images', {
  presets: ['anonymousImage'],
  maxFiles: ANONYMOUS_RULES.media.maxImages,
  optional: true,
  maxFields: 6,
  messages: {
    tooLarge: 'Please choose images smaller than 5 MB.',
    unsupported: 'Only JPG, PNG, and WEBP images are supported.',
    tooMany: `A post can have up to ${ANONYMOUS_RULES.media.maxImages} images.`,
    missing: 'Please choose an image.',
  },
});

router.get('/options', anonymousController.getOptions);
router.get('/me', validate(myAnonymousPostsRules), anonymousController.listMine);

router.get('/posts', validate(listAnonymousPostsRules), anonymousController.listPosts);
router.post('/posts', anonymousPostRateLimiter, mediaUploadRateLimiter, uploadImages, validate(createAnonymousPostRules), anonymousController.createPost);
router.get('/posts/:postId', anonymousController.getPost);
router.put('/posts/:postId', validate(updateAnonymousPostRules), anonymousController.updatePost);
router.delete('/posts/:postId', anonymousController.deletePost);

router.post('/posts/:postId/like', likeRateLimiter, anonymousController.likePost);
router.delete('/posts/:postId/like', likeRateLimiter, anonymousController.unlikePost);
router.post('/posts/:postId/report', anonymousReportRateLimiter, validate(anonymousReportRules), anonymousController.reportPost);

router.get('/posts/:postId/comments', validate(listAnonymousCommentsRules), anonymousController.listComments);
router.post('/posts/:postId/comments', anonymousCommentRateLimiter, validate(anonymousCommentRules), anonymousController.addComment);
router.put('/comments/:commentId', validate(anonymousCommentRules), anonymousController.updateComment);
router.delete('/comments/:commentId', anonymousController.deleteComment);
router.post('/comments/:commentId/report', anonymousReportRateLimiter, validate(anonymousReportRules), anonymousController.reportComment);

export default router;
