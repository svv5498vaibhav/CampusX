import { useRef } from 'react';
import { motion } from 'framer-motion';
import { SEARCH_TABS_FALLBACK, SEARCH_TYPE_META } from '@/constants/search';
import { cn } from '@/utils/cn';

export const searchTabId = (type) => `search-tab-${type}`;
export const SEARCH_PANEL_ID = 'search-results-panel';

/**
 * All · Students · Posts · Projects · Communities · Opportunities · Achievements. A tab list: ← / →
 * (and Home / End) move between tabs. `counts` (from "All") are shown next to each label when known.
 */
export function SearchTabs({ tabs = SEARCH_TABS_FALLBACK, value, onChange, counts }) {
  const refs = useRef({});

  const keyDown = (event, index) => {
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
    refs.current[next.id]?.focus();
    onChange(next.id);
  };

  return (
    // Phones scroll the tabs sideways; wider screens wrap them so none is cut off.
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 md:overflow-visible">
      <div role="tablist" aria-label="What to search" className="flex gap-1.5 md:flex-wrap">
        {tabs.map((tab, index) => {
          const meta = SEARCH_TYPE_META[tab.id] ?? SEARCH_TYPE_META.all;
          const Icon = meta.icon;
          const active = tab.id === value;
          const count = tab.id !== 'all' ? counts?.[tab.id] : undefined;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={searchTabId(tab.id)}
              aria-selected={active}
              aria-controls={SEARCH_PANEL_ID}
              tabIndex={active ? 0 : -1}
              onClick={() => !active && onChange(tab.id)}
              onKeyDown={(event) => keyDown(event, index)}
              className={cn(
                'relative isolate inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold whitespace-nowrap transition-colors',
                active ? 'text-primary-fg' : 'text-ink-muted hover:bg-surface hover:text-ink',
              )}
            >
              {active && (
                <motion.span layoutId="search-tab-active" className="absolute inset-0 -z-10 rounded-xl bg-primary shadow-soft" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
              )}
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
              {count !== undefined && (
                <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', active ? 'bg-primary-fg/20' : 'bg-surface-muted text-ink-subtle')}>
                  {count > 99 ? '99+' : count}
                  <span className="sr-only"> results</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
