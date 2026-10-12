import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, CircleCheck, Clock, FolderPlus, LoaderCircle, Play, Sparkles, Target } from 'lucide-react';
import { Link } from 'react-router';
import { CATEGORY_META, DIFFICULTY_LABELS, formatHours } from '@/constants/roadmap';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/utils/cn';
import { RoadmapResourceList } from './RoadmapResourceList';

const EASE = [0.22, 1, 0.36, 1];
const BURST = [0, 60, 120, 180, 240, 300];

/** The round "done" checkbox. Its tick draws itself once the server has saved the change. */
function CompletionToggle({ ref, title, completed, pending, onToggle, celebrate }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="relative mt-0.5 grid size-9 shrink-0 place-items-center">
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-busy={Boolean(pending) || undefined}
        aria-disabled={Boolean(pending) || undefined}
        aria-label={completed ? `${title}: completed. Mark as not done` : `Mark “${title}” as complete`}
        onClick={pending ? undefined : onToggle}
        className={cn(
          'relative grid size-9 place-items-center rounded-full border-2 transition-[background-color,border-color,transform] duration-300 ease-campus active:scale-90',
          completed ? 'border-primary bg-primary text-primary-fg shadow-glow' : 'border-line-strong bg-surface text-primary hover:border-primary',
          pending && 'cursor-wait',
        )}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: completed ? 1 : 0, opacity: completed ? 1 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
            />
          </svg>
        )}
      </button>
      {/* A one-off sparkle when this tab just completed it (skipped with reduced motion). */}
      {celebrate && !reduceMotion &&
        BURST.map((angle) => (
          <motion.span
            key={angle}
            aria-hidden="true"
            className="pointer-events-none absolute size-1.5 rounded-full bg-primary"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos((angle * Math.PI) / 180) * 24, y: Math.sin((angle * Math.PI) / 180) * 24, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        ))}
    </span>
  );
}

/**
 * One milestone: what to learn or build, how hard and how long, what it builds on, objectives, a suggested
 * project and resources. Status changes go through `onSetStatus`, which resolves once the server saved them;
 * the card only shows a change the server confirmed.
 */
export function MilestoneCard({ milestone, pending, lastChange, focusRequest, onSetStatus }) {
  const reduceMotion = useReducedMotion();
  const detailsId = useId();
  const headingRef = useRef(null);
  const toggleRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const completed = milestone.status === 'completed';
  const inProgress = milestone.status === 'in-progress';
  const category = CATEGORY_META[milestone.category] ?? CATEGORY_META.learn;
  const CategoryIcon = category.icon;

  // A fresh completion made in this tab: a short success moment, then back to normal.
  const justCompleted = lastChange?.id === milestone.id && lastChange.status === 'completed' && Date.now() - lastChange.at < 4000;
  useEffect(() => {
    if (!justCompleted) return undefined;
    setCelebrate(true);
    const timer = setTimeout(() => setCelebrate(false), 2600);
    return () => clearTimeout(timer);
  }, [justCompleted, lastChange?.at]);

  // "Open" from the next-task card: expand, scroll to and focus this milestone.
  useEffect(() => {
    // Only a fresh request: a card that mounts again later must not grab focus.
    if (focusRequest?.id !== milestone.id || Date.now() - focusRequest.at > 2000) return;
    setExpanded(true);
    headingRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    headingRef.current?.focus({ preventScroll: true });
  }, [focusRequest?.at]);

  // Buttons are never disabled mid-save (that would drop keyboard focus); repeat clicks are ignored instead.
  const act = async (status) => {
    if (pending) return;
    const saved = await onSetStatus(milestone.id, status);
    // The button used may be gone now (e.g. "Mark complete"): keep focus on this milestone.
    if (saved && (!document.activeElement || document.activeElement === document.body)) toggleRef.current?.focus();
  };

  return (
    <article
      id={`milestone-${milestone.id}`}
      data-milestone={milestone.id}
      data-status={milestone.status}
      className={cn(
        'relative rounded-3xl border p-4 transition-[background-color,border-color,box-shadow] duration-500 ease-campus sm:p-5',
        completed ? 'border-primary/30 bg-primary-soft/40' : 'border-line bg-surface shadow-soft',
        celebrate && 'shadow-glow',
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        <CompletionToggle ref={toggleRef} title={milestone.title} completed={completed} pending={pending} onToggle={() => act(completed ? 'not-started' : 'completed')} celebrate={celebrate} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-primary-soft-fg">
              <CategoryIcon className="size-3.5" aria-hidden="true" /> {category.label}
            </span>
            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-ink-muted">{DIFFICULTY_LABELS[milestone.difficulty]}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-ink-muted" title="A rough estimate for planning">
              <Clock className="size-3.5" aria-hidden="true" /> {formatHours(milestone.effortHours)}
            </span>
            {!milestone.required && <span className="rounded-md border border-dashed border-line-strong px-2 py-0.5 text-ink-muted">Optional</span>}
            {inProgress && <span className="rounded-md bg-accent-soft px-2 py-0.5 text-accent-fg">In progress</span>}
          </div>

          <h3 ref={headingRef} tabIndex={-1} className={cn('mt-2 font-display text-lg leading-snug font-bold outline-none transition-colors duration-500', completed ? 'text-primary-soft-fg' : 'text-ink')}>
            {milestone.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{milestone.summary}</p>

          {milestone.prerequisites.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-muted">
              <span className="font-semibold">Builds on:</span>
              {milestone.prerequisites.map((item) => (
                <span key={item.id} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5', item.completed ? 'bg-primary-soft text-primary-soft-fg' : 'bg-surface-muted')}>
                  {item.completed && <Check className="size-3" aria-hidden="true" />}
                  {item.title}
                  <span className="sr-only">{item.completed ? '(done)' : '(not done yet)'}</span>
                </span>
              ))}
            </p>
          )}

          <AnimatePresence>
            {celebrate && (
              <motion.p
                role="status"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-fg"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                {milestone.category === 'build' ? 'Your project milestone is complete. Explore the next challenge.' : 'Milestone complete. Nice work!'}
              </motion.p>
            )}
          </AnimatePresence>

          {completed && milestone.category === 'build' && (
            <p className="mt-3 text-sm">
              <Link to={ROUTES.PROJECT_CREATE} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                <FolderPlus className="size-4" aria-hidden="true" /> Show it in Things I’ve Built
              </Link>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!completed && (
              <button
                type="button"
                aria-pressed={inProgress}
                aria-disabled={Boolean(pending) || undefined}
                onClick={() => act(inProgress ? 'not-started' : 'in-progress')}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors aria-disabled:opacity-60',
                  inProgress ? 'bg-accent-soft text-accent-fg hover:opacity-90' : 'border border-line-strong bg-surface text-ink hover:border-primary hover:text-primary',
                )}
              >
                {inProgress ? <Target className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                {inProgress ? 'Working on it' : 'Start'}
              </button>
            )}
            {!completed && (
              <button
                type="button"
                aria-disabled={Boolean(pending) || undefined}
                onClick={() => act('completed')}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg shadow-soft transition-[background-color,transform,box-shadow] hover:bg-primary-hover hover:shadow-glow active:scale-[0.97] aria-disabled:opacity-60"
              >
                <CircleCheck className="size-4" aria-hidden="true" /> Mark complete
              </button>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              {expanded ? 'Hide details' : 'Details & resources'}
              <ChevronDown className={cn('size-4 transition-transform duration-300', expanded && 'rotate-180')} aria-hidden="true" />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                id={detailsId}
                key="details"
                initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
                  {milestone.objectives.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold tracking-wide text-ink-muted uppercase">You’ll be able to</h4>
                      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink">
                        {milestone.objectives.map((objective) => (
                          <li key={objective} className="flex gap-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> {objective}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {milestone.project && (
                    <div className="rounded-2xl bg-accent-soft p-3.5">
                      <h4 className="text-xs font-bold tracking-wide text-accent-fg uppercase">Suggested project</h4>
                      <p className="mt-1 font-semibold text-ink">{milestone.project.title}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">{milestone.project.description}</p>
                    </div>
                  )}
                  {milestone.skills.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold tracking-wide text-ink-muted uppercase">Skills</h4>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {milestone.skills.map((skill) => (
                          <li key={skill} className="rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink">{skill}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <h4 className="mb-2 text-xs font-bold tracking-wide text-ink-muted uppercase">Resources</h4>
                    <RoadmapResourceList resources={milestone.resources} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </article>
  );
}
