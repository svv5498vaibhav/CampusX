import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BadgeCheck, Sparkles } from 'lucide-react';

const SHOWN = 8;

/**
 * Skill mastery from the roadmap itself: for each skill, how many of the milestones that teach it are
 * complete. Skills already on the student's profile are marked. Nothing here is estimated.
 */
export function SkillMastery({ skills }) {
  const reduceMotion = useReducedMotion();
  const [showAll, setShowAll] = useState(false);
  // Skills with progress first, then the rest in roadmap order.
  const ordered = [...skills].sort((a, b) => b.completed / b.total - a.completed / a.total);
  const visible = showAll ? ordered : ordered.slice(0, SHOWN);
  return (
    <section aria-labelledby="roadmap-skills-heading" className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <h2 id="roadmap-skills-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary-soft-fg">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        Skill mastery
      </h2>
      <p className="mt-1 text-xs text-ink-muted">Completed milestones that practise each skill.</p>
      <ul className="mt-4 flex flex-col gap-3">
        {visible.map((skill) => {
          const value = Math.round((skill.completed / skill.total) * 100);
          return (
            <li key={skill.name}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 font-semibold text-ink">
                  <span className="truncate">{skill.name}</span>
                  {skill.onProfile && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary" title="Listed on your profile">
                      <BadgeCheck className="size-3.5" aria-hidden="true" /> On profile
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-semibold text-ink-muted">{skill.completed}/{skill.total}</span>
              </div>
              <div role="progressbar" aria-label={`${skill.name} mastery`} aria-valuemin={0} aria-valuemax={skill.total} aria-valuenow={skill.completed} aria-valuetext={`${skill.completed} of ${skill.total} milestones`} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <motion.div className="h-full rounded-full bg-primary" initial={reduceMotion ? false : { width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }} />
              </div>
            </li>
          );
        })}
      </ul>
      {ordered.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll} className="mt-4 text-sm font-semibold text-primary hover:underline">
          {showAll ? 'Show fewer skills' : `Show all ${ordered.length} skills`}
        </button>
      )}
    </section>
  );
}
