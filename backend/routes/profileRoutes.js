import { Router } from 'express';
import * as profileController from '../controllers/profileController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { mediaUploadRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { uploadImage } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { updateProfileRules } from '../validators/profileValidators.js';

const router = Router();

// Profiles are visible to signed-in CampusX members only. Every change applies to the signed-in
// student (req.user from the session); no route accepts an id to change someone else's profile.
// Authentication runs before any upload is read, so anonymous files never reach the disk.
router.use(requireDatabase, authenticate);

router.get('/', profileController.getOwnProfile);
router.get('/options', profileController.getEditorOptions);
router.put('/', validate(updateProfileRules), profileController.updateProfile);

router.post('/avatar', mediaUploadRateLimiter, uploadImage('profilePhoto', 'photo'), profileController.avatar.upload);
router.delete('/avatar', profileController.avatar.remove);
router.post('/cover', mediaUploadRateLimiter, uploadImage('coverImage', 'cover'), profileController.cover.upload);
router.delete('/cover', profileController.cover.remove);

router.get('/:userId', profileController.getPublicProfile);
router.all(['/:userId', '/:userId/avatar', '/:userId/cover'], profileController.refuseOtherProfiles);

export default router;
