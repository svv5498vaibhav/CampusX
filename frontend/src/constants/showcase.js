import {
  Award,
  BadgeCheck,
  Blocks,
  BookOpen,
  BrainCircuit,
  Building2,
  CalendarDays,
  ChartColumn,
  CircleDashed,
  CircuitBoard,
  Clock,
  Code2,
  Cpu,
  Gamepad2,
  GitBranch,
  Globe,
  GraduationCap,
  Lock,
  Presentation,
  ShieldCheck,
  ShieldX,
  Smartphone,
  Sparkles,
  Trophy,
  UsersRound,
  School,
} from 'lucide-react';
import { ROUTES } from './routes';

/*
 * Icons and colours for projects and achievements. Labels, limits and option lists come from the API
 * (/projects/options, /achievements/options) so they always match what the server accepts.
 */

export const PROJECT_CATEGORY_ICONS = {
  web: Globe,
  mobile: Smartphone,
  'ai-ml': BrainCircuit,
  'data-science': ChartColumn,
  iot: Cpu,
  cybersecurity: ShieldCheck,
  blockchain: Blocks,
  game: Gamepad2,
  hardware: CircuitBoard,
  academic: BookOpen,
  other: Sparkles,
};

export const PROJECT_STATUS_BADGES = {
  idea: 'accent',
  'in-progress': 'primary',
  completed: 'primary',
  archived: 'neutral',
};

export const ACHIEVEMENT_TYPE_ICONS = {
  hackathon: Code2,
  competition: Trophy,
  certification: Award,
  award: Trophy,
  academic: GraduationCap,
  workshop: Presentation,
  internship: Building2,
  'open-source': GitBranch,
  event: CalendarDays,
  other: Sparkles,
};

/** Verification is shown exactly as the server reports it; only "verified" looks official. */
export const VERIFICATION_BADGES = {
  verified: { label: 'Verified', icon: BadgeCheck, variant: 'primary', hint: 'A CampusX moderator checked the proof.' },
  pending: { label: 'Pending review', icon: Clock, variant: 'accent', hint: 'Proof submitted, waiting for a CampusX moderator.' },
  unverified: { label: 'Unverified', icon: CircleDashed, variant: 'neutral', hint: 'Not checked by CampusX.' },
  rejected: { label: 'Not verified', icon: ShieldX, variant: 'danger', hint: 'A moderator couldn’t confirm it from the proof.' },
};

export const SHOWCASE_VISIBILITY_ICONS = { public: Globe, campus: UsersRound, college: School, private: Lock };

const labelFrom = (list, id) => list?.find((item) => item.id === id)?.label ?? id;
export const categoryLabel = (options, id) => labelFrom(options?.categories, id);
export const statusLabel = (options, id) => labelFrom(options?.statuses, id);
export const achievementTypeLabel = (options, id) => labelFrom(options?.types, id);
export const visibilityLabel = (options, id) => labelFrom(options?.visibility, id);

export const projectPath = (projectId) => `${ROUTES.PROJECTS}/${encodeURIComponent(projectId)}`;
export const achievementPath = (achievementId) => `${ROUTES.ACHIEVEMENTS}/${encodeURIComponent(achievementId)}`;
export const projectUrl = (projectId) => `${window.location.origin}${projectPath(projectId)}`;
export const achievementUrl = (achievementId) => `${window.location.origin}${achievementPath(achievementId)}`;

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const formatDate = (value) => (value ? dateFormat.format(new Date(value)) : '');
/** <input type="date"> value from an ISO date. */
export const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
