import { useEffect, useRef } from 'react';
import { Alert } from '@/components/ui';

/**
 * Shared step frame: icon, heading, description, and the step's error. The heading takes focus
 * when a step opens, so keyboard and screen-reader users land on the new question.
 */
export function OnboardingStep({ icon: Icon, title, description, error, children }) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg">
            <Icon className="size-6" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-bold tracking-tight text-balance text-ink outline-none sm:text-3xl">
            {title}
          </h1>
          {description && <p className="mt-1.5 text-sm leading-relaxed text-pretty text-ink-muted sm:text-base">{description}</p>}
        </div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {children}
    </div>
  );
}
