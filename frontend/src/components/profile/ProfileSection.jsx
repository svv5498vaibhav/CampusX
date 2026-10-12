import { useId } from 'react';
import { cn } from '@/utils/cn';

/** A themed profile card with an icon heading. */
export function ProfileSection({ icon: Icon, title, theme, action, headingAs: Heading = 'h2', className, children }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={cn('rounded-3xl border p-5 transition-colors duration-300 @xl:p-6', theme.card, className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Heading id={headingId} className="flex items-center gap-2.5 font-display text-lg font-bold text-ink">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-300', theme.icon)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          {title}
        </Heading>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Skill / interest chips in the profile's style. */
export function TagList({ items, theme }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item}>
          <span className={cn('inline-flex rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors duration-300', theme.chip)}>
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}
