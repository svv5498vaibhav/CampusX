import { useRef } from 'react';
import { motion } from 'framer-motion';
import { RANKING_PERIODS, RANKING_TABS } from '@/constants/gamification';
import { cn } from '@/utils/cn';

/** Campus / College / Branch / Semester tabs (arrow keys move between them) and All time / Month / Week. */
export function LeaderboardTabs({ scope, period, onChange }) {
  const refs = useRef({});
  const onKeyDown = (event) => {
    const index = RANKING_TABS.findIndex((tab) => tab.id === scope);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = RANKING_TABS[(index + step + RANKING_TABS.length) % RANKING_TABS.length].id;
    onChange({ scope: next });
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Leaderboard" onKeyDown={onKeyDown} className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {RANKING_TABS.map((tab) => {
          const selected = tab.id === scope;
          return (
            <button
              key={tab.id}
              ref={(node) => { refs.current[tab.id] = node; }}
              type="button"
              role="tab"
              id={`ranking-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls="ranking-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange({ scope: tab.id })}
              className={cn('relative isolate h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors', selected ? 'text-primary-fg' : 'text-ink-muted hover:text-ink')}
            >
              {selected && <motion.span layoutId="ranking-tab" className="absolute inset-0 -z-10 rounded-xl bg-primary shadow-soft" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              {tab.label}
            </button>
          );
        })}
      </div>
      <fieldset className="flex w-fit gap-1 rounded-xl bg-surface-muted p-1">
        <legend className="sr-only">Time period</legend>
        {RANKING_PERIODS.map((item) => (
          <label key={item.id} className={cn('cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus', period === item.id ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink')}>
            <input type="radio" name="ranking-period" value={item.id} checked={period === item.id} onChange={() => onChange({ period: item.id })} className="sr-only" />
            {item.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
