import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { SPRING, checkIn } from '@/utils/motion';

/**
 * One choice in a Theme Studio radio group: a live preview, the name and a description. The selected
 * card's highlight glides between cards (one `layoutId` per group) and its check mark pops in.
 */
export function ThemeOptionCard({ group, value, checked, onSelect, title, description, inUse = false, preview }) {
  return (
    <label
      data-theme-option={value}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 rounded-2xl border bg-surface p-2.5 transition-[border-color,box-shadow,transform] duration-200 ease-campus',
        'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus',
        checked ? 'border-primary/60 shadow-soft' : 'border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-soft motion-reduce:hover:translate-y-0',
      )}
    >
      <input type="radio" name={group} value={value} checked={checked} onChange={() => onSelect(value)} className="sr-only" />
      {checked && <motion.span layoutId={`${group}-selected`} transition={SPRING.selection} aria-hidden="true" className="pointer-events-none absolute -inset-px rounded-2xl ring-2 ring-primary" />}
      {preview}
      <span className="flex items-start gap-2 px-1 pb-1">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
            {title}
            {inUse && <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">In use</span>}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{description}</span>
        </span>
        <span
          aria-hidden="true"
          className={cn('grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-200', checked ? 'border-primary bg-primary text-primary-fg' : 'border-line-strong text-transparent')}
        >
          <AnimatePresence initial={false}>
            {checked && (
              <motion.span key="check" {...checkIn} className="grid place-items-center">
                <Check className="size-3.5" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </span>
    </label>
  );
}
