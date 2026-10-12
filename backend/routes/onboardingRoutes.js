import { Router } from 'express';
import * as onboardingController from '../controllers/onboardingController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { validate } from '../middleware/validateMiddleware.js';
import { saveOnboardingRules } from '../validators/onboardingValidators.js';

const router = Router();

// Every onboarding route belongs to the signed-in student; whose account is used comes from the
// session, never from the request.
router.use(requireDatabase, authenticate);

router.get('/status', onboardingController.getStatus);
router.get('/options', onboardingController.getOptions);
router.put('/', validate(saveOnboardingRules), onboardingController.save);

export default router;
