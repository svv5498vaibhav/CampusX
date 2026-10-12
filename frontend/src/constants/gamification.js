import { Award, BadgeCheck, Flame, Footprints, Hammer, HeartHandshake, IdCard, PenLine, Rocket, Route, Sprout, Star, Trophy, Users } from 'lucide-react';
import { achievementPath, projectPath } from './showcase';
import { communityPath, postPath, ROUTES } from './routes';
import { opportunityPath } from './opportunities';

/*
 * Icons and colours for Campus Rankings. Points, levels, badges and ranks all come from the API
 * (/gamification, /rankings): the frontend never calculates them.
 */

/** Badge `icon` names from the API → icons. */
export const BADGE_ICONS = {
  footprints: Footprints,
  'id-card': IdCard,
  'pen-line': PenLine,
  hammer: Hammer,
  award: Award,
  'badge-check': BadgeCheck,
  users: Users,
  sprout: Sprout,
  rocket: Rocket,
  'heart-handshake': HeartHandshake,
  flame: Flame,
  star: Star,
  trophy: Trophy,
  route: Route,
};

/** Calm rarity colours from the design tokens. */
export const RARITY_STYLES = {
  common: { label: 'Common', tile: 'bg-primary-soft text-primary-soft-fg' },
  uncommon: { label: 'Uncommon', tile: 'bg-primary text-primary-fg' },
  rare: { label: 'Rare', tile: 'bg-accent-soft text-accent-fg' },
  epic: { label: 'Epic', tile: 'bg-ink text-canvas' },
};

/** Ranking tabs: "Campus" is the API's overall scope. */
export const RANKING_TABS = [
  { id: 'overall', label: 'Campus' },
  { id: 'college', label: 'College' },
  { id: 'branch', label: 'Branch' },
  { id: 'semester', label: 'Semester' },
];
export const RANKING_PERIODS = [
  { id: 'all', label: 'All Time' },
  { id: 'month', label: 'This Month' },
  { id: 'week', label: 'This Week' },
];

const number = new Intl.NumberFormat('en-IN');
/** "1,240" */
export const formatPoints = (value) => number.format(value ?? 0);

/** Where a points-history row's activity can be opened. */
export function activityLink(link) {
  if (!link) return null;
  switch (link.type) {
    case 'post':
      return postPath(link.id);
    case 'project':
      return projectPath(link.id);
    case 'achievement':
      return achievementPath(link.id);
    case 'community':
      return communityPath(link.id);
    case 'opportunity':
      return opportunityPath(link.id);
    case 'profile':
      return ROUTES.PROFILE;
    default:
      return null;
  }
}
