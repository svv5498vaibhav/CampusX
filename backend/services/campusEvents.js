import { EventEmitter } from 'node:events';
import logger from '../utils/logger.js';

/**
 * In-process campus events. Services emit them after a change is saved; listeners react without the
 * services knowing about them:
 *   services/gamificationEvents.js   points, levels, badges and ranking milestones
 *   services/notificationEvents.js   in-app notifications (saved, then delivered over Socket.IO)
 *   sockets/socket.js                ends a device's live connections when it logs out
 *   services/admin/adminRealtime.js  live alerts for signed-in staff (new reports and cases)
 *   (Trust & Safety events come from services/moderationService.js and services/reportService.js)
 * Payloads carry ids only; listeners load whatever they need to show.
 */
export const campusEvents = new EventEmitter();

export const CAMPUS_EVENTS = Object.freeze({
  POST_CREATED: 'post:created',
  POST_UPDATED: 'post:updated',
  POST_DELETED: 'post:deleted',
  POST_LIKED: 'post:liked',
  POST_UNLIKED: 'post:unliked',
  POST_COMMENTED: 'post:commented',
  COMMENT_DELETED: 'comment:deleted',
  // Onboarding saved or profile edited (campus details or completeness may have changed).
  STUDENT_PROFILE_CHANGED: 'student:profile-changed',
  // Onboarding completed for the first time.
  STUDENT_ONBOARDED: 'student:onboarded',
  // A device's session ended (logout).
  AUTH_SESSION_ENDED: 'auth:session-ended',
  // A student changed their password ({ userId }); they get a security notice.
  AUTH_PASSWORD_CHANGED: 'auth:password-changed',
  PROJECT_CREATED: 'project:created',
  PROJECT_UPDATED: 'project:updated',
  PROJECT_DELETED: 'project:deleted',
  // Sent only when the like state actually changes.
  PROJECT_LIKED: 'project:liked',
  PROJECT_UNLIKED: 'project:unliked',
  // Students newly invited to a project team ({ projectId, ownerId, userIds }).
  PROJECT_TEAM_INVITED: 'project:team-invited',
  ACHIEVEMENT_CREATED: 'achievement:created',
  ACHIEVEMENT_UPDATED: 'achievement:updated',
  ACHIEVEMENT_DELETED: 'achievement:deleted',
  ACHIEVEMENT_REVIEWED: 'achievement:reviewed',
  // Gamification (Phase 10) results, turned into notifications.
  GAMIFICATION_LEVEL_REACHED: 'gamification:level-reached',
  GAMIFICATION_BADGES_EARNED: 'gamification:badges-earned',
  // A student gained points ({ userId }); ranking milestones are checked after it.
  GAMIFICATION_POINTS_EARNED: 'gamification:points-earned',
  // A student reached a better ranking milestone than ever before ({ userId, scope, tier, rank, scopeName }).
  GAMIFICATION_RANK_MILESTONE: 'gamification:rank-milestone',
  // Semester Roadmap: a milestone or the career goal changed ({ userId, semesters: the semesters affected }).
  ROADMAP_PROGRESS_CHANGED: 'roadmap:progress-changed',
  COMMUNITY_CREATED: 'community:created',
  COMMUNITY_UPDATED: 'community:updated',
  COMMUNITY_ARCHIVED: 'community:archived',
  COMMUNITY_MEMBER_JOINED: 'community:member-joined',
  COMMUNITY_MEMBER_LEFT: 'community:member-left',
  COMMUNITY_MEMBER_REMOVED: 'community:member-removed',
  COMMUNITY_ROLE_CHANGED: 'community:role-changed',
  // Opportunities. Status events carry `previousStatus`; OPPORTUNITY_UPDATED's `changed` lists only the
  // fields whose values really changed. Deadline reminders come from jobs/opportunityDeadlineReminders.js.
  OPPORTUNITY_PUBLISHED: 'opportunity:published',
  OPPORTUNITY_UPDATED: 'opportunity:updated',
  OPPORTUNITY_CLOSED: 'opportunity:closed',
  OPPORTUNITY_ARCHIVED: 'opportunity:archived',
  OPPORTUNITY_DELETED: 'opportunity:deleted',
  OPPORTUNITY_TRACKING_CHANGED: 'opportunity:tracking-changed',
  OPPORTUNITY_REPORTED: 'opportunity:reported',
  // Anonymous Zone. Payloads never carry a user id: a listener that tells the author about a comment
  // looks the author up itself and says "Someone commented on your anonymous post", never who.
  // ANONYMOUS_POST_LIKED is only sent for a new like from someone other than the author.
  ANONYMOUS_POST_LIKED: 'anonymous:post-liked',
  ANONYMOUS_POST_CREATED: 'anonymous:post-created',
  ANONYMOUS_POST_UPDATED: 'anonymous:post-updated',
  ANONYMOUS_POST_DELETED: 'anonymous:post-deleted',
  ANONYMOUS_POST_COMMENTED: 'anonymous:post-commented',
  ANONYMOUS_CONTENT_REPORTED: 'anonymous:content-reported',
  // Trust & Safety. CONTENT_MODERATED: { targetType, targetId, previousStatus, newStatus, automated,
  // notify, ownerId? (never for anonymous content), parentId? (the post of a comment) }.
  CONTENT_MODERATED: 'moderation:content-moderated',
  // A warning or temporary restriction for a student: { userId, action: 'warning' | 'restriction', until? }.
  MODERATION_USER_ACTION: 'moderation:user-action',
  // A moderator closed a student's report: { reportId, reporterId, outcome: 'resolved' | 'dismissed' }.
  REPORT_REVIEWED: 'moderation:report-reviewed',
  // Admin control center (services/admin/adminRealtime.js tells signed-in staff). Ids, types and levels
  // only: never the reporter, the content owner or an anonymous author.
  // { reportId, targetType, targetId, reason, priority }
  REPORT_CREATED: 'moderation:report-created',
  // A new case (not one that was added to): { caseId, targetType, targetId, riskLevel, priority, source }
  MODERATION_CASE_OPENED: 'moderation:case-opened',
});

/** A failing listener must never break the request that triggered the event. */
export function emitCampusEvent(name, payload) {
  try {
    campusEvents.emit(name, payload);
  } catch (error) {
    logger.warn(`Campus event listener for "${name}" failed: ${error?.message ?? error}`);
  }
}
