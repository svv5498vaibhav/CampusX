import {
  Award,
  BadgeCheck,
  Bell,
  Briefcase,
  CalendarClock,
  Heart,
  Info,
  Megaphone,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TrendingUp,
  Trophy,
  UserPlus,
  UsersRound,
  VenetianMask,
} from 'lucide-react';
import { anonymousPostPath } from './anonymous';
import { opportunityPath } from './opportunities';
import { communityPath, postPath, ROUTES } from './routes';
import { achievementPath, projectPath } from './showcase';

/*
 * Notifications: how each type looks and where it leads. Titles, messages, read state and the unread
 * count all come from the API (/notifications); the frontend never decides who gets notified.
 */

/** Socket.IO events, mirroring backend/sockets/socketEvents.js. */
export const SOCKET_EVENTS = Object.freeze({
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_DELETED: 'notification:deleted',
  NOTIFICATION_COUNT: 'notification:count',
  // Admin control center (delivered only to signed-in moderators and admins).
  ADMIN_NEW_REPORT: 'admin:newReport',
  ADMIN_NEW_MODERATION_CASE: 'admin:newModerationCase',
  ADMIN_SYSTEM_ALERT: 'admin:systemAlert',
});

/** The bell's dropdown shows only the most recent few. */
export const DROPDOWN_LIMIT = 8;
export const PAGE_SIZE = 20;

const TONES = {
  primary: 'bg-primary-soft text-primary-soft-fg',
  accent: 'bg-accent-soft text-accent-fg',
  neutral: 'bg-surface-muted text-ink-muted',
};

/** Icon and tone per notification type (types from backend/data/notificationOptions.js). */
export const NOTIFICATION_PRESENTATION = {
  POST_LIKED: { icon: Heart, tone: 'primary' },
  POST_COMMENTED: { icon: MessageCircle, tone: 'primary' },
  PROJECT_LIKED: { icon: Heart, tone: 'primary' },
  PROJECT_TEAM_INVITE: { icon: UserPlus, tone: 'primary' },
  ACHIEVEMENT_VERIFIED: { icon: BadgeCheck, tone: 'accent' },
  ACHIEVEMENT_REJECTED: { icon: Award, tone: 'neutral' },
  COMMUNITY_JOINED: { icon: UserPlus, tone: 'primary' },
  COMMUNITY_ANNOUNCEMENT: { icon: Megaphone, tone: 'primary' },
  COMMUNITY_ACTIVITY: { icon: UsersRound, tone: 'primary' },
  OPPORTUNITY_UPDATED: { icon: Briefcase, tone: 'primary' },
  OPPORTUNITY_STATUS_CHANGED: { icon: Briefcase, tone: 'neutral' },
  OPPORTUNITY_DEADLINE: { icon: CalendarClock, tone: 'accent' },
  ANONYMOUS_POST_LIKED: { icon: VenetianMask, tone: 'neutral' },
  ANONYMOUS_POST_COMMENTED: { icon: VenetianMask, tone: 'neutral' },
  BADGE_EARNED: { icon: Trophy, tone: 'accent' },
  LEVEL_UP: { icon: TrendingUp, tone: 'accent' },
  RANK_CHANGED: { icon: TrendingUp, tone: 'accent' },
  SYSTEM_NOTIFICATION: { icon: Info, tone: 'neutral' },
  // Trust & Safety: calm, never alarming colours.
  CONTENT_RESTRICTED: { icon: ShieldAlert, tone: 'accent' },
  CONTENT_REMOVED: { icon: ShieldX, tone: 'neutral' },
  CONTENT_RESTORED: { icon: ShieldCheck, tone: 'primary' },
  MODERATION_WARNING: { icon: ShieldAlert, tone: 'accent' },
  ACCOUNT_RESTRICTED: { icon: ShieldAlert, tone: 'accent' },
  REPORT_REVIEWED: { icon: ShieldCheck, tone: 'primary' },
};

export function notificationPresentation(type) {
  const presentation = NOTIFICATION_PRESENTATION[type] ?? { icon: Bell, tone: 'neutral' };
  return { icon: presentation.icon, tile: TONES[presentation.tone] };
}

/**
 * Where a notification leads, from its entity (the one place this is decided). Null when there is
 * nowhere to go, or the content is gone ("This content is no longer available").
 */
export function notificationLink(notification) {
  const entity = notification?.entity;
  if (!entity || entity.available === false) return null;
  switch (entity.type) {
    case 'post':
      return postPath(entity.id);
    case 'project':
      return projectPath(entity.id);
    case 'achievement':
      return achievementPath(entity.id);
    case 'community':
      return communityPath(entity.id);
    case 'opportunity':
      return opportunityPath(entity.id);
    case 'anonymous-post':
      return anonymousPostPath(entity.id);
    case 'badge':
      return ROUTES.BADGES;
    case 'level':
    case 'ranking':
      return ROUTES.RANKINGS;
    case 'profile':
      return ROUTES.PROFILE;
    case 'safety':
      return ROUTES.SAFETY;
    default:
      return null;
  }
}

/** "4", or "99+" for the bell. */
export const formatUnread = (count) => (count > 99 ? '99+' : String(count));

/** "Notifications, 4 unread" for the bell's label. */
export const bellLabel = (count) => (count > 0 ? `Notifications, ${count} unread` : 'Notifications');
