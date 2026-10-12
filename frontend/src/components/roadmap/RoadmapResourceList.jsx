import { ArrowUpRight, BookMarked, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { RESOURCE_KIND_LABELS } from '@/constants/roadmap';
import { safeExternalUrl } from '@/utils/url';

const ROW = 'flex items-start gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm transition-colors hover:border-primary/50 hover:bg-primary-soft/40';

/**
 * A milestone's resources. External links open in a new tab (the roadmap stays open, progress is on the
 * server), and only plain http(s) links are ever rendered. CampusX pages open in the app.
 */
export function RoadmapResourceList({ resources }) {
  const usable = resources.filter((resource) => (resource.kind === 'campusx' ? resource.path?.startsWith('/') : safeExternalUrl(resource.url)));
  if (!usable.length) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line-strong px-3.5 py-3 text-sm text-ink-muted">
        <BookMarked className="size-4 shrink-0" aria-hidden="true" />
        No resources linked for this milestone yet. Your seniors and communities are a great place to ask.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {usable.map((resource) => (
        <li key={resource.url ?? resource.path}>
          {resource.kind === 'campusx' ? (
            <Link to={resource.path} className={ROW}>
              <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{resource.title}</span>
                <span className="text-xs text-ink-muted">{RESOURCE_KIND_LABELS.campusx}</span>
              </span>
            </Link>
          ) : (
            <a href={safeExternalUrl(resource.url)} target="_blank" rel="noopener noreferrer" className={ROW}>
              <ExternalLink className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-semibold break-words text-ink">{resource.title}</span>
                <span className="text-xs text-ink-muted">
                  {resource.source} · {RESOURCE_KIND_LABELS[resource.kind] ?? 'Link'}
                  <span className="sr-only"> (opens in a new tab)</span>
                </span>
              </span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
