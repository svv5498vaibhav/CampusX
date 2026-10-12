import { Router } from 'express';
import { PERMISSIONS as P } from '../config/adminConfig.js';
import * as analyticsController from '../controllers/admin/analyticsController.js';
import * as auditController from '../controllers/admin/auditController.js';
import * as communityController from '../controllers/admin/communityController.js';
import * as contentController from '../controllers/admin/contentController.js';
import * as dashboardController from '../controllers/admin/dashboardController.js';
import * as moderationController from '../controllers/admin/moderationController.js';
import * as opportunityController from '../controllers/admin/opportunityController.js';
import * as reportController from '../controllers/admin/reportController.js';
import * as securityController from '../controllers/admin/securityController.js';
import * as userController from '../controllers/admin/userController.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { requirePermission as can } from '../middleware/adminPermission.js';
import { adminActionRateLimiter, adminRevealRateLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validateMiddleware.js';
import * as rules from '../validators/adminValidator.js';
import { createOpportunityRules, manageOpportunitiesRules, updateOpportunityRules } from '../validators/opportunityValidator.js';
import { mongoIdParam } from '../validators/commonValidators.js';

/*
 * The admin control center API, mounted at /api/v1/admin. Every route passes adminAuth first (database,
 * JWT + live session + active account, staff role from the database, per-staff rate limit, no-store),
 * then asks for its permission (config/adminConfig.js), then validates the request, and only then reaches
 * a controller. Students get 403 on all of it; moderators get 403 on admin-only areas.
 */
const router = Router();

router.use(adminAuth);

router.get('/session', dashboardController.getSession);
router.get('/system-status', can(P.VIEW_DASHBOARD), dashboardController.getSystemStatus);
router.get('/dashboard', can(P.VIEW_DASHBOARD), validate(rules.dashboardRules), dashboardController.getDashboard);

router.get('/moderation', can(P.REVIEW_MODERATION), validate(rules.listModerationRules), moderationController.listCases);
router.get('/moderation/:id', can(P.REVIEW_MODERATION), validate(rules.caseIdRules), moderationController.getCase);
router.patch('/moderation/:id', can(P.REVIEW_MODERATION), adminActionRateLimiter, validate(rules.decideCaseRules), moderationController.decideCase);
router.post('/moderation/:id/reveal-author', can(P.REVIEW_MODERATION, P.REVEAL_ANONYMOUS_AUTHOR), adminRevealRateLimiter, validate(rules.revealAuthorRules), moderationController.revealAuthor);

router.get('/reports', can(P.VIEW_REPORTS), validate(rules.listReportsRules), reportController.listReports);
router.get('/reports/:id', can(P.VIEW_REPORTS), validate(rules.reportIdRules), reportController.getReport);
router.patch('/reports/:id', can(P.VIEW_REPORTS, P.REVIEW_MODERATION), adminActionRateLimiter, validate(rules.reportActionRules), reportController.actOnReport);

router.get('/users', can(P.MANAGE_USERS), validate(rules.listUsersRules), userController.listUsers);
router.get('/users/:id', can(P.MANAGE_USERS), validate(rules.userIdRules), userController.getUser);
router.patch('/users/:id/status', can(P.MANAGE_USERS), adminActionRateLimiter, validate(rules.userStatusRules), userController.changeStatus);

router.get('/content', can(P.MANAGE_CONTENT), validate(rules.listContentRules), contentController.listContent);
router.patch('/content/:type/:id', can(P.MANAGE_CONTENT), adminActionRateLimiter, validate(rules.contentActionRules), contentController.actOnContent);

router.get('/communities', can(P.MANAGE_COMMUNITIES), validate(rules.listCommunitiesRules), communityController.listCommunities);
router.patch('/communities/:id', can(P.MANAGE_COMMUNITIES), adminActionRateLimiter, validate(rules.communityActionRules), communityController.actOnCommunity);

// Phase 8 handlers and validators, behind the admin gate (the :opportunityId name is what they read).
router.get('/opportunities', can(P.MANAGE_OPPORTUNITIES), validate(manageOpportunitiesRules), opportunityController.listOpportunities);
router.post('/opportunities', can(P.MANAGE_OPPORTUNITIES), adminActionRateLimiter, validate(createOpportunityRules), opportunityController.createOpportunity);
router.patch('/opportunities/:opportunityId', can(P.MANAGE_OPPORTUNITIES), adminActionRateLimiter, validate([mongoIdParam('opportunityId'), ...updateOpportunityRules]), opportunityController.updateOpportunity);
router.delete('/opportunities/:opportunityId', can(P.MANAGE_OPPORTUNITIES), adminActionRateLimiter, validate([mongoIdParam('opportunityId')]), opportunityController.deleteOpportunity);

router.get('/analytics', can(P.VIEW_ANALYTICS), validate(rules.analyticsRules), analyticsController.getAnalytics);
router.get('/audit-logs', can(P.VIEW_AUDIT_LOGS), validate(rules.auditLogRules), auditController.listAuditLogs);

// Phase 16: how CampusX is protected right now (admins only). Never secrets or connection details.
router.get('/security/status', can(P.VIEW_SECURITY), securityController.getStatus);

export default router;
