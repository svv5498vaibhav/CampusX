import { LoaderCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

const SIZES = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-9',
};

/** Spinner. `centered` fills the available area, e.g. while a page chunk loads. */
export function Loader({ size = 'md', label = 'Loading', centered = false, className }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-3 text-ink-muted',
        centered && 'min-h-[50vh] w-full',
        className,
      )}
    >
      <LoaderCircle className={cn('animate-spin text-primary', SIZES[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
