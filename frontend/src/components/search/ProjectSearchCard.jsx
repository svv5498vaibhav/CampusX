import { Heart, Star } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Badge, Button } from '@/components/ui';
import { labelOf, searchResultPath } from '@/constants/search';
import { PROJECT_CATEGORY_ICONS } from '@/constants/showcase';
import { useSearchStore } from '@/store/searchStore';
import { getFullName } from '@/utils/string';

/**
 * A project in search results: thumbnail, title, short description, tech stack, builder and category.
 * Discover adds a recommendation `reason` and a `menu` (both optional).
 */
export function ProjectSearchCard({ project, headingLevel = 'h3', reason, menu }) {
  const categories = useSearchStore((state) => state.options?.filters.projectCategories);
  const Heading = headingLevel;
  const CategoryIcon = PROJECT_CATEGORY_ICONS[project.category] ?? PROJECT_CATEGORY_ICONS.other;
  const path = searchResultPath('projects', project);
  const owner = project.owner;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-soft transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift" data-search-result="project" data-project-id={project.id}>
      <Link to={path} tabIndex={-1} aria-hidden="true" className="relative block aspect-[16/8] overflow-hidden bg-primary-soft">
        {project.thumbnail ? (
          <img src={project.thumbnail.url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="campus-grid grid size-full place-items-center text-primary-soft-fg">
            <CategoryIcon className="size-9 opacity-80" />
          </div>
        )}
        {project.featured && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-lg bg-surface/90 px-2 py-1 text-[11px] font-bold text-accent-fg">
            <Star className="size-3 fill-current" /> Featured
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          <Heading className="min-w-0 flex-1 font-display text-base leading-snug font-bold text-ink">
            <Link to={path} className="hover:underline">{project.title}</Link>
          </Heading>
          {menu && <div className="-mt-1.5 -mr-2 shrink-0">{menu}</div>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="neutral" icon={CategoryIcon} className="px-2 py-0.5 text-[11px]">{labelOf(categories, project.category)}</Badge>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">{project.shortDescription}</p>

        {project.techStack?.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1" aria-label="Tech stack">
            {project.techStack.slice(0, 4).map((tech) => (
              <li key={tech} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">{tech}</li>
            ))}
            {project.techStack.length > 4 && <li className="px-1 text-[11px] text-ink-subtle">+{project.techStack.length - 4}</li>}
          </ul>
        )}

        {reason && <div className="mt-3">{reason}</div>}

        <div className="mt-auto flex items-center gap-2 pt-4">
          {owner && (
            <>
              <Avatar src={owner.avatarUrl} name={getFullName(owner)} size="xs" />
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{getFullName(owner)}</p>
            </>
          )}
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted" title={`${project.likeCount} likes`}>
            <Heart className="size-3.5" aria-hidden="true" /> {project.likeCount}
            <span className="sr-only">likes</span>
          </span>
        </div>
        <Button as={Link} to={path} variant="outline" size="sm" fullWidth className="mt-3" aria-label={`View project: ${project.title}`}>
          View Project
        </Button>
      </div>
    </article>
  );
}
