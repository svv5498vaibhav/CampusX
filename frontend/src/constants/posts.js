import {
  CalendarDays,
  Clapperboard,
  Compass,
  Globe,
  GraduationCap,
  Hammer,
  ImageIcon,
  Lightbulb,
  Megaphone,
  MessageSquareText,
  School,
  Trophy,
} from 'lucide-react';
import { postPath } from './routes';

/*
 * Icons and colours for post types and visibility levels. Labels, prompts and limits come from
 * the API (GET /posts/options) so they always match what the server accepts.
 */

export const POST_TYPE_STYLES = {
  text: { icon: MessageSquareText, badge: 'neutral' },
  photo: { icon: ImageIcon, badge: 'neutral' },
  video: { icon: Clapperboard, badge: 'neutral' },
  'campus-update': { icon: Megaphone, badge: 'primary' },
  achievement: { icon: Trophy, badge: 'accent' },
  project: { icon: Hammer, badge: 'primary' },
  idea: { icon: Lightbulb, badge: 'accent' },
  event: { icon: CalendarDays, badge: 'primary' },
  opportunity: { icon: Compass, badge: 'primary' },
};

/** Text, photo and video describe what a post holds; they get no badge on the card. */
export const FORMAT_TYPES = ['text', 'photo', 'video'];

/** Categories a student picks in the composer ("Post" = no particular category). */
export const COMPOSER_TYPES = ['text', 'achievement', 'project', 'idea', 'event', 'opportunity', 'campus-update'];

/** Quick starts on the Campus Activity card. Photo and video open the composer's file picker. */
export const QUICK_STARTS = [
  { id: 'photo', label: 'Photo', icon: ImageIcon, media: 'image' },
  { id: 'video', label: 'Video', icon: Clapperboard, media: 'video' },
  { id: 'achievement', label: 'Achievement', icon: Trophy },
  { id: 'project', label: 'Project', icon: Hammer },
  { id: 'idea', label: 'Idea', icon: Lightbulb },
  { id: 'event', label: 'Event', icon: CalendarDays },
];

export const VISIBILITY_ICONS = {
  campus: School,
  branch: GraduationCap,
  public: Globe,
};

/** Rotating prompts for the activity card. */
export const CAMPUS_PROMPTS = [
  'What are you working on today?',
  'Share something with campus...',
  'Built something cool this week?',
  'Any wins to celebrate?',
];

/** Fallback label before the options have loaded: "campus-update" → "Campus update". */
export const typeLabel = (options, typeId) =>
  options?.types.find((type) => type.id === typeId)?.label ?? typeId.charAt(0).toUpperCase() + typeId.slice(1).replace('-', ' ');

/** Link students can share. */
export const postUrl = (postId) => `${window.location.origin}${postPath(postId)}`;
