import { Router } from 'express';
import * as communityController from '../controllers/communityController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { communityActionRateLimiter, communityCreateRateLimiter, mediaUploadRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { uploadImage } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import {
  changeRoleRules,
  communityPostsRules,
  createCommunityRules,
  listCommunitiesRules,
  listMembersRules,
  updateCommunityRules,
} from '../validators/communityValidator.js';

const router = Router();

// Communities are for signed-in CampusX students. Access rules, ownership and roles are checked in the
// community service against the student's own profile (req.user), never against request data.
router.use(requireDatabase, authenticate);

router.get('/options', communityController.getOptions);
router.get('/me', communityController.listMine);
router.get('/recommended', communityController.listRecommended);
router.get('/', validate(listCommunitiesRules), communityController.listCommunities);
router.post('/', communityCreateRateLimiter, validate(createCommunityRules), communityController.createCommunity);

router.get('/:communityId', communityController.getCommunity);
router.put('/:communityId', validate(updateCommunityRules), communityController.updateCommunity);
router.delete('/:communityId', communityController.archiveCommunity);

router.post('/:communityId/join', communityActionRateLimiter, communityController.joinCommunity);
router.delete('/:communityId/leave', communityActionRateLimiter, communityController.leaveCommunity);
router.get('/:communityId/members', validate(listMembersRules), communityController.listMembers);
router.patch('/:communityId/members/:userId/role', validate(changeRoleRules), communityController.changeMemberRole);
router.delete('/:communityId/members/:userId', communityController.removeMember);
router.get('/:communityId/posts', validate(communityPostsRules), communityController.listPosts);

router.post('/:communityId/icon', communityController.requireCommunityOwner, mediaUploadRateLimiter, uploadImage('communityIcon', 'icon'), communityController.icon.upload);
router.delete('/:communityId/icon', communityController.icon.remove);
router.post('/:communityId/cover', communityController.requireCommunityOwner, mediaUploadRateLimiter, uploadImage('communityCover', 'cover'), communityController.cover.upload);
router.delete('/:communityId/cover', communityController.cover.remove);

export default router;
