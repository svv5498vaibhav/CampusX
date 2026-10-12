import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { Link } from 'react-router';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { useRoadmapStore } from '@/store/roadmapStore';

const MotionLink = motion.create(Link);

/**
 * The Semester Roadmap entry on the student's own profile: one large, clearly labelled link to
 * /profile/roadmap. When the summary has loaded it also shows real progress (never a placeholder number).
 */
export function RoadmapProfileCard() {
  const reduceMotion = useReducedMotion();
  const userId = useAuthStore((state) => state.user?.id);
  const summary = useRoadmapStore((state) => state.summary);

  useEffect(() => {
    useRoadmapStore.getState().forViewer(userId);
    useRoadmapStore.getState().fetchSummary();
  }, [userId]);

  return (
    <MotionLink
      to={ROUTES.ROADMAP}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      className="group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-leaf-200 bg-gradient-to-r from-leaf-50 via-surface to-leaf-100 p-4 shadow-soft transition-[box-shadow,border-color] duration-300 hover:border-primary hover:shadow-glow sm:p-5 dark:border-line dark:from-primary-soft dark:via-surface dark:to-surface"
      data-testid="semester-roadmap-button"
    >
      <span className="campus-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
      <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-fg shadow-glow transition-transform duration-300 ease-campus group-hover:-rotate-6 group-hover:scale-105 sm:size-14">
        <GraduationCap className="size-6 sm:size-7" aria-hidden="true" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-lg font-bold text-ink sm:text-xl">
          <span aria-hidden="true">🎓 </span>Semester Roadmap
        </span>
        <span className="block text-sm text-ink-muted">Your semester-by-semester path to skills, projects and placements.</span>
        {summary && (
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-primary-soft-fg">
            <span>Semester {summary.currentSemester} of {summary.totalSemesters}</span>
            <span>{summary.careerGoal.title}</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${summary.overall.percentage}%` }} />
              </span>
              {summary.overall.percentage}% complete
            </span>
          </span>
        )}
      </span>
      <ChevronRight className="relative size-6 shrink-0 text-primary transition-transform duration-300 ease-campus group-hover:translate-x-1" aria-hidden="true" />
    </MotionLink>
  );
}
