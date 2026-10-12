export const ROUTES = Object.freeze({
  LANDING: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  ONBOARDING: '/onboarding',
  HOME: '/home',
  DISCOVER: '/discover',
  FEED: '/feed',
  POST: '/post/:postId',
  PROFILE: '/profile',
  PROFILE_EDIT: '/profile/edit',
  // The student's Semester Roadmap (?semester=1..8 opens a semester).
  ROADMAP: '/profile/roadmap',
  COMMUNITIES: '/communities',
  COMMUNITY: '/communities/:communityId',
  PROJECTS: '/projects',
  PROJECT_CREATE: '/projects/create',
  PROJECT: '/projects/:projectId',
  PROJECT_EDIT: '/projects/:projectId/edit',
  ACHIEVEMENTS: '/achievements',
  ACHIEVEMENT_CREATE: '/achievements/create',
  ACHIEVEMENT: '/achievements/:achievementId',
  ACHIEVEMENT_EDIT: '/achievements/:achievementId/edit',
  OPPORTUNITIES: '/opportunities',
  OPPORTUNITIES_SAVED: '/opportunities/saved',
  OPPORTUNITIES_MY: '/opportunities/my',
  OPPORTUNITY: '/opportunities/:opportunityId',
  RANKINGS: '/rankings',
  BADGES: '/badges',
  POINT_ACTIVITY: '/gamification/activity',
  NOTIFICATIONS: '/notifications',
  SEARCH: '/search',
  SAFETY: '/safety',
  COMMUNITY_GUIDELINES: '/community-guidelines',
  ANONYMOUS: '/anonymous',
  ANONYMOUS_NEW: '/anonymous/new',
  ANONYMOUS_MINE: '/anonymous/mine',
  ANONYMOUS_POST: '/anonymous/:postId',
  ANONYMOUS_POST_EDIT: '/anonymous/:postId/edit',
  // The admin control center's own routes are in constants/admin.js (ADMIN_ROUTES).
  ADMIN: '/admin',
  ADMIN_OPPORTUNITIES: '/admin/opportunities',
  ADMIN_OPPORTUNITY_CREATE: '/admin/opportunities/new',
  ADMIN_OPPORTUNITY_EDIT: '/admin/opportunities/:opportunityId/edit',
  DEV_UI: '/dev/ui',
  DEV_STATUS: '/dev/status',
});

/** One community's page; `tab` opens a section (posts, members, about). */
export const communityPath = (communityId, tab) =>
  `/communities/${encodeURIComponent(communityId)}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`;

/** A single campus post (the link students share). */
export const postPath = (postId) => `/post/${encodeURIComponent(postId)}`;

/** Another student's public profile. */
export const profilePath = (userId) => `/profile/${encodeURIComponent(userId)}`;

/** The search page for a query, optionally on one category tab ("students", "projects", ...). */
export const searchPath = (query, type) => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (type && type !== 'all') params.set('type', type);
  const text = params.toString();
  return text ? `/search?${text}` : '/search';
};
