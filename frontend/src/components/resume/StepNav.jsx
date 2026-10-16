import { useEffect, useRef } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { RESUME_STEPS } from '@/constants/resume';
import { cn } from '@/utils/cn';

/**
 * The wizard's steps as a horizontal, scrollable list: where you are, what's filled in, and what still
 * needs attention. Any step can be opened at any time.
 */
export function StepNav({ current, onSelect, filled, needsAttention }) {
  const index = RESUME_STEPS.findIndex((step) => step.id === current);
  const listRef = useRef(null);

  // Keep the current step's button in view when the list scrolls sideways (phones).
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector('[aria-current="step"]')?.parentElement;
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ left: Math.max(0, item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2), behavior: reduce ? 'auto' : 'smooth' });
  }, [current]);
  return (
    <nav aria-label="Resume steps" className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-ink-muted">
        <span>
          Step {index + 1} of {RESUME_STEPS.length}
        </span>
        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
          <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((index + 1) / RESUME_STEPS.length) * 100}%` }} />
        </span>
      </div>
      {/* relative: keeps the buttons' sr-only labels inside the scrolling list (they would widen the page). */}
      <ol ref={listRef} className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {RESUME_STEPS.map((step, position) => {
          const active = step.id === current;
          const attention = needsAttention.has(step.id);
          const done = !attention && filled.has(step.id);
          const Icon = step.icon;
          return (
            <li key={step.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={active ? 'step' : undefined}
                data-step={step.id}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                  active ? 'border-primary bg-primary text-primary-fg shadow-soft' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                <span className={cn('grid size-5 place-items-center rounded-full text-[11px]', active ? 'bg-white/20' : 'bg-surface-muted')}>
                  {attention ? <CircleAlert className={cn('size-3.5', !active && 'text-danger-fg')} aria-hidden="true" /> : done ? <Check className={cn('size-3.5', !active && 'text-primary')} aria-hidden="true" /> : <Icon className="size-3" aria-hidden="true" />}
                </span>
                <span className="sm:hidden">{step.short}</span>
                <span className="hidden sm:inline">
                  {position + 1}. {step.label}
                </span>
                {attention && <span className="sr-only">(needs attention)</span>}
                {done && <span className="sr-only">(filled in)</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
