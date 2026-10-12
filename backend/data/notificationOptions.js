/**
 * Notifications: every type, category, delivery rule and limit in one place. The services read only
 * from here, and GET /api/v1/notifications/preferences shows the categories to students.
 */

/**
 * Preference categories. Students can turn each one off, except `system` (CampusX account and
 * safety messages), which always stays on. Missing preferences mean "on".
 */
export const NOTIFICATION_CATEGORIES = Object.freeze([
  { id: 'likes', label: 'Likes', description: 'Likes on your posts, projects and anonymous posts' },
  { id: 'comments', label: 'Comments', description: 'Comments on your posts and anonymous posts' },
  { id: 'projects', label: 'Project teams', description: 'Invitations to join a project team' },
  { id: 'achievements', label: 'Achievement reviews', description: 'When CampusX verifies or declines your proof' },
  { id: 'communities', label: 'Communities', description: 'New members, announcements and role changes in your communities' },
  { id: 'opportunities', label: 'Opportunities', description: 'Updates and deadlines for opportunities you saved or track' },
  { id: 'rankings', label: 'Rankings and badges', description: 'Badges, level-ups and ranking milestones' },
  { id: 'system', label: 'CampusX updates', description: 'Important account and safety messages', locked: true },
]);
export const NOTIFICATION_CATEGORY_IDS = Object.freeze(NOTIFICATION_CATEGORIES.map((category) => category.id));
export const EDITABLE_CATEGORY_IDS = Object.freeze(NOTIFICATION_CATEGORIES.filter((category) => !category.locked).map((category) => category.id));

/**
 * Notification types. Only activity CampusX actually has is listed: there are no comment replies,
 * mentions, follows or project comments yet, so there are no types for them.
 *
 * `policy` decides what happens when the same thing happens again (matched by a dedupe key):
 *   once    never notify twice for the same key (a like, a badge, a level, a reminder)
 *   group   while the earlier notification is still unread, update it and count up instead of adding
 *           another ("Aarav left 3 comments on your post"); a new one starts once it has been read
 *   always  every event is its own notification
 */
export const NOTIFICATION_TYPES = Object.freeze({
  POST_LIKED: { category: 'likes', title: 'New like', policy: 'once' },
  POST_COMMENTED: { category: 'comments', title: 'New comment', policy: 'group' },
  PROJECT_LIKED: { category: 'likes', title: 'Project liked', policy: 'once' },
  PROJECT_TEAM_INVITE: { category: 'projects', title: 'Team invitation', policy: 'once' },
  ACHIEVEMENT_VERIFIED: { category: 'achievements', title: 'Achievement verified', policy: 'once' },
  ACHIEVEMENT_REJECTED: { category: 'achievements', title: 'Achievement not verified', policy: 'once' },
  COMMUNITY_JOINED: { category: 'communities', title: 'New community member', policy: 'group' },
  COMMUNITY_ANNOUNCEMENT: { category: 'communities', title: 'Community announcement', policy: 'group' },
  COMMUNITY_ACTIVITY: { category: 'communities', title: 'Community update', policy: 'always' },
  OPPORTUNITY_UPDATED: { category: 'opportunities', title: 'Opportunity updated', policy: 'group' },
  OPPORTUNITY_STATUS_CHANGED: { category: 'opportunities', title: 'Opportunity status', policy: 'group' },
  OPPORTUNITY_DEADLINE: { category: 'opportunities', title: 'Deadline coming up', policy: 'once' },
  // Anonymous Zone: never an actor, never who. See services/notificationEvents.js.
  ANONYMOUS_POST_LIKED: { category: 'likes', title: 'Anonymous Zone', policy: 'group' },
  ANONYMOUS_POST_COMMENTED: { category: 'comments', title: 'Anonymous Zone', policy: 'group' },
  BADGE_EARNED: { category: 'rankings', title: 'New badge unlocked', policy: 'once' },
  LEVEL_UP: { category: 'rankings', title: 'Level up!', policy: 'once' },
  RANK_CHANGED: { category: 'rankings', title: 'Ranking update', policy: 'once' },
  SYSTEM_NOTIFICATION: { category: 'system', title: 'CampusX', policy: 'once' },
  // Trust & Safety (always delivered: they're about the student's own account). No scores, rules or
  // reporter identities are ever included.
  CONTENT_RESTRICTED: { category: 'system', title: 'Content under review', policy: 'always' },
  CONTENT_REMOVED: { category: 'system', title: 'Content removed', policy: 'always' },
  CONTENT_RESTORED: { category: 'system', title: 'Content back on CampusX', policy: 'always' },
  MODERATION_WARNING: { category: 'system', title: 'A friendly reminder', policy: 'always' },
  ACCOUNT_RESTRICTED: { category: 'system', title: 'Posting paused', policy: 'always' },
  REPORT_REVIEWED: { category: 'system', title: 'Report reviewed', policy: 'once' },
});
export const NOTIFICATION_TYPE_IDS = Object.freeze(Object.keys(NOTIFICATION_TYPES));

/**
 * What a notification points at. The frontend picks the page for each (constants/notifications.js);
 * badge, level, ranking, profile and safety (the community guidelines) have no id to check.
 */
export const NOTIFICATION_ENTITY_TYPES = Object.freeze(['post', 'project', 'achievement', 'community', 'opportunity', 'anonymous-post', 'badge', 'level', 'ranking', 'profile', 'safety']);

/** Opportunity fields whose change is worth telling the students who track it. */
export const OPPORTUNITY_UPDATE_FIELDS = Object.freeze({
  applicationDeadline: 'deadline',
  startDate: 'start date',
  endDate: 'end date',
  mode: 'mode',
  location: 'location',
  applicationUrl: 'application link',
  registrationUrl: 'registration link',
  eligibility: 'eligibility',
  eligibleColleges: 'eligible colleges',
  eligibleBranches: 'eligible branches',
  eligibleSemesters: 'eligible semesters',
  fee: 'fee',
});

export const NOTIFICATION_RULES = Object.freeze({
  pageSize: { default: 20, max: 50 },
  // The bell's dropdown only ever loads this many.
  dropdownSize: 8,
  // Text quoted from a post or comment in a notification.
  snippetLength: 60,
  // Recipients written per batch when a whole community is notified.
  bulkBatchSize: 500,
  // Deadline reminders for saved/interested opportunities, checked by an in-process timer
  // (jobs/opportunityDeadlineReminders.js). Each reminder is sent once per deadline.
  deadlineReminder: { hoursBefore: 24, checkEveryMinutes: 30 },
});

/** Socket.IO connection limits (per IP for handshakes, per student for open connections). */
export const SOCKET_RULES = Object.freeze({
  handshakesPerMinute: 60,
  maxConnectionsPerUser: 10,
});
