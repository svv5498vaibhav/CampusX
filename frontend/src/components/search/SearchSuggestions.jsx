import { Compass, FolderKanban, History, Search, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { cn } from '@/utils/cn';

const KIND_ICONS = { search: Search, recent: History, project: FolderKanban, community: UsersRound, opportunity: Compass };
const KIND_LABELS = { student: 'Student', project: 'Project', community: 'Community', opportunity: 'Opportunity', recent: 'Recent search', search: 'Search' };

/** The option ids used by aria-activedescendant. */
export const suggestionOptionId = (listId, index) => `${listId}-option-${index}`;

/**
 * The listbox under the search input: suggestions as the student types, or recent searches while it is
 * empty. Options are chosen with the mouse or with the arrow keys + Enter (handled by SearchInput).
 * Mouse-down is prevented so the input keeps focus while an option is clicked.
 */
export function SearchSuggestions({ id, items, activeIndex, onSelect, onHover, heading, loading = false, className }) {
  return (
    <div className={cn('glass-overlay overflow-hidden rounded-2xl border border-line bg-overlay shadow-lift', className)}>
      {heading && <p className="px-4 pt-3 pb-1 text-xs font-bold tracking-wide text-ink-subtle uppercase" aria-hidden="true">{heading}</p>}
      <ul id={id} role="listbox" aria-label={heading ?? 'Search suggestions'} aria-busy={loading || undefined} className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5">
        {items.map((item, index) => {
          const Icon = KIND_ICONS[item.kind] ?? Search;
          const active = index === activeIndex;
          return (
            <li
              key={`${item.kind}:${item.id ?? item.query}:${item.type ?? ''}:${index}`}
              id={suggestionOptionId(id, index)}
              role="option"
              aria-selected={active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(item)}
              onMouseEnter={() => onHover?.(index)}
              className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors', active ? 'bg-primary-soft text-primary-soft-fg' : 'text-ink hover:bg-surface-muted')}
            >
              {item.kind === 'student' ? (
                <Avatar src={item.avatarUrl} name={item.label} size="sm" shape="circle" />
              ) : (
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl', active ? 'bg-surface/70' : 'bg-surface-muted text-ink-muted')} aria-hidden="true">
                  <Icon className="size-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{item.label}</span>
                {item.subtitle && <span className="block truncate text-xs text-ink-muted">{item.subtitle}</span>}
              </span>
              <span className="sr-only">, {KIND_LABELS[item.kind] ?? 'Suggestion'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
