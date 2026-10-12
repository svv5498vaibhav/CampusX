import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';

/** Filter chips (All, My Branch, Achievements, ...). Labels come from the API. Reused for communities. */
export function FeedFilters({ filters, value, onChange, disabled = false, label = 'Filter the feed' }) {
  if (!filters?.length) return <div className="h-10" aria-hidden="true" />;

  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex gap-1.5">
        {filters.map((filter) => {
          const active = filter.id === value;
          return (
            <li key={filter.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={active}
                disabled={disabled && !active}
                onClick={() => !active && onChange(filter.id)}
                className={cn(
                  'relative isolate h-10 rounded-xl px-4 text-sm font-semibold whitespace-nowrap transition-colors',
                  active ? 'text-primary-fg' : 'text-ink-muted hover:bg-surface hover:text-ink',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="feed-filter-active"
                    className="absolute inset-0 -z-10 rounded-xl bg-primary shadow-soft"
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  />
                )}
                {filter.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
