import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { FormField, fieldClassName, getDescribedBy } from './FormField';

/** Native select with the same label/hint/error treatment as Input. options: [{ value, label }] */
export function Select({ id, label, hint, error, options, placeholder, className, containerClassName, ...props }) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <FormField id={selectId} label={label} hint={hint} error={error} className={containerClassName}>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={getDescribedBy(selectId, { error, hint })}
          className={cn(fieldClassName(Boolean(error)), 'h-11 appearance-none pr-10', className)}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
      </div>
    </FormField>
  );
}
