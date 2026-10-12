import { cn } from '@/utils/cn';

const VARIANTS = {
  neutral: 'bg-surface-muted text-ink-muted',
  primary: 'bg-primary-soft text-primary-soft-fg',
  accent: 'bg-accent-soft text-accent-fg',
  danger: 'bg-danger-soft text-danger-fg',
  outline: 'border border-line-strong text-ink-muted',
};

export function Badge({ variant = 'neutral', icon: Icon, className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}
