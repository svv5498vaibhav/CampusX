import { useId } from 'react';
import { motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Grouped toggle chips. Selected chips show a tick (not just colour), and once the maximum is
 * reached the rest are marked unavailable until one is removed.
 */
export function InterestSelector({ groups, interests, selected, onChange, rules, describedBy }) {
  const countId = useId();
  const isAtMax = selected.length >= rules.max;

  const toggle = (interestId) => {
    if (selected.includes(interestId)) {
      onChange(selected.filter((id) => id !== interestId));
    } else if (!isAtMax) {
      onChange([...selected, interestId]);
    }
  };

  return (
    <div className="flex flex-col gap-6" aria-describedby={describedBy}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-muted px-4 py-3">
        <p id={countId} aria-live="polite" className="text-sm font-semibold text-ink">
          {selected.length} selected
        </p>
        <p className="text-xs text-ink-muted">
          Choose {rules.min} to {rules.max}
          {isAtMax && <span className="font-semibold text-accent-fg"> · maximum reached, remove one to swap</span>}
        </p>
      </div>

      {groups.map((group) => {
        const items = interests.filter((interest) => interest.group === group.id);
        if (items.length === 0) return null;
        const headingId = `${countId}-${group.id}`;
        return (
          <section key={group.id} aria-labelledby={headingId}>
            <h2 id={headingId} className="text-xs font-bold tracking-[0.12em] text-ink-subtle uppercase">
              {group.name}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {items.map((interest) => {
                const isSelected = selected.includes(interest.id);
                const isBlocked = !isSelected && isAtMax;
                const Icon = isSelected ? Check : Plus;
                return (
                  <li key={interest.id}>
                    <motion.button
                      type="button"
                      whileTap={isBlocked ? undefined : { scale: 0.94 }}
                      aria-pressed={isSelected}
                      aria-disabled={isBlocked || undefined}
                      aria-describedby={countId}
                      onClick={() => toggle(interest.id)}
                      className={cn(
                        'inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors duration-200',
                        isSelected
                          ? 'border-primary bg-primary text-primary-fg shadow-soft'
                          : 'border-line-strong bg-surface text-ink hover:border-primary hover:text-primary',
                        isBlocked && 'cursor-not-allowed opacity-45 hover:border-line-strong hover:text-ink',
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" strokeWidth={isSelected ? 3 : 2} />
                      {interest.name}
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
