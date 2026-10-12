import { useId } from 'react';
import { cn } from '@/utils/cn';
import { FormField, fieldClassName, getDescribedBy } from './FormField';

export function Textarea({
  id,
  label,
  hint,
  error,
  required,
  rows = 4,
  className,
  containerClassName,
  ...props
}) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <FormField
      id={textareaId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <textarea
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={getDescribedBy(textareaId, { error, hint })}
        className={cn(fieldClassName(Boolean(error)), 'resize-y py-3 leading-relaxed', className)}
        {...props}
      />
    </FormField>
  );
}
