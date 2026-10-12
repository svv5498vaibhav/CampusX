import { useEffect } from 'react';
import { Link } from 'react-router';
import { AchievementCard } from '@/components/achievements/AchievementCard';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { Loader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useAchievementStore } from '@/store/achievementStore';
import { useProjectStore } from '@/store/projectStore';

const addLink = (to, label) => (
  <Link to={to} className="text-sm font-semibold text-primary hover:underline">{label}</Link>
);

const Empty = ({ children, action }) => (
  <div className="flex flex-col items-start gap-3">
    <p className="text-sm leading-relaxed text-ink-muted">{children}</p>
    {action}
  </div>
);

/**
 * A student's projects on their profile. Loaded by reference (never copied into the profile) and
 * filtered by the server to what the viewer may see: private ones only ever appear for the owner.
 */
export function ProfileProjects({ userId, isOwner }) {
  const entry = useProjectStore((state) => state.byUser[userId]);
  const fetchUserProjects = useProjectStore((state) => state.fetchUserProjects);
  const loadOptions = useProjectStore((state) => state.loadOptions);

  useEffect(() => {
    loadOptions();
    fetchUserProjects(userId);
  }, [userId, fetchUserProjects, loadOptions]);

  if (!entry || (entry.status === 'loading' && entry.projects.length === 0)) return <Loader label="Loading projects" className="min-h-20" />;
  if (entry.projects.length === 0) {
    return isOwner
      ? <Empty action={addLink(ROUTES.PROJECT_CREATE, 'Add a project')}>No projects yet. Add something you’ve built: an app, a bot, a college assignment.</Empty>
      : <Empty>No projects yet.</Empty>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        {entry.projects.map((project) => <li key={project.id}><ProjectCard project={project} compact headingLevel="h4" /></li>)}
      </ul>
      {entry.total > entry.projects.length && <p className="text-xs text-ink-subtle">Showing {entry.projects.length} of {entry.total} projects.</p>}
    </div>
  );
}

/** A student's achievements on their profile, filtered by the server to what the viewer may see. */
export function ProfileAchievements({ userId, isOwner }) {
  const entry = useAchievementStore((state) => state.byUser[userId]);
  const fetchUserAchievements = useAchievementStore((state) => state.fetchUserAchievements);
  const loadOptions = useAchievementStore((state) => state.loadOptions);

  useEffect(() => {
    loadOptions();
    fetchUserAchievements(userId);
  }, [userId, fetchUserAchievements, loadOptions]);

  if (!entry || (entry.status === 'loading' && entry.achievements.length === 0)) return <Loader label="Loading achievements" className="min-h-20" />;
  if (entry.achievements.length === 0) {
    return isOwner
      ? <Empty action={addLink(ROUTES.ACHIEVEMENT_CREATE, 'Add a win')}>No achievements yet. Add a hackathon, certification or award you’re proud of.</Empty>
      : <Empty>No achievements yet.</Empty>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        {entry.achievements.map((achievement) => <li key={achievement.id}><AchievementCard achievement={achievement} showOwner={false} headingLevel="h4" /></li>)}
      </ul>
      {entry.total > entry.achievements.length && <p className="text-xs text-ink-subtle">Showing {entry.achievements.length} of {entry.total} achievements.</p>}
    </div>
  );
}
