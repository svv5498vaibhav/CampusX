import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Award, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { RoadmapProgressRing } from './RoadmapProgressRing';

/**
 * Shown in place (never a blocking dialog) right after the student completes every required milestone
 * of a semester in this tab: the ring fills to 100%, the semester badge appears, and the next semester is
 * one click away. It only follows a completion the server confirmed.
 */
export function SemesterCompletionCelebration({ semester, totalSemesters, onExploreNext, onDismiss }) {
  const reduceMotion = useReducedMotion();
  const hasNext = semester < totalSemesters;
  return (
    <motion.section
      role="status"
      aria-label={`Semester ${semester} complete`}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-primary-soft via-surface to-accent-soft p-5 shadow-glow sm:p-6"
      data-celebration={semester}
    >
      <button type="button" onClick={onDismiss} aria-label="Close" className="absolute top-3 right-3 grid size-9 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink">
        <X className="size-4" aria-hidden="true" />
      </button>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="relative">
          <RoadmapProgressRing value={100} size={84} stroke={8} label={`Semester ${semester} progress`} valueText="100%: every required milestone complete">
            <motion.span
              initial={reduceMotion ? false : { scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.7, type: 'spring', stiffness: 360, damping: 16 }}
              className="grid size-12 place-items-center rounded-2xl bg-sun-400 text-sun-900 shadow-soft"
            >
              <Award className="size-6" aria-hidden="true" />
            </motion.span>
          </RoadmapProgressRing>
        </div>
        <div className="min-w-0 flex-1 pr-8">
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">Semester badge unlocked</p>
          <h3 className="mt-1 font-display text-xl font-bold text-ink">Semester {semester} complete!</h3>
          <p className="mt-1 text-sm text-ink-muted">
            {hasNext ? 'Every required milestone is done. Your roadmap is taking shape.' : 'You finished the last semester of your roadmap. Congratulations!'}
          </p>
        </div>
        {hasNext && (
          <Button rightIcon={ArrowRight} onClick={onExploreNext}>
            Explore Semester {semester + 1}
          </Button>
        )}
      </div>
    </motion.section>
  );
}
