import { motion, useReducedMotion } from 'framer-motion';
import { Award, Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui';
import { SEMESTER_STATE_META, formatHours, semesterMessage } from '@/constants/roadmap';
import { RoadmapProgressRing } from './RoadmapProgressRing';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The selected semester at a glance: focus, state, real progress, work left and its badge once complete. */
export function SemesterOverviewCard({ semester }) {
  const reduceMotion = useReducedMotion();
  const meta = SEMESTER_STATE_META[semester.state] ?? SEMESTER_STATE_META.upcoming;
  const { completed, required, optional, optionalCompleted, percentage } = semester.progress;
  return (
    <div className="flex flex-col gap-5 glass-card rounded-3xl border border-line bg-surface p-5 shadow-soft sm:flex-row sm:items-center sm:p-6">
      <RoadmapProgressRing value={percentage} size={96} stroke={9} label={`Semester ${semester.semester} progress`} valueText={`${percentage}%: ${completed} of ${required} required milestones complete`} className="self-start sm:self-center">
        <span>
          <span className="block font-display text-2xl font-bold text-ink">{percentage}%</span>
          <span className="block text-[11px] font-semibold text-ink-muted">{completed}/{required}</span>
        </span>
      </RoadmapProgressRing>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={meta.badge}>{meta.label}</Badge>
          {semester.isCurrent && <Badge variant="primary" icon={MapPin}>You are here</Badge>}
        </div>
        <h2 id="roadmap-semester-heading" className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
          Semester {semester.semester} <span className="text-ink-muted">· {semester.title}</span>
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{semester.summary}</p>
        <p className="mt-3 text-sm font-semibold text-ink">{semesterMessage(semester)}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink-muted">
          <span>{completed} of {required} required milestones</span>
          {optional > 0 && <span>{optionalCompleted} of {optional} optional</span>}
          {semester.effortHoursRemaining > 0 && (
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" /> {formatHours(semester.effortHoursRemaining)} of planned work left</span>
          )}
        </div>
      </div>

      {semester.state === 'completed' && (
        <motion.div
          initial={reduceMotion ? false : { scale: 0.6, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="flex shrink-0 items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 sm:flex-col sm:text-center"
          data-semester-badge={semester.semester}
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-sun-400 text-sun-900 shadow-soft">
            <Award className="size-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-bold text-accent-fg">Semester {semester.semester} badge</span>
            {semester.completedAt && <span className="block text-xs text-ink-muted">Completed {dateFormat.format(new Date(semester.completedAt))}</span>}
          </span>
        </motion.div>
      )}
    </div>
  );
}
