import { useId } from 'react';
import { cn } from '@/utils/cn';
import { FormField, fieldClassName, getDescribedBy } from './FormField';

/** Text input with label, hint/error and optional left icon or right-side control (e.g. a toggle button). */
export function Input({
  id,
  label,
  hint,
  error,
  required,
  leftIcon: LeftIcon,
  rightElement,
  type = 'text',
  className,
  containerClassName,
  'aria-describedby': extraDescribedBy,
  ...props
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <FormField
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        {LeftIcon && (
          <LeftIcon
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
        )}
        <input
          id={inputId}
          type={type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={[getDescribedBy(inputId, { error, hint }), extraDescribedBy].filter(Boolean).join(' ') || undefined}
          className={cn(fieldClassName(Boolean(error)), 'h-11', LeftIcon && 'pl-10', rightElement && 'pr-12', className)}
          {...props}
        />
        {rightElement && <div className="absolute inset-y-0 right-1 flex items-center">{rightElement}</div>}
      </div>
    </FormField>
  );
}
