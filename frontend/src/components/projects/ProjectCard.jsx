import { motion } from 'framer-motion';
import { Eye, Heart, Share2, Star } from 'lucide-react';
import { Link } from 'react-router';
import { ProjectMenu } from '@/components/projects/ProjectMenu';
import { ModerationNotice } from '@/components/safety/ModerationNotice';
import { Avatar, Badge } from '@/components/ui';
import { PROJECT_CATEGORY_ICONS, PROJECT_STATUS_BADGES, categoryLabel, projectPath, projectUrl, statusLabel } from '@/constants/showcase';
import { useProjectStore } from '@/store/projectStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import { getFullName } from '@/utils/string';

/** "Things I've built": thumbnail, title, short description, tech, status, builder, views, like and share. */
export function ProjectCard({ project, headingLevel = 'h3', compact = false }) {
  const options = useProjectStore((state) => state.options);
  const likeBusy = useProjectStore((state) => Boolean(state.busy[`${project.id}:like`]));
  const { likeProject, unlikeProject, shareProject } = useProjectStore.getState();
  const CategoryIcon = PROJECT_CATEGORY_ICONS[project.category] ?? PROJECT_CATEGORY_ICONS.other;
  const Heading = headingLevel;
  const owner = project.owner;
  const ownerLine = [owner?.branch?.shortName, owner?.semester?.label].filter(Boolean).join(' • ');

  const like = async () => {
    try {
      await (project.likedByCurrentUser ? unlikeProject : likeProject)(project.id);
    } catch (error) {
      toast.error(error.message);
    }
  };
  const share = async () => {
    if (await shareProject(project.id)) toast.success('Project link copied!');
    else toast.error(`Couldn't copy automatically. The link is ${projectUrl(project.id)}`);
  };

  return (
    <motion.article
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex h-full flex-col overflow-hidden glass-card rounded-3xl border border-line bg-surface shadow-soft"
      data-project-id={project.id}
    >
      <Link to={projectPath(project.id)} tabIndex={-1} aria-hidden="true" className={cn('relative block overflow-hidden bg-primary-soft', compact ? 'aspect-[16/8]' : 'aspect-video')}>
        {project.thumbnail ? (
          <img src={project.thumbnail.url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="campus-grid grid size-full place-items-center text-primary-soft-fg">
            <CategoryIcon className="size-10 opacity-80" />
          </div>
        )}
        {project.featured && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-lg bg-overlay/90 px-2 py-1 text-[11px] font-bold text-accent-fg backdrop-blur-sm">
            <Star className="size-3 fill-current" /> Featured
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Heading className="font-display text-base leading-snug font-bold text-ink">
            <Link to={projectPath(project.id)} className="hover:underline">{project.title}</Link>
          </Heading>
          <ProjectMenu project={project} />
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="neutral" icon={CategoryIcon} className="px-2 py-0.5 text-[11px]">{categoryLabel(options, project.category)}</Badge>
          <Badge variant={PROJECT_STATUS_BADGES[project.status]} className="px-2 py-0.5 text-[11px]">{statusLabel(options, project.status)}</Badge>
        </div>
        {project.moderation && <ModerationNotice status={project.moderation.status} noun="project" className="mt-2" />}
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">{project.shortDescription}</p>

        {project.techStack.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1" aria-label="Tech stack">
            {project.techStack.slice(0, compact ? 3 : 5).map((tech) => (
              <li key={tech} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">{tech}</li>
            ))}
            {project.techStack.length > (compact ? 3 : 5) && <li className="px-1 text-[11px] text-ink-subtle">+{project.techStack.length - (compact ? 3 : 5)}</li>}
          </ul>
        )}

        <div className="mt-auto pt-4">
          {owner && !compact && (
            <div className="mb-3 flex items-center gap-2">
              <Avatar src={owner.avatarUrl} name={getFullName(owner)} size="xs" />
              <p className="min-w-0 truncate text-xs text-ink-muted">
                <span className="font-semibold text-ink">{getFullName(owner)}</span>
                {ownerLine && <> · {ownerLine}</>}
              </p>
            </div>
          )}
          <div className="flex items-center gap-1 border-t border-line pt-2 text-xs font-semibold text-ink-muted">
            <span className="inline-flex items-center gap-1 px-1" title={`${project.views} views`}>
              <Eye className="size-3.5" aria-hidden="true" /> {project.views} <span className="sr-only">views</span>
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={like}
              disabled={likeBusy}
              aria-pressed={project.likedByCurrentUser}
              aria-label={`${project.likedByCurrentUser ? 'Unlike' : 'Like'} ${project.title} (${project.likeCount} ${project.likeCount === 1 ? 'like' : 'likes'})`}
              className={cn('inline-flex h-8 items-center gap-1 rounded-lg px-2 transition-colors', project.likedByCurrentUser ? 'text-danger' : 'hover:bg-surface-muted hover:text-ink')}
            >
              <Heart className={cn('size-4', project.likedByCurrentUser && 'fill-current')} aria-hidden="true" />
              <span aria-hidden="true">{project.likeCount}</span>
            </button>
            <button type="button" onClick={share} aria-label={`Share ${project.title}: copy link`} className="grid size-8 place-items-center rounded-lg hover:bg-surface-muted hover:text-ink">
              <Share2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
