import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Large, touch-friendly radio option. A real (visually hidden) radio input keeps native
 * keyboard behaviour: Tab into the group, arrow keys to move between options.
 * Selection is shown by the tick as well as colour.
 *   variant="row"  full-width option with title + description
 *   variant="tile" compact centred tile (e.g. semesters)
 */
export function ChoiceCard({ name, value, checked, onChange, title, description, variant = 'row' }) {
  const isTile = variant === 'tile';

  return (
    <label
      className={cn(
        'relative flex cursor-pointer rounded-2xl border bg-surface transition-[border-color,background-color,box-shadow,transform] duration-200 active:scale-[0.98]',
        'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus',
        isTile ? 'min-h-24 flex-col items-center justify-center gap-0.5 px-2 pt-6 pb-3 text-center' : 'min-h-16 items-center gap-3.5 p-4',
        checked
          ? 'border-primary bg-primary-soft shadow-soft'
          : 'border-line hover:border-line-strong hover:bg-surface-muted',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center rounded-full border-2 transition-colors',
          isTile ? 'absolute top-2 right-2 size-4' : 'size-5',
          checked ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong bg-surface',
        )}
      >
        {checked && <Check className={isTile ? 'size-2.5' : 'size-3'} strokeWidth={3.5} />}
      </span>
      <span className={cn('min-w-0', !isTile && 'flex-1')}>
        <span className={cn('block font-semibold text-ink', isTile ? 'font-display text-2xl' : 'text-sm leading-snug')}>
          {title}
        </span>
        {description && (
          <span className={cn('block text-ink-subtle', isTile ? 'text-[11px] font-medium' : 'mt-0.5 text-xs')}>{description}</span>
        )}
      </span>
    </label>
  );
}
