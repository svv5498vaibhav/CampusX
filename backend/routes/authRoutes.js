import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate, identifySession } from '../middleware/authMiddleware.js';
import { accountDeletionRateLimiter, loginRateLimiter, passwordChangeRateLimiter, registerRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { requireTrustedOrigin } from '../middleware/trustedOrigin.js';
import { validate } from '../middleware/validateMiddleware.js';
import { changePasswordRules, deleteAccountRules, loginRules, registerRules } from '../validators/authValidators.js';

const router = Router();

// Every auth route reads or writes users/sessions.
router.use(requireDatabase);

router.post('/register', registerRateLimiter, requireTrustedOrigin, validate(registerRules), authController.register);
router.post('/login', loginRateLimiter, requireTrustedOrigin, validate(loginRules), authController.login);
router.post('/refresh', requireTrustedOrigin, authController.refresh);
router.post('/logout', requireTrustedOrigin, identifySession, authController.logout);
router.get('/me', authenticate, authController.me);
router.put('/password', authenticate, passwordChangeRateLimiter, validate(changePasswordRules), authController.changePassword);
// Permanent: the signed-in student's own account only (no id in the path), password + typed confirmation.
// It clears the refresh cookie, so it is origin-checked like the other cookie routes.
router.delete('/account', requireTrustedOrigin, authenticate, accountDeletionRateLimiter, validate(deleteAccountRules), authController.deleteAccount);

export default router;
