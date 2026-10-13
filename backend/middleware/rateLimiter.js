import { rateLimit } from 'express-rate-limit';
import env from '../config/env.js';
import { ADMIN_RATE_LIMITS } from '../config/adminConfig.js';
import { ANONYMOUS_RATE_LIMITS } from '../data/anonymousOptions.js';
import { HARD_LIMITS } from '../config/moderationLimits.js';
import { RECOMMENDATION_RATE_LIMITS } from '../config/recommendationConfig.js';
import { ROADMAP_RATE_LIMITS } from '../data/roadmapOptions.js';
import { AUTH_RATE_LIMITS } from '../config/securityConfig.js';
import { SEARCH_RATE_LIMITS } from '../data/searchOptions.js';
import { SOCIAL_RATE_LIMITS } from '../data/socialOptions.js';
import ApiError from '../utils/ApiError.js';
import { recordRateLimitHit } from '../services/securityService.js';
import { SharedCounterStore } from '../utils/sharedCounterStore.js';

const MINUTE = 60 * 1000;

// Kept here too: older modules import the shared store from this file.
export { SharedCounterStore };

/**
 * Builds a limiter that reports through the central error handler, so 429s use
 * the same JSON shape as every other error. Every refusal is also a security event
 * (services/securityService.js recordRateLimitHit) under `label` (or `name`); Anonymous Zone
 * limiters pass `anonymousZone`, so that event never names the student or their address.
 */
export function createRateLimiter({
  windowMs = 15 * MINUTE,
  limit = 300,
  message = 'Too many requests. Please slow down and try again shortly.',
  skipSuccessfulRequests = false,
  skipFailedRequests = false,
  keyGenerator,
  skip,
  // Set to count on the shared store (Redis, or memory as a fallback); see SharedCounterStore.
  name,
  label = name ?? 'api',
  anonymousZone = false,
} = {}) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    skipFailedRequests,
    ...(keyGenerator && { keyGenerator }),
    ...(skip && { skip }),
    ...(name && { store: new SharedCounterStore(name) }),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      recordRateLimitHit(req, label, { anonymousZone });
      next(new ApiError(options.statusCode, message));
    },
  });
}

/** Whole API: RATE_LIMIT_MAX per 15 min per IP, generous so shared campus networks never hit it. */
export const apiRateLimiter = createRateLimiter({ limit: env.rateLimitMax });

/*
 * Auth limits are per IP (config/securityConfig.js AUTH_RATE_LIMITS). A whole college network can
 * share one IP, so they are set to stop automated guessing rather than to throttle a busy campus.
 * Per-account lockout (MAX_LOGIN_ATTEMPTS) is the main defence against password guessing.
 */

// Only failed attempts count, so students signing in successfully never use up the budget.
export const loginRateLimiter = createRateLimiter({
  label: 'login',
  windowMs: AUTH_RATE_LIMITS.login.windowMinutes * MINUTE,
  limit: AUTH_RATE_LIMITS.login.max,
  skipSuccessfulRequests: true,
  message: 'Too many sign-in attempts from this network. Please wait a few minutes and try again.',
});

export const registerRateLimiter = createRateLimiter({
  label: 'register',
  windowMs: AUTH_RATE_LIMITS.register.windowMinutes * MINUTE,
  limit: AUTH_RATE_LIMITS.register.max,
  message: 'Too many sign-ups from this network. Please try again later.',
});

/*
 * The limits below are counted per signed-in student (use them after authenticate), so classmates
 * sharing a campus network never block each other.
 */
const perStudent = (req) => `user:${req.user.id}`;

// Every attempt counts (right or wrong current password), on the shared store.
export const passwordChangeRateLimiter = createRateLimiter({
  name: 'password-change',
  windowMs: AUTH_RATE_LIMITS.passwordChange.windowMinutes * MINUTE,
  limit: AUTH_RATE_LIMITS.passwordChange.max,
  keyGenerator: perStudent,
  message: 'Too many password change attempts. Please wait a few minutes and try again.',
});

// Account deletion: every attempt counts (wrong password or not), on the shared store, like password change.
export const accountDeletionRateLimiter = createRateLimiter({
  name: 'account-deletion',
  windowMs: AUTH_RATE_LIMITS.accountDeletion.windowMinutes * MINUTE,
  limit: AUTH_RATE_LIMITS.accountDeletion.max,
  keyGenerator: perStudent,
  message: 'Too many account deletion attempts. Please wait a few minutes and try again.',
});

// Photos and videos cost Cloudinary storage and bandwidth. Only requests that carry files count.
export const mediaUploadRateLimiter = createRateLimiter({
  label: 'media-uploads',
  windowMs: 60 * MINUTE,
  limit: 30,
  keyGenerator: perStudent,
  skip: (req) => !req.is('multipart/form-data'),
  message: 'You have uploaded a lot of photos and videos recently. Please try again in a little while.',
});

export const postRateLimiter = createRateLimiter({
  label: 'posts',
  windowMs: 60 * MINUTE,
  limit: 30,
  keyGenerator: perStudent,
  message: "You've posted a lot in the last hour. Please take a short break and try again.",
});

// Counts communities actually created; a form with mistakes doesn't use up the allowance.
export const communityCreateRateLimiter = createRateLimiter({
  label: 'community-create',
  windowMs: 60 * MINUTE,
  limit: 10,
  skipFailedRequests: true,
  keyGenerator: perStudent,
  message: "You've created several communities in the last hour. Please try again a little later.",
});

// Projects and achievements created per student; a form with mistakes doesn't count.
export const showcaseCreateRateLimiter = createRateLimiter({
  label: 'showcase-create',
  windowMs: 60 * MINUTE,
  limit: 30,
  skipFailedRequests: true,
  keyGenerator: perStudent,
  message: "You've added a lot in the last hour. Please try again a little later.",
});

export const commentRateLimiter = createRateLimiter({
  label: 'comments',
  windowMs: 15 * MINUTE,
  limit: 60,
  keyGenerator: perStudent,
  message: "You're commenting very quickly. Please wait a moment and try again.",
});

// Marking notifications read and deleting them: generous for normal use (each tap is one request).
export const notificationMutationRateLimiter = createRateLimiter({
  label: 'notification-changes',
  windowMs: 15 * MINUTE,
  limit: 300,
  keyGenerator: perStudent,
  message: "You're updating notifications very quickly. Please wait a moment and try again.",
});

export const notificationPreferenceRateLimiter = createRateLimiter({
  label: 'notification-preferences',
  windowMs: 15 * MINUTE,
  limit: 30,
  keyGenerator: perStudent,
  message: "You've changed your notification settings a lot. Please try again in a few minutes.",
});

/*
 * Anonymous Zone: stricter limits from data/anonymousOptions.js (the only place they are set), on the
 * shared store so they hold across API instances when Redis is available. Successful requests count;
 * a form with mistakes doesn't use up the allowance.
 */
const anonymousLimiter = (kind) => {
  const { windowMinutes, max, message } = ANONYMOUS_RATE_LIMITS[kind];
  return createRateLimiter({ name: `anonymous-${kind}`, anonymousZone: true, windowMs: windowMinutes * MINUTE, limit: max, skipFailedRequests: true, keyGenerator: perStudent, message });
};

export const anonymousPostRateLimiter = anonymousLimiter('posts');
export const anonymousCommentRateLimiter = anonymousLimiter('comments');
export const anonymousReportRateLimiter = anonymousLimiter('reports');

/*
 * Search: per signed-in student, from data/searchOptions.js, on the shared store. One search reads several
 * collections, so these stop scripted floods from loading the database; normal searching (typing is
 * debounced by the app) never gets near them. Every request counts, including refused ones.
 */
const searchLimiter = (kind) => {
  const { windowMinutes, max, message } = SEARCH_RATE_LIMITS[kind];
  return createRateLimiter({ name: `search-${kind}`, windowMs: windowMinutes * MINUTE, limit: max, keyGenerator: perStudent, message });
};

export const searchRateLimiter = searchLimiter('search');
export const searchSuggestionRateLimiter = searchLimiter('suggestions');
export const searchHistoryRateLimiter = searchLimiter('history');

/*
 * Trust & Safety request limits (config/moderationLimits.js HARD_LIMITS), per student on the shared store:
 * likes (posts, projects and anonymous posts together), reports (the report API and the older report
 * endpoints), joining/leaving communities, and the moderators' case API. Every request counts.
 */
const trustLimiter = (kind) => {
  const { windowMinutes, max, message } = HARD_LIMITS[kind];
  return createRateLimiter({ name: `trust-${kind}`, windowMs: windowMinutes * MINUTE, limit: max, keyGenerator: perStudent, message });
};

export const likeRateLimiter = trustLimiter('likes');
export const reportRateLimiter = trustLimiter('reports');
export const communityActionRateLimiter = trustLimiter('communityActions');
export const moderationRateLimiter = trustLimiter('moderation');

/*
 * Recommendations (config/recommendationConfig.js), per student on the shared store. Ranked lists are
 * cached, so normal browsing (and the home page's one request) stays far below these.
 */
const recommendationLimiter = (kind) => {
  const { windowMinutes, max, message } = RECOMMENDATION_RATE_LIMITS[kind];
  return createRateLimiter({ name: `recommendations-${kind}`, windowMs: windowMinutes * MINUTE, limit: max, keyGenerator: perStudent, message });
};

export const recommendationRateLimiter = recommendationLimiter('read');
export const recommendationFeedbackRateLimiter = recommendationLimiter('feedback');
export const recommendationInteractionRateLimiter = recommendationLimiter('interactions');

/*
 * Admin control center (config/adminConfig.js), per staff member on the shared store: every admin
 * request, the actions that change something, and the audited anonymous-author lookup.
 */
const adminLimiter = (kind) => {
  const { windowMinutes, max, message } = ADMIN_RATE_LIMITS[kind];
  return createRateLimiter({ name: `admin-${kind}`, windowMs: windowMinutes * MINUTE, limit: max, keyGenerator: perStudent, message });
};

export const adminRateLimiter = adminLimiter('requests');
export const adminActionRateLimiter = adminLimiter('actions');
export const adminRevealRateLimiter = adminLimiter('reveal');

/*
 * Follows, blocks and direct messages (data/socialOptions.js), per student on the shared store. Every request
 * counts, including refused ones.
 */
const socialLimiter = (kind) => {
  const { windowMinutes, max, message } = SOCIAL_RATE_LIMITS[kind];
  return createRateLimiter({ name: `social-${kind}`, windowMs: windowMinutes * MINUTE, limit: max, keyGenerator: perStudent, message });
};

export const followRateLimiter = socialLimiter('follows');
export const blockRateLimiter = socialLimiter('blocks');
export const messageRateLimiter = socialLimiter('messages');
export const messageReadRateLimiter = socialLimiter('reads');
export const conversationRateLimiter = socialLimiter('conversations');

/** Semester Roadmap changes (milestone status, goal, selected semester), per student on the shared store. */
export const roadmapUpdateRateLimiter = createRateLimiter({
  name: 'roadmap-updates',
  windowMs: ROADMAP_RATE_LIMITS.updates.windowMinutes * MINUTE,
  limit: ROADMAP_RATE_LIMITS.updates.max,
  keyGenerator: perStudent,
  message: ROADMAP_RATE_LIMITS.updates.message,
});
