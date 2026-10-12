import {
  BedDouble,
  CalendarDays,
  CircleHelp,
  GraduationCap,
  Library,
  Lightbulb,
  MessageSquareText,
  School,
  Sparkles,
  TreePine,
  UsersRound,
  UtensilsCrossed,
  Globe,
} from 'lucide-react';
import { ROUTES } from './routes';

/*
 * Icons for the Anonymous Zone. Labels, limits and option lists come from the API
 * (/anonymous/options) so they always match what the server accepts.
 */

export const ANONYMOUS_LABEL_FALLBACK = 'Anonymous Student';

export const ANONYMOUS_CATEGORY_ICONS = {
  feedback: MessageSquareText,
  question: CircleHelp,
  suggestion: Lightbulb,
  academic: GraduationCap,
  'campus-life': TreePine,
  hostel: BedDouble,
  canteen: UtensilsCrossed,
  library: Library,
  event: CalendarDays,
  other: Sparkles,
};

export const ANONYMOUS_VISIBILITY_ICONS = { college: School, campus: Globe, community: UsersRound };

const labelFrom = (list, id) => list?.find((item) => item.id === id)?.label ?? id;
export const categoryLabel = (options, id) => labelFrom(options?.categories, id);
export const visibilityLabel = (options, id) => labelFrom(options?.visibility, id);

export const anonymousPostPath = (postId) => `${ROUTES.ANONYMOUS}/${encodeURIComponent(postId)}`;
export const editAnonymousPostPath = (postId) => `${anonymousPostPath(postId)}/edit`;

/** Per-account note that the student has read the "how anonymity works" explanation. */
export const safetyNoticeKey = (userId) => `campusx-anonymous-notice:${userId}`;
