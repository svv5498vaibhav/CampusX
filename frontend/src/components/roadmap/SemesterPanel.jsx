import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MilestoneCard } from './MilestoneCard';
import { SemesterCompletionCelebration } from './SemesterCompletionCelebration';
import { SemesterOverviewCard } from './SemesterOverviewCard';

const EASE = [0.22, 1, 0.36, 1];

// Moving forward, the next semester slides in from the right (backward: from the left); the old one
// scales down slightly and fades. Milestones follow with a short stagger. Reduced motion: a quick fade only.
const panel = {
  enter: ({ direction, reduce }) => (reduce ? { opacity: 0 } : { opacity: 0, x: direction * 48 }),
  center: ({ reduce }) => ({ opacity: 1, x: 0, scale: 1, transition: { duration: reduce ? 0 : 0.38, ease: EASE, staggerChildren: reduce ? 0 : 0.06, delayChildren: reduce ? 0 : 0.05 } }),
  exit: ({ direction, reduce }) => (reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: direction * -28, scale: 0.97, transition: { duration: 0.2, ease: EASE } }),
};
const item = {
  enter: ({ reduce }) => (reduce ? { opacity: 0 } : { opacity: 0, y: 14 }),
  center: ({ reduce }) => ({ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.32, ease: EASE } }),
};

/** One semester's overview, completion moment and milestones, with the semester-to-semester transition. */
export function SemesterPanel({ semester, direction, totalSemesters, pending, lastChange, focusRequest, celebration, onSetStatus, onSelect, onDismissCelebration }) {
  const reduce = Boolean(useReducedMotion());
  const custom = { direction, reduce };
  const required = semester.milestones.filter((milestone) => milestone.required);
  const optional = semester.milestones.filter((milestone) => !milestone.required);
  const list = (milestones, label) =>
    milestones.length > 0 && (
      <div>
        <h3 className="mb-3 text-sm font-bold text-ink-muted">{label}</h3>
        <ol className="flex flex-col gap-3">
          {milestones.map((milestone) => (
            <motion.li key={milestone.id} variants={item} custom={custom}>
              <MilestoneCard milestone={milestone} pending={pending[milestone.id]} lastChange={lastChange} focusRequest={focusRequest} onSetStatus={onSetStatus} />
            </motion.li>
          ))}
        </ol>
      </div>
    );

  const content = (
    <motion.div key={semester.semester} custom={custom} variants={panel} initial={reduce ? false : 'enter'} animate="center" exit="exit" className="flex flex-col gap-5" data-semester-panel={semester.semester}>
      <motion.div variants={item} custom={custom}>
        <SemesterOverviewCard semester={semester} />
      </motion.div>
      <AnimatePresence>
        {celebration?.semester === semester.semester && (
          <SemesterCompletionCelebration
            key={celebration.at}
            semester={semester.semester}
            totalSemesters={totalSemesters}
            onDismiss={onDismissCelebration}
            onExploreNext={() => {
              onDismissCelebration();
              onSelect(semester.semester + 1);
            }}
          />
        )}
      </AnimatePresence>
      {list(required, `Milestones (${required.length})`)}
      {list(optional, `Optional extras (${optional.length})`)}
    </motion.div>
  );

  return (
    <div id="roadmap-semester-panel" role="tabpanel" aria-labelledby={`roadmap-tab-${semester.semester}`} className="min-w-0">
      {/* Reduced motion: the new semester replaces the old one in the same frame. */}
      {reduce ? (
        content
      ) : (
        <AnimatePresence mode="wait" initial={false} custom={custom}>
          {content}
        </AnimatePresence>
      )}
    </div>
  );
}
