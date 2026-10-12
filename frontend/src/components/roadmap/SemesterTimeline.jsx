import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, MapPin } from 'lucide-react';
import { SEMESTER_STATE_META } from '@/constants/roadmap';
import { cn } from '@/utils/cn';

const EASE = [0.22, 1, 0.36, 1];

/**
 * The journey path: all eight semesters as tabs (arrow keys, Home and End move between them). The line
 * fills up to the selected semester, the active marker glides to it, and the current semester carries a
 * "You are here" pin. On phones the path scrolls sideways and keeps the selected semester in view.
 */
export function SemesterTimeline({ semesters, selected, onSelect }) {
  const reduceMotion = useReducedMotion();
  const refs = useRef({});
  const rowRef = useRef(null);
  const index = selected - 1;
  const total = semesters.length;

  useEffect(() => {
    // Centre the selected semester by scrolling the row only (never the page), when the row scrolls at all.
    const row = rowRef.current;
    const tab = refs.current[selected];
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return;
    const rowBox = row.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    row.scrollBy({ left: tabBox.left + tabBox.width / 2 - (rowBox.left + rowBox.width / 2), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selected, reduceMotion]);

  const onKeyDown = (event) => {
    const next = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 1, End: total }[event.key];
    if (!next) return;
    event.preventDefault();
    const target = Math.min(total, Math.max(1, next));
    onSelect(target);
    refs.current[target]?.focus();
  };

  return (
    <nav ref={rowRef} aria-label="Semester journey" className="relative -mx-4 overflow-x-auto px-4 pt-2 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <div role="tablist" aria-label="Semesters" aria-orientation="horizontal" onKeyDown={onKeyDown} className="relative grid min-w-[40rem] grid-cols-8 sm:min-w-0">
        {/* The path behind the stops: from the first stop's centre to the last's. */}
        <div className="absolute top-7 right-[6.25%] left-[6.25%] h-1.5 rounded-full bg-line" aria-hidden="true">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${(index / (total - 1)) * 100}%` }}
            transition={{ duration: reduceMotion ? 0 : 0.55, ease: EASE }}
          />
        </div>

        {semesters.map((semester, position) => {
          const isSelected = semester.semester === selected;
          const meta = SEMESTER_STATE_META[semester.state] ?? SEMESTER_STATE_META.upcoming;
          const completed = semester.state === 'completed';
          return (
            <motion.button
              key={semester.semester}
              ref={(node) => {
                refs.current[semester.semester] = node;
              }}
              type="button"
              role="tab"
              id={`roadmap-tab-${semester.semester}`}
              aria-selected={isSelected}
              aria-controls="roadmap-semester-panel"
              aria-label={`Semester ${semester.semester}: ${meta.label}, ${semester.progress.completed} of ${semester.progress.required} milestones${semester.isCurrent ? ', your current semester' : ''}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(semester.semester)}
              data-state={semester.state}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.1 + position * 0.045 }}
              className="group relative flex flex-col items-center gap-1.5 rounded-2xl px-1 pt-1 pb-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="relative grid size-12 place-items-center">
                {isSelected && (
                  <motion.span
                    layoutId="roadmap-semester-active"
                    className="absolute -inset-1.5 rounded-full bg-primary/15 ring-2 ring-primary/40 shadow-glow"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    aria-hidden="true"
                  />
                )}
                <motion.span
                  animate={{ scale: isSelected ? 1.08 : 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  className={cn('relative grid size-11 place-items-center rounded-full border-2 font-display text-base font-bold transition-colors duration-300', meta.node, semester.isCurrent && !completed && 'ring-4 ring-primary/20')}
                >
                  {completed ? (
                    <motion.span key="done" initial={reduceMotion ? false : { scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>
                      <Check className="size-5" strokeWidth={3} aria-hidden="true" />
                    </motion.span>
                  ) : (
                    semester.semester
                  )}
                </motion.span>
              </span>
              <span className={cn('text-xs font-bold transition-colors', isSelected ? 'text-primary' : 'text-ink group-hover:text-primary')}>Sem {semester.semester}</span>
              <span className="text-[11px] leading-tight font-semibold text-ink-muted">{meta.label}</span>
              <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                <motion.span className="block h-full rounded-full bg-primary" initial={false} animate={{ width: `${semester.progress.percentage}%` }} transition={{ duration: reduceMotion ? 0 : 0.6, ease: EASE }} />
              </span>
              {semester.isCurrent && (
                <span className="absolute -top-2 right-0 left-0 mx-auto inline-flex w-max items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-fg shadow-soft">
                  <MapPin className="size-3" aria-hidden="true" /> You
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
