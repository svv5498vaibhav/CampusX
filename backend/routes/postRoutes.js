import { Router } from 'express';
import * as postController from '../controllers/postController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { commentRateLimiter, likeRateLimiter, mediaUploadRateLimiter, postRateLimiter, reportRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { uploadPostMedia } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import {
  commentRules,
  createPostRules,
  listCommentsRules,
  listPostsRules,
  reportPostRules,
  updatePostRules,
} from '../validators/postValidator.js';

const router = Router();

// The feed is for signed-in CampusX students. Authors always come from the session (req.user);
// edit and delete check ownership in the post service before anything changes.
router.use(requireDatabase, authenticate);

router.get('/options', postController.getOptions);
router.get('/', validate(listPostsRules), postController.listPosts);
router.post(
  '/',
  postRateLimiter,
  mediaUploadRateLimiter,
  uploadPostMedia('media'),
  validate(createPostRules),
  postController.createPost,
);

router.get('/:postId', postController.getPost);
router.put(
  '/:postId',
  postController.requirePostOwner,
  mediaUploadRateLimiter,
  uploadPostMedia('media'),
  validate(updatePostRules),
  postController.updatePost,
);
router.delete('/:postId', postController.deletePost);

router.post('/:postId/like', likeRateLimiter, postController.likePost);
router.delete('/:postId/like', likeRateLimiter, postController.unlikePost);
router.post('/:postId/save', postController.savePost);
router.delete('/:postId/save', postController.unsavePost);
router.post('/:postId/report', reportRateLimiter, validate(reportPostRules), postController.reportPost);

router.get('/:postId/comments', validate(listCommentsRules), postController.listComments);
router.post('/:postId/comments', commentRateLimiter, validate(commentRules), postController.addComment);

export default router;
