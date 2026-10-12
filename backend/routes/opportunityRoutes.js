import { Router } from 'express';
import * as opportunityController from '../controllers/opportunityController.js';
import { authenticate, authorizeRoles } from '../middleware/authMiddleware.js';
import { mediaUploadRateLimiter, reportRateLimiter, showcaseCreateRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { uploadImage } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { ROLES } from '../models/User.js';
import {
  createOpportunityRules,
  listOpportunitiesRules,
  manageOpportunitiesRules,
  myOpportunitiesRules,
  reportOpportunityRules,
  trackOpportunityRules,
  updateOpportunityRules,
  updateTrackingRules,
} from '../validators/opportunityValidator.js';

const router = Router();

// Opportunities are for signed-in CampusX users. Any student can discover, track and report them;
// only CampusX moderators and admins create, edit, publish, close, archive or delete them (403 for
// everyone else, checked before the request body or any file is read). Tracking always belongs to the
// signed-in student, and eligibility always uses their own profile.
router.use(requireDatabase, authenticate);
const staffOnly = authorizeRoles(ROLES.ADMIN, ROLES.MODERATOR);

router.get('/options', opportunityController.getOptions);
router.get('/recommended', opportunityController.listRecommended);
router.get('/my', validate(myOpportunitiesRules), opportunityController.listMine);
router.get('/manage', staffOnly, validate(manageOpportunitiesRules), opportunityController.listForStaff);
router.get('/', validate(listOpportunitiesRules), opportunityController.listOpportunities);
router.post('/', staffOnly, showcaseCreateRateLimiter, validate(createOpportunityRules), opportunityController.createOpportunity);

router.get('/:opportunityId', opportunityController.getOpportunity);
router.put('/:opportunityId', staffOnly, validate(updateOpportunityRules), opportunityController.updateOpportunity);
router.delete('/:opportunityId', staffOnly, opportunityController.deleteOpportunity);

router.post('/:opportunityId/track', validate(trackOpportunityRules), opportunityController.trackOpportunity);
router.patch('/:opportunityId/status', validate(updateTrackingRules), opportunityController.updateTrackingStatus);
router.delete('/:opportunityId/track', opportunityController.removeTracking);
router.post('/:opportunityId/report', reportRateLimiter, validate(reportOpportunityRules), opportunityController.reportOpportunity);

router.post('/:opportunityId/image', staffOnly, opportunityController.requireOpportunity, mediaUploadRateLimiter, uploadImage('opportunityImage', 'image'), opportunityController.image.upload);
router.delete('/:opportunityId/image', staffOnly, opportunityController.image.remove);
router.post('/:opportunityId/logo', staffOnly, opportunityController.requireOpportunity, mediaUploadRateLimiter, uploadImage('opportunityLogo', 'logo'), opportunityController.logo.upload);
router.delete('/:opportunityId/logo', staffOnly, opportunityController.logo.remove);

export default router;
