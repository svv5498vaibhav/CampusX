import { Info, ShieldAlert, ShieldX } from 'lucide-react';
import { cn } from '@/utils/cn';

const TONES = {
  review: { icon: ShieldAlert, className: 'border-sun-300/60 bg-accent-soft text-accent-fg' },
  removed: { icon: ShieldX, className: 'border-line bg-surface-muted text-ink-muted' },
  info: { icon: Info, className: 'border-primary/20 bg-primary-soft text-primary-soft-fg' },
};

/**
 * A calm Trust & Safety message: under review, removed, or plain information. Used by ModerationNotice,
 * the report form and the safety page; never alarming red.
 */
export function ContentWarning({ tone = 'info', title, children, action, className, ...props }) {
  const { icon: Icon, className: toneClass } = TONES[tone] ?? TONES.info;
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm', toneClass, className)} {...props}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('leading-relaxed', title && 'mt-0.5')}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
