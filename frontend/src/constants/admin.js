import { BarChart3, FileStack, Flag, LayoutDashboard, LockKeyhole, ScrollText, ShieldAlert, Telescope, UsersRound, UserRoundCog } from 'lucide-react';

/*
 * Admin control center. Permission names mirror backend/config/adminConfig.js; the backend decides what
 * each role may do (GET /admin/session) and enforces it on every request. The UI only hides what the
 * signed-in staff member can't use.
 */

export const PERMISSIONS = Object.freeze({
  VIEW_DASHBOARD: 'VIEW_DASHBOARD',
  VIEW_REPORTS: 'VIEW_REPORTS',
  REVIEW_MODERATION: 'REVIEW_MODERATION',
  MANAGE_CONTENT: 'MANAGE_CONTENT',
  MANAGE_OPPORTUNITIES: 'MANAGE_OPPORTUNITIES',
  REVEAL_ANONYMOUS_AUTHOR: 'REVEAL_ANONYMOUS_AUTHOR',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_COMMUNITIES: 'MANAGE_COMMUNITIES',
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  MANAGE_SYSTEM: 'MANAGE_SYSTEM',
  VIEW_SECURITY: 'VIEW_SECURITY',
});

export const ADMIN_ROUTES = Object.freeze({
  ROOT: '/admin',
  DASHBOARD: '/admin/dashboard',
  MODERATION: '/admin/moderation',
  CASE: '/admin/moderation/:caseId',
  REPORTS: '/admin/reports',
  REPORT: '/admin/reports/:reportId',
  USERS: '/admin/users',
  USER: '/admin/users/:userId',
  CONTENT: '/admin/content',
  COMMUNITIES: '/admin/communities',
  OPPORTUNITIES: '/admin/opportunities',
  OPPORTUNITY_CREATE: '/admin/opportunities/new',
  OPPORTUNITY_EDIT: '/admin/opportunities/:opportunityId/edit',
  ANALYTICS: '/admin/analytics',
  AUDIT_LOGS: '/admin/audit-logs',
  SECURITY: '/admin/security',
});

export const casePath = (caseId) => `/admin/moderation/${encodeURIComponent(caseId)}`;
export const reportPath = (reportId) => `/admin/reports/${encodeURIComponent(reportId)}`;
export const adminUserPath = (userId) => `/admin/users/${encodeURIComponent(userId)}`;

/** Sidebar groups. Items without the permission are not shown (the API refuses them anyway). */
export const ADMIN_NAV = Object.freeze([
  { label: 'Command center', items: [{ label: 'Dashboard', to: ADMIN_ROUTES.DASHBOARD, icon: LayoutDashboard, permission: PERMISSIONS.VIEW_DASHBOARD }] },
  {
    label: 'Moderation',
    items: [
      { label: 'Moderation', to: ADMIN_ROUTES.MODERATION, icon: ShieldAlert, permission: PERMISSIONS.REVIEW_MODERATION },
      { label: 'Reports', to: ADMIN_ROUTES.REPORTS, icon: Flag, permission: PERMISSIONS.VIEW_REPORTS },
    ],
  },
  {
    label: 'Campus management',
    items: [
      { label: 'Students', to: ADMIN_ROUTES.USERS, icon: UserRoundCog, permission: PERMISSIONS.MANAGE_USERS },
      { label: 'Content', to: ADMIN_ROUTES.CONTENT, icon: FileStack, permission: PERMISSIONS.MANAGE_CONTENT },
      { label: 'Communities', to: ADMIN_ROUTES.COMMUNITIES, icon: UsersRound, permission: PERMISSIONS.MANAGE_COMMUNITIES },
      { label: 'Opportunities', to: ADMIN_ROUTES.OPPORTUNITIES, icon: Telescope, permission: PERMISSIONS.MANAGE_OPPORTUNITIES },
    ],
  },
  { label: 'Insights', items: [{ label: 'Analytics', to: ADMIN_ROUTES.ANALYTICS, icon: BarChart3, permission: PERMISSIONS.VIEW_ANALYTICS }] },
  {
    label: 'Security',
    items: [
      { label: 'Security status', to: ADMIN_ROUTES.SECURITY, icon: LockKeyhole, permission: PERMISSIONS.VIEW_SECURITY },
      { label: 'Audit logs', to: ADMIN_ROUTES.AUDIT_LOGS, icon: ScrollText, permission: PERMISSIONS.VIEW_AUDIT_LOGS },
    ],
  },
]);

// ----------------------------------------------------------------------------- labels

export const TARGET_LABELS = Object.freeze({
  post: 'Post',
  comment: 'Comment',
  project: 'Project',
  achievement: 'Achievement',
  community: 'Community',
  opportunity: 'Opportunity',
  user: 'Student',
  anonymousPost: 'Anonymous post',
  anonymousComment: 'Anonymous comment',
});
export const targetLabel = (type) => TARGET_LABELS[type] ?? type;

export const RISK_LEVELS = Object.freeze(['low', 'medium', 'high', 'critical']);
export const PRIORITIES = Object.freeze(['low', 'medium', 'high', 'critical']);

export const CASE_STATUS_LABELS = Object.freeze({ open: 'Open', reviewing: 'Reviewing', resolved: 'Resolved', dismissed: 'Dismissed' });
export const REPORT_STATUS_LABELS = Object.freeze({ pending: 'New', reviewing: 'Under review', resolved: 'Resolved', dismissed: 'Rejected', withdrawn: 'Withdrawn' });
export const CONTENT_STATUS_LABELS = Object.freeze({ approved: 'Approved', flagged: 'Flagged', pending: 'Pending', restricted: 'Restricted', removed: 'Removed' });
export const ACCOUNT_STATUS_LABELS = Object.freeze({ active: 'Active', pending: 'Pending', suspended: 'Suspended', blocked: 'Blocked', deactivated: 'Deactivated' });

/** Case decisions. `danger` decisions open the confirmation dialog and need a reason. */
export const CASE_ACTIONS = Object.freeze({
  approve: { label: 'Approve', description: 'The content is fine: live again, reports dismissed, case closed.', tone: 'success' },
  flag: { label: 'Flag', description: 'Keep it live but out of search and rankings while the case stays open.', tone: 'warning' },
  restrict: { label: 'Restrict', description: 'Hidden from everyone but its owner. Counts as a violation for the owner.', tone: 'danger', danger: true },
  remove: { label: 'Remove', description: 'Taken down (kept internally for audits). Counts as a violation for the owner.', tone: 'danger', danger: true },
  escalate: { label: 'Escalate', description: 'Critical priority for a senior look. The case stays open.', tone: 'violet' },
  warn: { label: 'Warn owner', description: 'The owner gets a guideline warning; the content stays as it is.', tone: 'warning', danger: true },
  dismiss: { label: 'Dismiss', description: 'Nothing to do: reports dismissed, a flag cleared.', tone: 'neutral' },
});

export const REPORT_ACTIONS = Object.freeze({
  review: { label: 'Review', description: 'Mark as under review and move its case to reviewing.' },
  resolve: { label: 'Resolve', description: 'Action was taken. The reporter is told.' },
  reject: { label: 'Reject', description: 'No guideline problem. The reporter is told.' },
  escalate: { label: 'Escalate', description: 'Critical priority; its case goes to reviewing.' },
});

export const USER_ACTIONS = Object.freeze({
  suspend: { label: 'Suspend', description: 'Signs the student out everywhere and stops sign-in until the suspension is lifted.', danger: true },
  unsuspend: { label: 'Lift suspension', description: 'The student can sign in again.' },
  block: { label: 'Block', description: 'Signs the student out everywhere and blocks sign-in.', danger: true },
  activate: { label: 'Activate', description: 'The account can sign in and use CampusX again.' },
  deactivate: { label: 'Deactivate', description: 'Closes the account and signs the student out everywhere.', danger: true },
});

export const CONTENT_ACTIONS = Object.freeze({
  approve: { label: 'Approve', description: 'Live as usual (restores restricted or removed content).' },
  flag: { label: 'Flag', description: 'Live, but out of search and rankings until reviewed.' },
  restrict: { label: 'Restrict', description: 'Hidden from everyone but its owner. Counts as a violation.', danger: true },
  remove: { label: 'Remove', description: 'Taken down for everyone. Counts as a violation.', danger: true },
  verify: { label: 'Verify proof', description: 'Marks the achievement as verified by CampusX.' },
  reject: { label: 'Reject proof', description: 'The proof doesn’t check out. The owner can resubmit.', needsReason: true },
});

export const COMMUNITY_ACTIONS = Object.freeze({
  suspend: { label: 'Suspend', description: 'Hidden from search and from students who aren’t members while suspended.', danger: true },
  restore: { label: 'Restore', description: 'Back in good standing for everyone.' },
  remove: { label: 'Remove', description: 'Removed for everyone, members included.', danger: true },
});

export const AUDIT_CATEGORIES = Object.freeze([
  { id: '', label: 'All events' },
  { id: 'security', label: 'Security' },
  { id: 'users', label: 'Accounts' },
  { id: 'content', label: 'Moderation' },
  { id: 'reports', label: 'Reports' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'verification', label: 'Verification' },
]);

/** Human wording for audit actions (anything missing is shown as-is). */
export const AUDIT_ACTION_LABELS = Object.freeze({
  ADMIN_LOGIN: 'Staff sign-in',
  ACCESS_DENIED: 'Access denied',
  ANONYMOUS_AUTHOR_REVEALED: 'Anonymous author revealed',
  ACCOUNT_LOCKED: 'Sign-in locked (failed passwords)',
  SUSPICIOUS_LOGIN: 'Unusual sign-in',
  REFRESH_TOKEN_REUSE: 'Session token reused (device signed out)',
  RATE_LIMIT_EXCEEDED: 'Rate limit reached',
  ABUSE_PATTERN: 'Repeated limit abuse',
  PASSWORD_CHANGED: 'Password changed (other devices signed out)',
  ROLE_CHANGED: 'Role changed',
  USER_SUSPENDED: 'Account suspended',
  USER_UNSUSPENDED: 'Suspension lifted',
  USER_BLOCKED: 'Account blocked',
  USER_ACTIVATED: 'Account activated',
  USER_DEACTIVATED: 'Account deactivated',
  WARN_USER: 'Warning issued',
  TEMPORARY_RESTRICTION: 'Posting paused',
  REPORT_REVIEWING: 'Report under review',
  REPORT_RESOLVED: 'Report resolved',
  REPORT_REJECTED: 'Report rejected',
  REPORT_ESCALATED: 'Report escalated',
  OPPORTUNITY_CREATED: 'Opportunity created',
  OPPORTUNITY_UPDATED: 'Opportunity edited',
  OPPORTUNITY_PUBLISHED: 'Opportunity published',
  OPPORTUNITY_CLOSED: 'Opportunity closed',
  OPPORTUNITY_ARCHIVED: 'Opportunity archived',
  OPPORTUNITY_DRAFTED: 'Moved to drafts',
  OPPORTUNITY_DELETED: 'Opportunity deleted',
  ACHIEVEMENT_VERIFIED: 'Achievement verified',
  ACHIEVEMENT_REJECTED: 'Achievement proof rejected',
  ALLOW: 'Approved',
  FLAG: 'Flagged',
  LIMIT: 'Limited',
  HOLD: 'Restricted',
  REMOVE: 'Removed',
  ESCALATE: 'Escalated',
  CASE_RESOLVED: 'Case resolved',
  CASE_DISMISSED: 'Case dismissed',
  COMMUNITY_REMOVE: 'Removed by a community moderator',
});
export const auditActionLabel = (action) => AUDIT_ACTION_LABELS[action] ?? action;

export const ACTOR_ROLE_LABELS = Object.freeze({ system: 'Automated', admin: 'Admin', moderator: 'Moderator', community: 'Community', student: 'Student' });

/** Chart series colours (validated in index.css against the admin card surface). */
export const SERIES = Object.freeze(['var(--ax-series-1)', 'var(--ax-series-2)', 'var(--ax-series-3)', 'var(--ax-series-4)']);
export const SERIES_NEUTRAL = 'var(--ax-series-neutral)';
