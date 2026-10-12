import { Check, Circle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { PASSWORD_RULES } from '@/utils/validation';

/** Live checklist of password requirements, ticking off as the student types. */
export function PasswordChecklist({ password, id }) {
  return (
    <ul id={id} className="-mt-2 grid gap-1.5 text-xs sm:grid-cols-3" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const isMet = rule.test(password);
        const Icon = isMet ? Check : Circle;
        return (
          <li key={rule.id} className={cn('flex items-center gap-1.5', isMet ? 'font-semibold text-primary' : 'text-ink-subtle')}>
            <Icon className={isMet ? 'size-3.5' : 'size-3'} aria-hidden="true" />
            {rule.label}
            <span className="sr-only">{isMet ? '(met)' : '(not met yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
