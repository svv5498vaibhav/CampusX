import { Router } from 'express';
import achievementRoutes from './achievementRoutes.js';
import adminRoutes from './adminRoutes.js';
import anonymousRoutes from './anonymousRoutes.js';
import authRoutes from './authRoutes.js';
import commentRoutes from './commentRoutes.js';
import communityRoutes from './communityRoutes.js';
import gamificationRoutes from './gamificationRoutes.js';
import healthRoutes from './healthRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import onboardingRoutes from './onboardingRoutes.js';
import opportunityRoutes from './opportunityRoutes.js';
import postRoutes from './postRoutes.js';
import projectRoutes from './projectRoutes.js';
import rankingRoutes from './rankingRoutes.js';
import profileRoutes from './profileRoutes.js';
import searchRoutes from './searchRoutes.js';
import moderationRoutes from './moderationRoutes.js';
import reportRoutes from './reportRoutes.js';
import recommendationRoutes from './recommendationRoutes.js';
import roadmapRoutes from './roadmapRoutes.js';
import resumeRoutes from './resumeRoutes.js';
import userRoutes from './userRoutes.js';
import conversationRoutes from './conversationRoutes.js';

/*
 * Version 1 API, mounted at /api/v1. Feature routers are added here as each phase lands.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/profile', profileRoutes);
router.use('/posts', postRoutes);
router.use('/comments', commentRoutes);
router.use('/communities', communityRoutes);
router.use('/projects', projectRoutes);
router.use('/achievements', achievementRoutes);
router.use('/opportunities', opportunityRoutes);
router.use('/anonymous', anonymousRoutes);
router.use('/rankings', rankingRoutes);
router.use('/gamification', gamificationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/search', searchRoutes);
router.use('/reports', reportRoutes);
router.use('/moderation', moderationRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/roadmap', roadmapRoutes);
router.use('/resumes', resumeRoutes);
router.use('/users', userRoutes);
router.use('/conversations', conversationRoutes);
router.use('/admin', adminRoutes);

export default router;
