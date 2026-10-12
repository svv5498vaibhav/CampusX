import { cn } from '@/utils/cn';

/**
 * Campus gate with an X inside: the CampusX mark. `inverse` is for the brand-green auth
 * panel; it only inverts in light mode because that panel turns deep green in dark mode.
 */
export function LogoMark({ className, inverse = false }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('size-8 shrink-0', className)} aria-hidden="true">
      <rect width="32" height="32" rx="10" className={inverse ? 'fill-primary-fg dark:fill-primary' : 'fill-primary'} />
      <g className={inverse ? 'stroke-primary dark:stroke-primary-fg' : 'stroke-primary-fg'} strokeWidth="2.4" strokeLinecap="round">
        <path d="M9 24v-8a7 7 0 0 1 14 0v8" />
        <path d="m13.5 16.5 5 5m0-5-5 5" />
      </g>
    </svg>
  );
}

export function Logo({ className, wordmarkClassName }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span
        className={cn(
          'font-display text-xl font-extrabold tracking-tight text-ink',
          wordmarkClassName,
        )}
      >
        Campus<span className="text-primary">X</span>
      </span>
    </span>
  );
}
