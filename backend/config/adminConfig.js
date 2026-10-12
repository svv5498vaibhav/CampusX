/**
 * Admin control center (Phase 15): permissions, what each role is granted, the actions each screen
 * offers, page sizes, cache lifetimes and request limits, in one place. The admin middleware and
 * services read only from here; the frontend learns the signed-in staff member's permissions from
 * GET /api/v1/admin/session and never decides access on its own.
 *
 * Authorization is permission-based, not `role === 'admin'`: a route asks for a permission and the
 * role's grant list answers. Students have no permissions at all.
 */

export const PERMISSIONS = Object.freeze({
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_REPORTS: 'VIEW_REPORTS',
  REVIEW_MODERATION: 'REVIEW_MODERATION',
  MANAGE_CONTENT: 'MANAGE_CONTENT',
  MANAGE_OPPORTUNITIES: 'MANAGE_OPPORTUNITIES',
  // The audited lookup of who wrote anonymous content under an open moderation case.
  REVEAL_ANONYMOUS_AUTHOR: 'REVEAL_ANONYMOUS_AUTHOR',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_COMMUNITIES: 'MANAGE_COMMUNITIES',
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  // Changing the account status of other staff (moderators). Admin accounts are never changed here.
  MANAGE_SYSTEM: 'MANAGE_SYSTEM',
  // The security status report (GET /admin/security/status): configuration and security events, never secrets.
  VIEW_SECURITY: 'VIEW_SECURITY',
});
export const PERMISSION_IDS = Object.freeze(Object.values(PERMISSIONS));

const P = PERMISSIONS;

/** Admins: everything. Moderators: moderation, reports, content review and opportunities (as in Phase 8). */
export const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze([...PERMISSION_IDS]),
  moderator: Object.freeze([P.VIEW_DASHBOARD, P.VIEW_REPORTS, P.REVIEW_MODERATION, P.MANAGE_CONTENT, P.MANAGE_OPPORTUNITIES, P.REVEAL_ANONYMOUS_AUTHOR]),
  student: Object.freeze([]),
});

export const STAFF_ROLES = Object.freeze(['admin', 'moderator']);

export const permissionsFor = (role) => ROLE_PERMISSIONS[role] ?? [];
export const hasPermission = (user, permission) => Boolean(user) && permissionsFor(user.role).includes(permission);

// ----------------------------------------------------------------------------- lists and caches

export const ADMIN_PAGE_SIZE = Object.freeze({ default: 20, max: 50 });

/** Seconds. Statistics are recomputed at most this often (Redis when connected, otherwise memory). */
export const ADMIN_CACHE_SECONDS = Object.freeze({ dashboard: 30, moderationSummary: 30, analytics: 120 });

/** Dashboard windows, in days. "Active" = signed in or used CampusX within `activeDays`. */
export const DASHBOARD_RULES = Object.freeze({ activityDays: 14, trendDays: 7, activeDays: 7, threats: 5, auditStream: 8 });

export const ANALYTICS_RANGES = Object.freeze({ '7d': 7, '30d': 30, '90d': 90 });
export const ANALYTICS_RULES = Object.freeze({ topColleges: 8, topBranches: 10, topOpportunities: 5 });

// ----------------------------------------------------------------------------- actions

/** Reasons typed by staff (stored in the audit log, shown to other staff only). */
export const REASON_RULES = Object.freeze({ min: 5, max: 500 });
export const REVEAL_REASON_RULES = Object.freeze({ min: 10, max: 300 });

/**
 * Moderation case decisions offered in the control center (services/moderationCaseService.js applies
 * them). `confirm`: the request must carry confirm: true (the UI asks first); `reason`: a reason is required.
 */
export const CASE_ACTIONS = Object.freeze({
  approve: { label: 'Approve', confirm: false, reason: false },
  flag: { label: 'Flag', confirm: false, reason: false },
  restrict: { label: 'Restrict', confirm: true, reason: true },
  remove: { label: 'Remove', confirm: true, reason: true },
  escalate: { label: 'Escalate', confirm: false, reason: false },
  warn: { label: 'Warn owner', confirm: true, reason: true },
  dismiss: { label: 'Dismiss', confirm: false, reason: false },
});
export const CASE_ACTION_IDS = Object.freeze(Object.keys(CASE_ACTIONS));

/**
 * Report actions: review (pending → reviewing), resolve (action taken), reject (no guideline problem) and
 * escalate (critical priority, the case goes to reviewing). Each only applies from the listed statuses.
 */
export const REPORT_ACTIONS = Object.freeze({
  review: { from: ['pending'], audit: 'REPORT_REVIEWING' },
  resolve: { from: ['pending', 'reviewing'], to: 'resolved', audit: 'REPORT_RESOLVED' },
  reject: { from: ['pending', 'reviewing'], to: 'dismissed', audit: 'REPORT_REJECTED' },
  escalate: { from: ['pending', 'reviewing'], audit: 'REPORT_ESCALATED' },
});
export const REPORT_ACTION_IDS = Object.freeze(Object.keys(REPORT_ACTIONS));

/** Account status changes. Never on your own account, never on an admin account. */
export const USER_STATUS_ACTIONS = Object.freeze({
  suspend: { from: ['active', 'pending'], to: 'suspended', confirm: true, reason: true, audit: 'USER_SUSPENDED' },
  unsuspend: { from: ['suspended'], to: 'active', confirm: false, reason: false, audit: 'USER_UNSUSPENDED' },
  block: { from: ['active', 'pending', 'suspended'], to: 'blocked', confirm: true, reason: true, audit: 'USER_BLOCKED' },
  activate: { from: ['pending', 'blocked', 'deactivated'], to: 'active', confirm: false, reason: false, audit: 'USER_ACTIVATED' },
  deactivate: { from: ['active', 'pending', 'suspended'], to: 'deactivated', confirm: true, reason: true, audit: 'USER_DEACTIVATED' },
});
export const USER_STATUS_ACTION_IDS = Object.freeze(Object.keys(USER_STATUS_ACTIONS));

/** Content the content-management screen lists (one tab each). */
export const CONTENT_TYPES = Object.freeze({
  post: { label: 'Posts' },
  comment: { label: 'Comments' },
  project: { label: 'Projects' },
  achievement: { label: 'Achievements' },
  anonymousPost: { label: 'Anonymous posts', anonymous: true },
});
export const CONTENT_TYPE_IDS = Object.freeze(Object.keys(CONTENT_TYPES));

/**
 * Direct content actions (through the open case when there is one). verify/reject are achievement
 * verification (Phase 7's moderator review) and apply only to achievements with submitted proof.
 */
export const CONTENT_ACTIONS = Object.freeze({
  approve: { moderation: 'ALLOW', decision: 'approve', confirm: false, reason: false, label: 'Approve' },
  flag: { moderation: 'FLAG', decision: 'flag', confirm: false, reason: false, label: 'Flag' },
  restrict: { moderation: 'HOLD', decision: 'restrict', confirm: true, reason: true, label: 'Restrict' },
  remove: { moderation: 'REMOVE', decision: 'remove', confirm: true, reason: true, label: 'Remove' },
  verify: { verification: 'verified', confirm: false, reason: false, label: 'Verify', achievementOnly: true },
  reject: { verification: 'rejected', confirm: false, reason: true, label: 'Reject proof', achievementOnly: true },
});
export const CONTENT_ACTION_IDS = Object.freeze(Object.keys(CONTENT_ACTIONS));

/** Community actions: suspend = restricted (hidden from non-members and search), restore, remove. */
export const COMMUNITY_ACTIONS = Object.freeze({
  suspend: { moderation: 'HOLD', decision: 'restrict', confirm: true, reason: true },
  restore: { moderation: 'ALLOW', decision: 'approve', confirm: false, reason: false },
  remove: { moderation: 'REMOVE', decision: 'remove', confirm: true, reason: true },
});
export const COMMUNITY_ACTION_IDS = Object.freeze(Object.keys(COMMUNITY_ACTIONS));

// ----------------------------------------------------------------------------- audit log

/** Groups for the audit log filter. Anything not listed falls under "content" (moderation decisions). */
export const AUDIT_CATEGORIES = Object.freeze({
  // Phase 16 adds the automated security events about accounts (services/securityService.js).
  security: Object.freeze(['ADMIN_LOGIN', 'ACCESS_DENIED', 'ANONYMOUS_AUTHOR_REVEALED', 'ACCOUNT_LOCKED', 'SUSPICIOUS_LOGIN', 'REFRESH_TOKEN_REUSE', 'RATE_LIMIT_EXCEEDED', 'ABUSE_PATTERN', 'PASSWORD_CHANGED', 'ACCOUNT_DELETED']),
  users: Object.freeze(['USER_SUSPENDED', 'USER_UNSUSPENDED', 'USER_BLOCKED', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'WARN_USER', 'TEMPORARY_RESTRICTION', 'ROLE_CHANGED']),
  reports: Object.freeze(['REPORT_REVIEWING', 'REPORT_RESOLVED', 'REPORT_REJECTED', 'REPORT_ESCALATED']),
  opportunities: Object.freeze(['OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'OPPORTUNITY_PUBLISHED', 'OPPORTUNITY_CLOSED', 'OPPORTUNITY_ARCHIVED', 'OPPORTUNITY_DRAFTED', 'OPPORTUNITY_DELETED']),
  verification: Object.freeze(['ACHIEVEMENT_VERIFIED', 'ACHIEVEMENT_REJECTED']),
});
export const AUDIT_CATEGORY_IDS = Object.freeze(['content', ...Object.keys(AUDIT_CATEGORIES)]);
export const AUDIT_ACTOR_ROLES = Object.freeze(['system', 'admin', 'moderator', 'community', 'student']);

/** A refused admin request is logged at most once per person and permission in this window. */
export const ACCESS_DENIED_LOG_MINUTES = 10;

// ----------------------------------------------------------------------------- request limits (429)

/** Per signed-in staff member, on the shared rate-limit store (Redis, or memory as a fallback). */
export const ADMIN_RATE_LIMITS = Object.freeze({
  requests: { windowMinutes: 15, max: 900, message: 'Too many admin requests. Please wait a moment.' },
  actions: { windowMinutes: 15, max: 150, message: "You're taking a lot of actions quickly. Please wait a few minutes." },
  reveal: { windowMinutes: 60, max: 20, message: 'Too many anonymous-author lookups this hour. Please try again later.' },
});
