import { motion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Circle } from 'lucide-react';
import { cn } from '@/utils/cn';

// What each missing item asks the student to do.
const ACTIONS = {
  name: 'Add your full name',
  college: 'Add your college',
  branch: 'Add your branch',
  semester: 'Add your semester',
  photo: 'Add a profile photo',
  bio: 'Write a short bio',
  skills: 'Add a skill you’re proud of',
  interests: 'Pick your interests',
};

/** Owner-only card: completeness from the API, with one-tap shortcuts for what's missing. */
export function ProfileCompletionCard({ completion, theme, onAction, className }) {
  const missing = completion.items.filter((item) => !item.done);

  return (
    <section aria-labelledby="profile-completeness" className={cn('rounded-3xl border p-5 transition-colors duration-300', theme.card, className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="profile-completeness" className="font-display text-base font-bold text-ink">
          Profile completeness
        </h2>
        <span className="font-display text-2xl font-extrabold text-primary">{completion.percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Profile completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completion.percent}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${completion.percent}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {completion.isComplete ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary">
          <BadgeCheck className="size-5" aria-hidden="true" />
          Your profile is complete. Looking good!
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-1">
          {missing.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onAction?.(item.id)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-muted"
              >
                <Circle className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                <span className="flex-1">{ACTIONS[item.id] ?? item.label}</span>
                <ArrowRight className="size-4 text-ink-subtle" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
