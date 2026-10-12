import { Router } from 'express';
import * as achievementController from '../controllers/achievementController.js';
import { authenticate, authorizeRoles } from '../middleware/authMiddleware.js';
import { mediaUploadRateLimiter, showcaseCreateRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { uploadFiles } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { ACHIEVEMENT_RULES } from '../data/showcaseOptions.js';
import { ROLES } from '../models/User.js';
import {
  createAchievementRules,
  listAchievementsRules,
  reviewAchievementRules,
  updateAchievementRules,
  userAchievementsRules,
} from '../validators/achievementValidator.js';

const router = Router();

// Achievements are for signed-in CampusX students. The owner is always the signed-in student;
// verificationStatus is controlled by the server (proof → pending) and moderators (verified/rejected).
router.use(requireDatabase, authenticate);

const uploadProof = uploadFiles('proof', {
  presets: ['achievementProofImage', 'achievementProofPdf'],
  maxFiles: ACHIEVEMENT_RULES.proof.max,
  messages: {
    tooLarge: 'Proof files can be up to 10 MB.',
    unsupported: 'Proof must be a JPG, PNG or WEBP image, or a PDF.',
    tooMany: `An achievement can have up to ${ACHIEVEMENT_RULES.proof.max} proof files.`,
    missing: 'Please choose a proof file.',
  },
});

router.get('/options', achievementController.getOptions);
router.get('/me', achievementController.listMine);
router.get('/user/:userId', validate(userAchievementsRules), achievementController.listUserAchievements);
router.get('/', validate(listAchievementsRules), achievementController.listAchievements);
router.post('/', showcaseCreateRateLimiter, validate(createAchievementRules), achievementController.createAchievement);

router.get('/:achievementId', achievementController.getAchievement);
router.put('/:achievementId', validate(updateAchievementRules), achievementController.updateAchievement);
router.delete('/:achievementId', achievementController.deleteAchievement);

router.post('/:achievementId/proof', achievementController.requireAchievementOwner, mediaUploadRateLimiter, uploadProof, achievementController.addProof);
router.delete('/:achievementId/proof/:proofId', achievementController.removeProof);

// For CampusX moderators and admins (the admin dashboard arrives in a later phase).
router.patch(
  '/:achievementId/verification',
  authorizeRoles(ROLES.ADMIN, ROLES.MODERATOR),
  validate(reviewAchievementRules),
  achievementController.reviewAchievement,
);

export default router;
