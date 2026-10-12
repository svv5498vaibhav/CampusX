/**
 * Activity limits for Trust & Safety, in one place. Two kinds:
 *
 *   BEHAVIOR_LIMITS  how much of something a student may do in a window before it becomes a moderation
 *                    signal. Going over doesn't block anything: the new content is scored higher (and
 *                    flagged), and engagement over the line stops counting for rankings for a while.
 *   HARD_LIMITS      request limits answered with 429 (middleware/rateLimiter.js reads them from here).
 *
 * Counted per student on Redis when it is connected (shared by every API instance), otherwise in this
 * process's memory (the same SharedCounterStore the rate limiters use).
 */

export const BEHAVIOR_LIMITS = Object.freeze({
  post: { windowMinutes: 10, max: 5, points: 35, flag: 'rapid_posting' },
  comment: { windowMinutes: 10, max: 20, points: 30, flag: 'rapid_comments' },
  anonymousPost: { windowMinutes: 10, max: 4, points: 35, flag: 'rapid_posting' },
  anonymousComment: { windowMinutes: 10, max: 15, points: 30, flag: 'rapid_comments' },
  project: { windowMinutes: 60, max: 6, points: 30, flag: 'rapid_posting' },
  achievement: { windowMinutes: 60, max: 8, points: 30, flag: 'rapid_posting' },
  community: { windowMinutes: 60, max: 4, points: 30, flag: 'rapid_posting' },
  // Likes given (posts, projects, anonymous posts together). Over the line: suspicious engagement.
  like: { windowMinutes: 1, max: 40, flag: 'rapid_likes' },
  // Reports sent: the per-hour request limit is in HARD_LIMITS; daily report abuse is in moderationConfig.
  report: { windowMinutes: 60, max: 10, flag: 'rapid_reports' },
  // Joining and leaving communities.
  communityAction: { windowMinutes: 10, max: 20, flag: 'rapid_community_actions' },
});

/** Fake engagement patterns. None of them punishes anyone: they open a review case or stop points. */
export const ENGAGEMENT_LIMITS = Object.freeze({
  // Liking and unliking the same thing over and over.
  toggles: { windowMinutes: 10, max: 6, flag: 'like_toggling' },
  // One post, project or anonymous post receiving this many likes in a minute: a review case is opened.
  contentBurst: { windowMinutes: 1, max: 30, flag: 'suspicious_engagement' },
  // How long a student's likes and comments stop counting for rankings after a burst.
  pauseRewardsMinutes: 10,
});

/** 429 limits, per signed-in student. Generous: normal campus use never reaches them. */
export const HARD_LIMITS = Object.freeze({
  likes: { windowMinutes: 10, max: 150, message: "You're liking things very quickly. Please slow down for a few minutes." },
  reports: { windowMinutes: 60, max: 10, message: "You've sent a lot of reports in the last hour. Please try again later." },
  communityActions: { windowMinutes: 10, max: 40, message: "You're joining and leaving communities very quickly. Please wait a few minutes." },
  moderation: { windowMinutes: 15, max: 300, message: 'Too many moderation requests. Please wait a moment.' },
});
