import { Award, Compass, FolderKanban, House, Telescope, Trophy, UserRound, UsersRound, VenetianMask } from 'lucide-react';
import { ROUTES } from './routes';

/**
 * Main campus navigation. `inBottomNav` items appear in the mobile tab bar
 * (using `shortLabel` when set, so five tabs fit on a 320px phone); the rest are
 * reachable from the mobile top bar's Explore sheet. Admin is intentionally absent: it gets a
 * role-gated entry point once authentication exists.
 */
export const CAMPUS_NAV = [
  { label: 'Home', to: ROUTES.HOME, icon: House, inBottomNav: true },
  { label: 'Discover', to: ROUTES.DISCOVER, icon: Telescope, inBottomNav: false },
  { label: 'Communities', shortLabel: 'Community', to: ROUTES.COMMUNITIES, icon: UsersRound, inBottomNav: true },
  { label: 'Projects', to: ROUTES.PROJECTS, icon: FolderKanban, inBottomNav: false },
  { label: 'Achievements', to: ROUTES.ACHIEVEMENTS, icon: Award, inBottomNav: false },
  { label: 'Opportunities', shortLabel: 'Openings', to: ROUTES.OPPORTUNITIES, icon: Compass, inBottomNav: true },
  { label: 'Rankings', to: ROUTES.RANKINGS, icon: Trophy, inBottomNav: true },
  { label: 'Anonymous Zone', shortLabel: 'Anonymous', to: ROUTES.ANONYMOUS, icon: VenetianMask, inBottomNav: false },
  { label: 'My Profile', shortLabel: 'Profile', to: ROUTES.PROFILE, icon: UserRound, inBottomNav: true },
];
