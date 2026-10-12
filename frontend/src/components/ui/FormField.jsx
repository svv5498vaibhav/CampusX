import { cn } from '@/utils/cn';

// Shared styling for text inputs and textareas.
export const fieldClassName = (hasError) =>
  cn(
    'w-full rounded-xl border bg-surface px-4 text-sm text-ink placeholder:text-ink-subtle',
    'transition-[border-color,box-shadow] duration-200',
    'focus-visible:outline-none focus:ring-4',
    'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70',
    // An invalid field stays red while focused, so the error is still obvious while fixing it.
    hasError
      ? 'border-danger focus:border-danger focus:ring-danger/15'
      : 'border-line-strong hover:border-ink-subtle focus:border-primary focus:ring-focus',
  );

export const getDescribedBy = (id, { error, hint }) => {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
};

/** Label + control + hint/error message, wired up for screen readers. */
export function FormField({ id, label, hint, error, required, className, children }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
          {required && (
            <span className="text-danger" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger-fg">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-ink-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
