import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/cn';

const VARIANTS = {
  danger: { icon: TriangleAlert, className: 'bg-danger-soft text-danger-fg' },
  success: { icon: CircleCheck, className: 'bg-primary-soft text-primary-soft-fg' },
  info: { icon: Info, className: 'bg-surface-muted text-ink-muted' },
};

/** Inline message banner. Danger alerts are announced to screen readers immediately. */
export function Alert({ variant = 'info', title, children, className }) {
  const { icon: Icon, className: variantClassName } = VARIANTS[variant];

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-2xl px-4 py-3 text-sm leading-relaxed', variantClassName, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}
