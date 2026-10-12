import { Award, Compass, FolderKanban, GraduationCap, LayoutGrid, Newspaper, UsersRound } from 'lucide-react';
import { anonymousPostPath } from './anonymous';
import { opportunityPath } from './opportunities';
import { communityPath, postPath, profilePath, ROUTES } from './routes';
import { achievementPath, projectPath } from './showcase';

/*
 * Search & Discovery. Tabs, sorts, rules and filter choices come from the API (GET /search/options) so
 * they always match what the server accepts; icons, copy and the routes below are the app's own.
 */

export const SEARCH_TYPES = Object.freeze({
  ALL: 'all',
  STUDENTS: 'students',
  POSTS: 'posts',
  PROJECTS: 'projects',
  COMMUNITIES: 'communities',
  OPPORTUNITIES: 'opportunities',
  ACHIEVEMENTS: 'achievements',
});

/** Icon and wording per tab. `noun` is used in counts ("3 projects"). */
export const SEARCH_TYPE_META = Object.freeze({
  all: { label: 'All', icon: LayoutGrid },
  students: { label: 'Students', icon: GraduationCap, noun: ['student', 'students'] },
  posts: { label: 'Posts', icon: Newspaper, noun: ['post', 'posts'] },
  projects: { label: 'Projects', icon: FolderKanban, noun: ['project', 'projects'] },
  communities: { label: 'Communities', icon: UsersRound, noun: ['community', 'communities'] },
  opportunities: { label: 'Opportunities', icon: Compass, noun: ['opportunity', 'opportunities'] },
  achievements: { label: 'Achievements', icon: Award, noun: ['achievement', 'achievements'] },
});

/** The order of the grouped sections in "All" (most useful discovery first). */
export const GLOBAL_SECTIONS = ['students', 'projects', 'communities', 'opportunities', 'achievements', 'posts'];

export const SEARCH_TABS_FALLBACK = Object.keys(SEARCH_TYPE_META).map((id) => ({ id, label: SEARCH_TYPE_META[id].label }));

export const countLabel = (type, count) => {
  const [one, many] = SEARCH_TYPE_META[type]?.noun ?? ['result', 'results'];
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
};

/**
 * Filters each category offers, as the page URL names them. `kind` is the post/community/opportunity/
 * achievement type (the URL's own `type` is the tab). Values travel as text; the API checks every one.
 */
export const SEARCH_FILTER_KEYS = Object.freeze({
  all: [],
  students: ['college', 'branch', 'semester', 'skills', 'interests'],
  posts: ['kind'],
  projects: ['category', 'tech'],
  communities: ['kind', 'college', 'branch'],
  opportunities: ['kind', 'mode', 'skills', 'deadline', 'college', 'branch', 'semester'],
  achievements: ['kind', 'verified'],
});

/** Filter values that mean "no filter". */
export const FILTER_DEFAULTS = Object.freeze({ deadline: 'any', verified: '' });

export const SUGGESTION_DEBOUNCE_MS = 300;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

/**
 * Where a search result opens. Every route here exists in routes/router.jsx:
 *   student → /profile/:userId · post → /post/:postId · anonymous post → /anonymous/:postId
 *   project → /projects/:projectId · community → /communities/:communityId
 *   opportunity → /opportunities/:opportunityId · achievement → /achievements/:achievementId
 */
export function searchResultPath(kind, item) {
  switch (kind) {
    case 'student':
    case 'students':
      return profilePath(item.id);
    case 'post':
    case 'posts':
      return item.anonymous ? anonymousPostPath(item.id) : postPath(item.id);
    case 'project':
    case 'projects':
      return projectPath(item.id);
    case 'community':
    case 'communities':
      return communityPath(item.id);
    case 'opportunity':
    case 'opportunities':
      return opportunityPath(item.id);
    case 'achievement':
    case 'achievements':
      return achievementPath(item.id);
    default:
      return ROUTES.SEARCH;
  }
}

/** A label from one of the option lists in GET /search/options (falls back to the id). */
export const labelOf = (list, id) => list?.find((item) => item.id === id)?.label ?? id;
