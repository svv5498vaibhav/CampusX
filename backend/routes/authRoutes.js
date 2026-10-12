import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate, identifySession } from '../middleware/authMiddleware.js';
import { loginRateLimiter, passwordChangeRateLimiter, registerRateLimiter } from '../middleware/rateLimiter.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { requireTrustedOrigin } from '../middleware/trustedOrigin.js';
import { validate } from '../middleware/validateMiddleware.js';
import { changePasswordRules, loginRules, registerRules } from '../validators/authValidators.js';

const router = Router();

// Every auth route reads or writes users/sessions.
router.use(requireDatabase);

router.post('/register', registerRateLimiter, requireTrustedOrigin, validate(registerRules), authController.register);
router.post('/login', loginRateLimiter, requireTrustedOrigin, validate(loginRules), authController.login);
router.post('/refresh', requireTrustedOrigin, authController.refresh);
router.post('/logout', requireTrustedOrigin, identifySession, authController.logout);
router.get('/me', authenticate, authController.me);
router.put('/password', authenticate, passwordChangeRateLimiter, validate(changePasswordRules), authController.changePassword);

export default router;
