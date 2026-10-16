import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CircleCheck, Flag, PartyPopper, Play } from 'lucide-react';
import { Button } from '@/components/ui';
import { CATEGORY_META, NEXT_REASON_LABELS, formatHours } from '@/constants/roadmap';

/** The clear next action: the milestone the server picked, with one click to open, start or finish it. */
export function NextTaskCard({ next, pending, onOpen, onSetStatus }) {
  const reduceMotion = useReducedMotion();
  if (!next) {
    return (
      <section aria-labelledby="roadmap-next-heading" className="flex items-center gap-4 rounded-3xl border border-primary/30 bg-primary-soft/50 p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-fg">
          <PartyPopper className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 id="roadmap-next-heading" className="font-display text-lg font-bold text-ink">Every required milestone is complete</h2>
          <p className="text-sm text-ink-muted">Optional extras and new projects are always open. Keep building!</p>
        </div>
      </section>
    );
  }
  const category = CATEGORY_META[next.category] ?? CATEGORY_META.learn;
  const CategoryIcon = category.icon;
  const busy = Boolean(pending);
  return (
    <motion.section
      aria-labelledby="roadmap-next-heading"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.2 }}
      className="relative overflow-hidden glass-card rounded-3xl border border-line bg-surface p-5 shadow-soft"
      data-next-milestone={next.id}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-primary" aria-hidden="true" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg">
          <Flag className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">Up next · {NEXT_REASON_LABELS[next.reason] ?? 'Next milestone'}</p>
          <h2 id="roadmap-next-heading" className="mt-1 font-display text-lg leading-snug font-bold text-ink">{next.title}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink-muted">
            <span>Semester {next.semester}</span>
            <span className="inline-flex items-center gap-1"><CategoryIcon className="size-3.5" aria-hidden="true" /> {category.label}</span>
            <span>{formatHours(next.effortHours)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" rightIcon={ArrowRight} onClick={() => onOpen(next)}>
            Open
          </Button>
          {next.status === 'in-progress' ? (
            <Button size="sm" leftIcon={CircleCheck} loading={busy} aria-disabled={busy || undefined} onClick={() => !busy && onSetStatus(next.id, 'completed')}>
              Mark complete
            </Button>
          ) : (
            <Button size="sm" leftIcon={Play} loading={busy} aria-disabled={busy || undefined} onClick={() => !busy && onSetStatus(next.id, 'in-progress')}>
              Start
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
