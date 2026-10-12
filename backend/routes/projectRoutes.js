import { Router } from 'express';
import * as projectController from '../controllers/projectController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { likeRateLimiter, mediaUploadRateLimiter, showcaseCreateRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { uploadFiles } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { PROJECT_RULES } from '../data/showcaseOptions.js';
import {
  createProjectRules,
  listProjectsRules,
  teamCandidatesRules,
  updateProjectRules,
  userProjectsRules,
} from '../validators/projectValidator.js';

const router = Router();

// Projects are for signed-in CampusX students. The owner is always the signed-in student (req.user);
// edit, delete and media changes check ownership in the project service before anything changes.
router.use(requireDatabase, authenticate);

const uploadProjectImages = uploadFiles('images', {
  presets: ['projectImage'],
  maxFiles: PROJECT_RULES.images.max,
  messages: {
    tooLarge: 'Please choose images smaller than 5 MB.',
    unsupported: 'Only JPG, PNG, and WEBP images are supported.',
    tooMany: `A project can have up to ${PROJECT_RULES.images.max} images.`,
    missing: 'Please choose at least one image.',
  },
});

router.get('/options', projectController.getOptions);
router.get('/me', projectController.listMine);
router.get('/team-candidates', validate(teamCandidatesRules), projectController.teamCandidates);
router.get('/user/:userId', validate(userProjectsRules), projectController.listUserProjects);
router.get('/', validate(listProjectsRules), projectController.listProjects);
router.post('/', showcaseCreateRateLimiter, validate(createProjectRules), projectController.createProject);

router.get('/:projectId', projectController.getProject);
router.put('/:projectId', validate(updateProjectRules), projectController.updateProject);
router.delete('/:projectId', projectController.deleteProject);

router.post('/:projectId/images', projectController.requireProjectOwner, mediaUploadRateLimiter, uploadProjectImages, projectController.addImages);
router.delete('/:projectId/images/:imageId', projectController.removeImage);

router.post('/:projectId/like', likeRateLimiter, projectController.likeProject);
router.delete('/:projectId/like', likeRateLimiter, projectController.unlikeProject);

router.post('/:projectId/team/accept', projectController.acceptInvitation);
router.delete('/:projectId/team/me', projectController.leaveTeam);

export default router;
