import { motion, useReducedMotion } from 'framer-motion';
import { Flame, GraduationCap, RefreshCw, School } from 'lucide-react';
import { Button } from '@/components/ui';
import { goalIcon, journeyMessage } from '@/constants/roadmap';
import { RoadmapIllustration } from './RoadmapIllustration';
import { RoadmapProgressRing } from './RoadmapProgressRing';

const EASE = [0.22, 1, 0.36, 1];

function Stat({ label, value, detail }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface/80 px-4 py-3 backdrop-blur-sm">
      <dt className="text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-bold text-ink">
        {value}
        {detail && <span className="ml-1 text-sm font-semibold text-ink-muted">{detail}</span>}
      </dd>
    </div>
  );
}

/**
 * The top of the roadmap: goal, campus details, overall progress (all from the server) and the
 * student's real campus streak when they have one.
 */
export function RoadmapHero({ roadmap, streak, onChangeGoal }) {
  const reduceMotion = useReducedMotion();
  const { student, careerGoal, overall } = roadmap;
  const GoalIcon = goalIcon(careerGoal.icon);
  const current = roadmap.semesters[student.currentSemester - 1];
  const ringText = `${overall.percentage}%: ${overall.completed} of ${overall.required} required milestones complete`;
  const reveal = (delay) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: EASE, delay },
  });

  return (
    <section aria-labelledby="roadmap-title" className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-primary-soft via-surface to-surface shadow-soft">
      <div className="campus-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
        <div className="min-w-0">
          <motion.p {...reveal(0)} className="inline-flex items-center gap-2 rounded-full bg-surface/80 px-3 py-1 text-xs font-bold tracking-[0.12em] text-primary uppercase shadow-soft">
            <GraduationCap className="size-4" aria-hidden="true" /> Semester Roadmap
          </motion.p>
          <motion.h1 {...reveal(0.05)} id="roadmap-title" className="mt-4 font-display text-[1.75rem] leading-tight font-bold tracking-tight text-balance text-ink sm:text-4xl">
            Your journey to {careerGoal.journey}
          </motion.h1>
          <motion.div {...reveal(0.1)} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span className="font-semibold text-primary">Semester {student.currentSemester} of {student.totalSemesters}</span>
            {student.branch && <span>{student.branch.name}</span>}
            {student.college && (
              <span className="inline-flex items-center gap-1.5">
                <School className="size-4 shrink-0" aria-hidden="true" />
                {student.college.name}
              </span>
            )}
          </motion.div>
          <motion.p {...reveal(0.15)} className="mt-3 font-semibold text-ink">Build skills. Create projects. Get career-ready.</motion.p>

          {/* Phones and tablets: overall progress right under the title, so it is in the first screen. */}
          <motion.div {...reveal(0.15)} className="mt-5 flex items-center gap-4 lg:hidden">
            <RoadmapProgressRing value={overall.percentage} size={88} stroke={9} label="Overall roadmap progress" valueText={ringText}>
              <span className="font-display text-xl font-bold text-ink">{overall.percentage}%</span>
            </RoadmapProgressRing>
            <p className="min-w-0 flex-1 text-sm font-semibold text-ink" aria-live="polite">{journeyMessage(roadmap)}</p>
            <RoadmapIllustration semesters={roadmap.semesters} className="hidden max-w-[13rem] sm:block" />
          </motion.div>

          <motion.div {...reveal(0.2)} className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm font-semibold text-ink">
              <GoalIcon className="size-4 text-primary" aria-hidden="true" />
              Goal: {careerGoal.title}
              {careerGoal.source === 'suggested' && <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary-soft-fg">Suggested</span>}
            </span>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={onChangeGoal}>
              Change goal
            </Button>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-fg" title="Days in a row with campus activity (Campus Rankings)">
                <Flame className="size-4" aria-hidden="true" /> {streak}-day campus streak
              </span>
            )}
          </motion.div>

          <motion.dl {...reveal(0.25)} className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Milestones done" value={overall.completed} detail={`/ ${overall.required}`} />
            <Stat label={`Semester ${student.currentSemester}`} value={current.progress.completed} detail={`/ ${current.progress.required}`} />
            <Stat label="Still to go" value={overall.remaining} detail={overall.remaining === 1 ? 'milestone' : 'milestones'} />
            <Stat label="Semesters done" value={overall.semestersCompleted} detail={`/ ${student.totalSemesters}`} />
          </motion.dl>
        </div>

        <motion.div {...reveal(0.15)} className="hidden flex-col items-center gap-3 text-center lg:flex">
          <RoadmapProgressRing value={overall.percentage} size={148} stroke={12} label="Overall roadmap progress" valueText={ringText}>
            <span>
              <span className="block font-display text-4xl font-bold text-ink">{overall.percentage}%</span>
              <span className="block text-xs font-semibold text-ink-muted">complete</span>
            </span>
          </RoadmapProgressRing>
          <p className="max-w-[16rem] text-sm font-semibold text-ink" aria-live="polite">{journeyMessage(roadmap)}</p>
          <RoadmapIllustration semesters={roadmap.semesters} className="max-w-[16rem]" />
        </motion.div>
      </div>
    </section>
  );
}
