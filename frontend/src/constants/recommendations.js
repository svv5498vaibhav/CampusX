import { Award, Compass, Flame, FolderKanban, GraduationCap, Newspaper, Sparkles, UsersRound } from 'lucide-react';
import { anonymousPostPath } from './anonymous';
import { opportunityPath } from './opportunities';
import { communityPath, postPath, profilePath, ROUTES } from './routes';
import { achievementPath, projectPath } from './showcase';

/*
 * Recommendations (Phase 14). What to recommend and why is decided by the server; these are the app's own
 * words, icons and links for each kind.
 */

export const RECOMMENDATION_TYPES = Object.freeze({
  POSTS: 'posts',
  PROJECTS: 'projects',
  COMMUNITIES: 'communities',
  OPPORTUNITIES: 'opportunities',
  STUDENTS: 'students',
  ACHIEVEMENTS: 'achievements',
});

/** Section copy per kind, in campus words (never "People you may know"). */
export const RECOMMENDATION_META = Object.freeze({
  forYou: { title: 'Recommended for you', description: 'A mix picked from your interests, skills and campus.', icon: Sparkles },
  opportunities: { title: 'Opportunities for you', description: 'Open, and you’re eligible.', icon: Compass, chip: 'Opportunities', kind: 'Opportunity', action: 'View Opportunity', seeAll: ROUTES.OPPORTUNITIES },
  projects: { title: 'Projects to explore', description: 'What students are building with your kind of stack.', icon: FolderKanban, chip: 'Projects', kind: 'Project', action: 'View Project', seeAll: ROUTES.PROJECTS },
  communities: { title: 'Communities you may like', description: 'Find your people on campus.', icon: UsersRound, chip: 'Communities', kind: 'Community', action: 'Explore', seeAll: ROUTES.COMMUNITIES },
  students: { title: 'Students with similar interests', description: 'Find your campus circle.', icon: GraduationCap, chip: 'Students', kind: 'Student', action: 'View Profile', seeAll: null },
  achievements: { title: 'Student achievements', description: 'Wins from students into the same things as you.', icon: Award, chip: 'Achievements', kind: 'Achievement', action: 'View Achievement', seeAll: ROUTES.ACHIEVEMENTS },
  posts: { title: 'Campus posts', description: 'Posts that match what you’re into.', icon: Newspaper, chip: 'Posts', kind: 'Post', action: 'Open Post', seeAll: ROUTES.HOME },
  trending: { title: 'Trending on campus', description: 'What students are talking about this week.', icon: Flame },
});

/** Where a recommended item opens (every route exists in routes/router.jsx). */
export function recommendationPath(item) {
  switch (item.recommendationType) {
    case RECOMMENDATION_TYPES.POSTS:
      return item.anonymous ? anonymousPostPath(item.id) : postPath(item.id);
    case RECOMMENDATION_TYPES.PROJECTS:
      return projectPath(item.id);
    case RECOMMENDATION_TYPES.COMMUNITIES:
      return communityPath(item.id);
    case RECOMMENDATION_TYPES.OPPORTUNITIES:
      return opportunityPath(item.id);
    case RECOMMENDATION_TYPES.STUDENTS:
      return profilePath(item.id);
    case RECOMMENDATION_TYPES.ACHIEVEMENTS:
      return achievementPath(item.id);
    default:
      return ROUTES.DISCOVER;
  }
}

/** The order of sections on Discover. */
export const DISCOVER_SECTIONS = Object.freeze(['opportunities', 'projects', 'communities', 'students', 'achievements', 'posts']);
